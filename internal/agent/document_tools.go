package agent

import (
	"context"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// resolveToolPath resolves a (possibly relative) tool path against the
// workspace root and validates it stays inside the sandbox.
func resolveToolPath(workspaceRoot, path string) (string, error) {
	if path == "" {
		return "", fmt.Errorf("'path' is required")
	}
	abs := path
	if !filepath.IsAbs(abs) {
		abs = filepath.Join(workspaceRoot, path)
	}
	if err := ValidateSandboxedPath(abs, workspaceRoot); err != nil {
		return "", err
	}
	if err := os.MkdirAll(filepath.Dir(abs), 0755); err != nil {
		return "", err
	}
	return abs, nil
}

// flexibleJSONArg decodes an argument that may arrive as structured JSON or as
// a JSON-encoded string (LLMs sometimes double-encode).
func flexibleJSONArg(args map[string]interface{}, key string, out interface{}) error {
	raw, ok := args[key]
	if !ok || raw == nil {
		return fmt.Errorf("'%s' is required", key)
	}
	switch v := raw.(type) {
	case string:
		if err := json.Unmarshal([]byte(v), out); err != nil {
			return fmt.Errorf("'%s' is not valid JSON: %v", key, err)
		}
	default:
		b, _ := json.Marshal(v)
		if err := json.Unmarshal(b, out); err != nil {
			return fmt.Errorf("'%s' could not be decoded: %v", key, err)
		}
	}
	return nil
}

// DocumentTools exposes native .docx / .xlsx / .pptx generation and reading.
// Pure Go (stdlib archive/zip + OOXML) — no pandoc, LibreOffice, or network.
func DocumentTools(workspaceRoot string) map[string]ToolDef {
	return map[string]ToolDef{
		"docx_create": {
			Name:        "docx_create",
			Description: "Creates a real .docx Word document from markdown-lite text (# / ## / ### headings, - bullets, **bold**, *italic*). Returns the written path.",
			Signature:   `{"path": "string", "content": "string (markdown-lite)"}`,
			Category:    "Documents",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				path, _ := args["path"].(string)
				content, _ := args["content"].(string)
				abs, err := resolveToolPath(workspaceRoot, path)
				if err != nil {
					return "error: " + err.Error()
				}
				if strings.TrimSpace(content) == "" {
					return "error: 'content' is required"
				}
				if !strings.HasSuffix(strings.ToLower(abs), ".docx") {
					abs += ".docx"
				}
				if err := writeZip(abs, buildDocx(content)); err != nil {
					return "error writing docx: " + err.Error()
				}
				return fmt.Sprintf("Created %s (%d bytes). Open it directly in Word, Google Docs, or LibreOffice.", abs, fileSizeOrZero(abs))
			},
		},
		"docx_read": {
			Name:        "docx_read",
			Description: "Reads a .docx file and returns its full text content (paragraph per line) so it can be reviewed or edited.",
			Signature:   `{"path": "string"}`,
			Category:    "Documents",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				path, _ := args["path"].(string)
				abs, err := resolveToolPath(workspaceRoot, path)
				if err != nil {
					return "error: " + err.Error()
				}
				data, err := readZipFile(abs, "word/document.xml")
				if err != nil {
					return "error reading docx: " + err.Error()
				}
				text := docxXMLToText(data)
				if text == "" {
					return "(document is empty)"
				}
				return text
			},
		},
		"docx_append": {
			Name:        "docx_append",
			Description: "Appends markdown-lite content to the end of an existing .docx file (before the section properties), preserving everything already inside.",
			Signature:   `{"path": "string", "content": "string (markdown-lite)"}`,
			Category:    "Documents",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				path, _ := args["path"].(string)
				content, _ := args["content"].(string)
				abs, err := resolveToolPath(workspaceRoot, path)
				if err != nil {
					return "error: " + err.Error()
				}
				if strings.TrimSpace(content) == "" {
					return "error: 'content' is required"
				}
				original, err := readZipFile(abs, "word/document.xml")
				if err != nil {
					return "error reading docx: " + err.Error()
				}
				doc := string(original)
				anchor := "<w:sectPr>"
				idx := strings.LastIndex(doc, anchor)
				if idx < 0 {
					return "error: document.xml has no sectPr anchor; regenerate the file with docx_create instead"
				}
				updated := doc[:idx] + markdownToDocxBody(content) + doc[idx:]
				if err := rewriteZip(abs, "word/document.xml", []byte(updated)); err != nil {
					return "error writing docx: " + err.Error()
				}
				return fmt.Sprintf("Appended %d characters to %s.", len(content), abs)
			},
		},
		"xlsx_create": {
			Name:        "xlsx_create",
			Description: "Creates a real .xlsx workbook. Pass `data` for a single sheet or `sheets` for multiple: {\"sheets\":[{\"name\":\"Q1\",\"rows\":[[\"Item\",\"Qty\"],[\"Widget\",10]]}]}. Strings and numbers are detected automatically.",
			Signature:   `{"path": "string", "data": "array of rows (optional)", "sheets": "array of {name, rows} (optional)"}`,
			Category:    "Documents",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				path, _ := args["path"].(string)
				abs, err := resolveToolPath(workspaceRoot, path)
				if err != nil {
					return "error: " + err.Error()
				}
				if !strings.HasSuffix(strings.ToLower(abs), ".xlsx") {
					abs += ".xlsx"
				}

				var sheets []xlsxSheet
				if _, has := args["sheets"]; has {
					var parsed []struct {
						Name string          `json:"name"`
						Rows [][]interface{} `json:"rows"`
					}
					if err := flexibleJSONArg(args, "sheets", &parsed); err != nil {
						return "error: " + err.Error()
					}
					for _, s := range parsed {
						name := s.Name
						if name == "" {
							name = fmt.Sprintf("Sheet%d", len(sheets)+1)
						}
						sheets = append(sheets, xlsxSheet{Name: name, Rows: stringifyRows(s.Rows)})
					}
				} else {
					var rows [][]interface{}
					if err := flexibleJSONArg(args, "data", &rows); err != nil {
						return "error: provide either 'data' (rows) or 'sheets'"
					}
					sheets = []xlsxSheet{{Name: "Sheet1", Rows: stringifyRows(rows)}}
				}
				if len(sheets) == 0 {
					return "error: no sheet data provided"
				}

				if err := writeZip(abs, buildXlsx(sheets)); err != nil {
					return "error writing xlsx: " + err.Error()
				}
				total := 0
				for _, s := range sheets {
					total += len(s.Rows)
				}
				return fmt.Sprintf("Created %s — %d sheet(s), %d rows total.", abs, len(sheets), total)
			},
		},
		"xlsx_read": {
			Name:        "xlsx_read",
			Description: "Reads the first (or named) worksheet of an .xlsx file and returns rows as tab-separated text, inline strings and numbers included.",
			Signature:   `{"path": "string", "sheet": "string (optional sheet name)"}`,
			Category:    "Documents",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				path, _ := args["path"].(string)
				sheetName, _ := args["sheet"].(string)
				abs, err := resolveToolPath(workspaceRoot, path)
				if err != nil {
					return "error: " + err.Error()
				}

				wb, err := readZipFile(abs, "xl/workbook.xml")
				if err != nil {
					return "error reading xlsx: " + err.Error()
				}
				sheetFile, err := resolveXlsxSheetFile(abs, string(wb), sheetName)
				if err != nil {
					return "error: " + err.Error()
				}
				data, err := readZipFile(abs, sheetFile)
				if err != nil {
					return "error reading sheet: " + err.Error()
				}
				out := xlsxSheetToTSV(string(data))
				if out == "" {
					return "(sheet is empty)"
				}
				return out
			},
		},
		"pptx_create": {
			Name:        "pptx_create",
			Description: "Creates a native .pptx presentation from a slide outline: {\"slides\":[{\"title\":\"...\",\"bullets\":[\"...\",\"...\"]}]}. No PowerPoint installation required.",
			Signature:   `{"path": "string", "slides": "array of {title, bullets[]}"}`,
			Category:    "Documents",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				path, _ := args["path"].(string)
				abs, err := resolveToolPath(workspaceRoot, path)
				if err != nil {
					return "error: " + err.Error()
				}
				if !strings.HasSuffix(strings.ToLower(abs), ".pptx") {
					abs += ".pptx"
				}
				var parsed []struct {
					Title   string    `json:"title"`
					Bullets []string  `json:"bullets"`
					Notes   string    `json:"notes"`
				}
				if err := flexibleJSONArg(args, "slides", &parsed); err != nil {
					return "error: " + err.Error()
				}
				if len(parsed) == 0 {
					return "error: 'slides' must contain at least one slide"
				}
				slides := make([]pptxSlide, 0, len(parsed))
				for _, s := range parsed {
					slides = append(slides, pptxSlide{Title: s.Title, Bullets: s.Bullets})
				}
				if err := writeZip(abs, buildPptx(slides)); err != nil {
					return "error writing pptx: " + err.Error()
				}
				return fmt.Sprintf("Created %s — %d slides. Open it in PowerPoint, Google Slides, or LibreOffice Impress.", abs, len(slides))
			},
		},
	}
}

// VisualTools renders images and interactive slide decks fully offline.
func VisualTools(workspaceRoot string) map[string]ToolDef {
	return map[string]ToolDef{
		"image_generate": {
			Name:        "image_generate",
			Description: "Generates a vector image (.svg) offline. Variants: 'poster' (title + subtitle hero), 'card' (title + bullet points), 'chart' (bar chart from items [{label,value}]). Deterministic and crisp at any size.",
			Signature:   `{"path": "string", "variant": "poster|card|chart", "title": "string", "subtitle": "string", "items": "array of {label, value}", "palette": "violet|ocean|forest|sunset|mono"}`,
			Category:    "Visual",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				path, _ := args["path"].(string)
				variant, _ := args["variant"].(string)
				if variant == "" {
					variant = "poster"
				}
				title, _ := args["title"].(string)
				subtitle, _ := args["subtitle"].(string)
				palette, _ := args["palette"].(string)

				abs, err := resolveToolPath(workspaceRoot, path)
				if err != nil {
					return "error: " + err.Error()
				}
				if !strings.HasSuffix(strings.ToLower(abs), ".svg") {
					abs += ".svg"
				}

				var items []visualItem
				if _, has := args["items"]; has {
					if err := flexibleJSONArg(args, "items", &items); err != nil {
						return "error: " + err.Error()
					}
				}

				svg, err := renderSVG(variant, title, subtitle, items, palette)
				if err != nil {
					return "error: " + err.Error()
				}
				if err := os.WriteFile(abs, []byte(svg), 0644); err != nil {
					return "error writing image: " + err.Error()
				}
				return fmt.Sprintf("Generated %s (%s variant, %d bytes). Vector output — crisp at any size.", abs, variant, fileSizeOrZero(abs))
			},
		},
		"slides_create": {
			Name:        "slides_create",
			Description: "Creates a self-contained interactive .deck.html presentation following the Open Design Swiss spec (1920×1080 stage, 16-column grid, hairline borders, keyboard navigation). Pure HTML — viewable in any browser, no dependencies.",
			Signature:   `{"path": "string", "title": "string", "slides": "array of {title, bullets[]}"}`,
			Category:    "Visual",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				path, _ := args["path"].(string)
				deckTitle, _ := args["title"].(string)
				abs, err := resolveToolPath(workspaceRoot, path)
				if err != nil {
					return "error: " + err.Error()
				}
				if !strings.HasSuffix(strings.ToLower(abs), ".html") {
					abs += ".html"
				}
				var parsed []deckSlide
				if err := flexibleJSONArg(args, "slides", &parsed); err != nil {
					return "error: " + err.Error()
				}
				if len(parsed) == 0 {
					return "error: 'slides' must contain at least one slide"
				}
				html := buildDeckHTML(deckTitle, parsed)
				if err := os.WriteFile(abs, []byte(html), 0644); err != nil {
					return "error writing deck: " + err.Error()
				}
				return fmt.Sprintf("Created %s — %d slides. Open in a browser; use ←/→ keys to navigate.", abs, len(parsed))
			},
		},
	}
}

// MotionTools scaffolds programmatic video projects (Remotion & HyperFrames).
func MotionTools(workspaceRoot string) map[string]ToolDef {
	return map[string]ToolDef{
		"motion_remotion": {
			Name:        "motion_remotion",
			Description: "Scaffolds a complete Remotion (React video) project: package.json, tsconfig, Root.tsx and an animated Composition from a scene list. Render to MP4 with `npx remotion render src/index.ts <CompositionID> out.mp4`.",
			Signature:   `{"path": "string (project directory)", "title": "string", "scenes": "array of {text, durationInFrames}", "fps": "int (default 30)", "width": "int (default 1920)", "height": "int (default 1080)"}`,
			Category:    "Motion",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				path, _ := args["path"].(string)
				abs, err := resolveToolPath(workspaceRoot, path)
				if err != nil {
					return "error: " + err.Error()
				}
				var spec struct {
					Title  string        `json:"title"`
					Scenes []motionScene `json:"scenes"`
					FPS    int           `json:"fps"`
					Width  int           `json:"width"`
					Height int           `json:"height"`
				}
				// Accept flattened args (scenes as sibling of path).
				raw, _ := json.Marshal(args)
				_ = json.Unmarshal(raw, &spec)
				if spec.Title == "" {
					spec.Title = filepath.Base(abs)
				}
				if len(spec.Scenes) == 0 {
					return "error: 'scenes' must contain at least one scene {text, durationInFrames}"
				}
				if spec.FPS <= 0 {
					if f, ok := args["fps"].(float64); ok && f > 0 {
						spec.FPS = int(f)
					} else {
						spec.FPS = 30
					}
				}
				if spec.Width <= 0 {
					spec.Width = 1920
				}
				if spec.Height <= 0 {
					spec.Height = 1080
				}

				files := buildRemotionProject(spec.Title, spec.Scenes, spec.FPS, spec.Width, spec.Height)
				for name, data := range files {
					target := filepath.Join(abs, name)
					if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
						return "error: " + err.Error()
					}
					if err := os.WriteFile(target, data, 0644); err != nil {
						return "error writing project file: " + err.Error()
					}
				}
				totalFrames := 0
				for _, s := range spec.Scenes {
					if s.DurationInFrames > 0 {
						totalFrames += s.DurationInFrames
					} else {
						totalFrames += 90
					}
				}
				return fmt.Sprintf("Scaffolded Remotion project at %s — %d scenes, ~%d frames (%.1fs @ %dfps). Render: cd %s && npm install && npx remotion render src/index.ts Main out.mp4",
					abs, len(spec.Scenes), totalFrames, float64(totalFrames)/float64(spec.FPS), spec.FPS, abs)
			},
		},
		"motion_hyperframe": {
			Name:        "motion_hyperframe",
			Description: "Generates a single-file HyperFrames .motion.html animation (1920×1080 stage, GSAP master timeline loaded from CDN) from a scene list. Render to MP4 with the bundled open-design-hyperframes renderer (node skills/19-open-design-hyperframes/tools/render_motion.js).",
			Signature:   `{"path": "string", "title": "string", "scenes": "array of {text, durationSeconds}", "accent": "hex color (optional)"}`,
			Category:    "Motion",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				path, _ := args["path"].(string)
				abs, err := resolveToolPath(workspaceRoot, path)
				if err != nil {
					return "error: " + err.Error()
				}
				if !strings.HasSuffix(strings.ToLower(abs), ".html") {
					abs += ".html"
				}
				var spec struct {
					Title  string       `json:"title"`
					Accent string       `json:"accent"`
					Scenes []hyperScene `json:"scenes"`
				}
				raw, _ := json.Marshal(args)
				_ = json.Unmarshal(raw, &spec)
				if spec.Title == "" {
					spec.Title = "HyperFrames Motion"
				}
				if len(spec.Scenes) == 0 {
					return "error: 'scenes' must contain at least one scene {text, durationSeconds}"
				}
				if err := os.WriteFile(abs, []byte(buildHyperframeHTML(spec.Title, spec.Accent, spec.Scenes)), 0644); err != nil {
					return "error writing motion html: " + err.Error()
				}
				total := 0.0
				for _, s := range spec.Scenes {
					if s.DurationSeconds > 0 {
						total += s.DurationSeconds
					} else {
						total += 3
					}
				}
				return fmt.Sprintf("Generated %s — %d scenes, %.1fs total. Preview in a browser, or render: node skills/19-open-design-hyperframes/tools/render_motion.js --input=%s --output=motion.mp4",
					abs, len(spec.Scenes), total, abs)
			},
		},
	}
}

// ---- shared helpers --------------------------------------------------------

func fileSizeOrZero(path string) int64 {
	fi, err := os.Stat(path)
	if err != nil {
		return 0
	}
	return fi.Size()
}

// stringifyRows converts loose JSON rows (mixed types) into string cells.
func stringifyRows(rows [][]interface{}) [][]string {
	out := make([][]string, 0, len(rows))
	for _, r := range rows {
		cells := make([]string, 0, len(r))
		for _, c := range r {
			switch v := c.(type) {
			case nil:
				cells = append(cells, "")
			case string:
				cells = append(cells, v)
			case float64:
				if v == float64(int64(v)) {
					cells = append(cells, fmt.Sprintf("%d", int64(v)))
				} else {
					cells = append(cells, fmt.Sprintf("%g", v))
				}
			case bool:
				if v {
					cells = append(cells, "TRUE")
				} else {
					cells = append(cells, "FALSE")
				}
			default:
				b, _ := json.Marshal(v)
				cells = append(cells, string(b))
			}
		}
		out = append(out, cells)
	}
	return out
}

// resolveXlsxSheetFile maps a sheet name (or empty for the first sheet) to its
// worksheet part path by resolving the workbook relationship targets.
func resolveXlsxSheetFile(zipPath, workbookXML, sheetName string) (string, error) {
	type sheetEntry struct {
		Name string `xml:"name,attr"`
		RID  string `xml:"http://schemas.openxmlformats.org/officeDocument/2006/relationships id,attr"`
	}
	var wb struct {
		Sheets []sheetEntry `xml:"sheets>sheet"`
	}
	if err := xml.Unmarshal([]byte(workbookXML), &wb); err != nil {
		return "", fmt.Errorf("invalid workbook: %v", err)
	}
	if len(wb.Sheets) == 0 {
		return "", fmt.Errorf("workbook has no sheets")
	}
	choose := wb.Sheets[0]
	if sheetName != "" {
		found := false
		names := make([]string, 0, len(wb.Sheets))
		for _, s := range wb.Sheets {
			names = append(names, s.Name)
			if strings.EqualFold(s.Name, sheetName) {
				choose = s
				found = true
			}
		}
		if !found {
			return "", fmt.Errorf("sheet %q not found; available: %s", sheetName, strings.Join(names, ", "))
		}
	}

	// Resolve the relationship id -> target via the workbook rels part.
	relsRaw, err := readZipFile(zipPath, "xl/_rels/workbook.xml.rels")
	if err != nil {
		return "", fmt.Errorf("missing workbook rels: %v", err)
	}
	type relEntry struct {
		ID     string `xml:"Id,attr"`
		Target string `xml:"Target,attr"`
	}
	var rels struct {
		Relationships []relEntry `xml:"Relationship"`
	}
	if err := xml.Unmarshal(relsRaw, &rels); err != nil {
		return "", fmt.Errorf("invalid workbook rels: %v", err)
	}
	for _, rel := range rels.Relationships {
		if rel.ID == choose.RID {
			target := strings.TrimPrefix(rel.Target, "/xl/")
			target = strings.TrimPrefix(target, "/")
			if !strings.HasPrefix(target, "xl/") {
				target = "xl/" + target
			}
			return target, nil
		}
	}
	// Fallback: conventional naming
	return "xl/worksheets/sheet" + strings.TrimPrefix(choose.RID, "rId") + ".xml", nil
}

// xlsxSheetToTSV converts sheet XML into tab-separated text using inline
// strings and numeric values.
func xlsxSheetToTSV(sheetXML string) string {
	type cell struct {
		Ref string `xml:"r,attr"`
		T   string `xml:"t,attr"`
		V   string `xml:"v"`
		Is  struct {
			T string `xml:"t"`
		} `xml:"is"`
	}
	type row struct {
		Cells []cell `xml:"c"`
	}
	var sh struct {
		Rows []row `xml:"sheetData>row"`
	}
	if err := xml.Unmarshal([]byte(sheetXML), &sh); err != nil {
		return ""
	}
	lines := make([]string, 0, len(sh.Rows))
	for _, r := range sh.Rows {
		cells := make([]string, 0, len(r.Cells))
		for _, c := range r.Cells {
			if c.T == "inlineStr" {
				cells = append(cells, c.Is.T)
			} else {
				cells = append(cells, c.V)
			}
		}
		lines = append(lines, strings.Join(cells, "\t"))
	}
	return strings.Join(lines, "\n")
}

// visualItem is one labeled data point for chart generation.
type visualItem struct {
	Label string  `json:"label"`
	Value float64 `json:"value"`
}
