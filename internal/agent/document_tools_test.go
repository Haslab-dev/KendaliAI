package agent

import (
	"archive/zip"
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDocumentToolsRoundtrip(t *testing.T) {
	dir := t.TempDir()
	tools := DocumentTools(dir)
	ctx := context.Background()

	call := func(name string, args map[string]interface{}) string {
		tool, ok := tools[name]
		if !ok {
			t.Fatalf("tool %s not registered", name)
		}
		return tool.Execute(ctx, args)
	}

	// DOCX create + read
	docxPath := filepath.Join(dir, "report.docx")
	out := call("docx_create", map[string]interface{}{
		"path": docxPath,
		"content": "# Quarterly Report\n\n## Highlights\n- Revenue grew **42%**\n- Churn dropped\n\n1. First point\n2. Second point\n\nPlain *italic* paragraph.",
	})
	if !strings.Contains(out, "Created") {
		t.Fatalf("docx_create failed: %s", out)
	}
	f, err := os.Open(docxPath)
	if err != nil {
		t.Fatal(err)
	}
	info, err := f.Stat()
	f.Close()
	if err != nil || info.Size() == 0 {
		t.Fatal("docx file missing or empty")
	}
	textOut := call("docx_read", map[string]interface{}{"path": docxPath})
	for _, want := range []string{"Quarterly Report", "Highlights", "Revenue grew", "First point"} {
		if !strings.Contains(textOut, want) {
			t.Fatalf("docx_read missing %q in:\n%s", want, textOut)
		}
	}
	// docx_append keeps old content and adds new
	appended := call("docx_append", map[string]interface{}{"path": docxPath, "content": "## Appendix\n- Extra item"})
	if !strings.Contains(appended, "Appended") {
		t.Fatalf("docx_append failed: %s", appended)
	}
	textOut = call("docx_read", map[string]interface{}{"path": docxPath})
	if !strings.Contains(textOut, "Appendix") || !strings.Contains(textOut, "Quarterly Report") {
		t.Fatalf("docx_append lost content:\n%s", textOut)
	}

	// XLSX create multi-sheet + read roundtrip
	xlsxPath := filepath.Join(dir, "book.xlsx")
	out = call("xlsx_create", map[string]interface{}{
		"path": xlsxPath,
		"sheets": []interface{}{
			map[string]interface{}{
				"name": "Sales",
				"rows": []interface{}{
					[]interface{}{"Item", "Qty"},
					[]interface{}{"Widget", float64(10)},
					[]interface{}{"Gadget", float64(2.5)},
				},
			},
			map[string]interface{}{
				"name": "Notes",
				"rows": []interface{}{[]interface{}{"hello", "world"}},
			},
		},
	})
	if !strings.Contains(out, "Created") {
		t.Fatalf("xlsx_create failed: %s", out)
	}
	read := call("xlsx_read", map[string]interface{}{"path": xlsxPath})
	for _, want := range []string{"Item\tQty", "Widget\t10", "Gadget\t2.5"} {
		if !strings.Contains(read, want) {
			t.Fatalf("xlsx_read missing %q in:\n%s", want, read)
		}
	}
	// Named sheet access
	readNotes := call("xlsx_read", map[string]interface{}{"path": xlsxPath, "sheet": "Notes"})
	if !strings.Contains(readNotes, "hello\tworld") {
		t.Fatalf("xlsx_read(Notes) missing data in:\n%s", readNotes)
	}

	// PPTX create with 3 slides
	pptxPath := filepath.Join(dir, "deck.pptx")
	out = call("pptx_create", map[string]interface{}{
		"path": pptxPath,
		"slides": []interface{}{
			map[string]interface{}{"title": "Vision", "bullets": []interface{}{"Fast", "Local"}},
			map[string]interface{}{"title": "Plan", "bullets": []interface{}{"Ship"}},
			map[string]interface{}{"title": "Thanks"},
		},
	})
	if !strings.Contains(out, "Created") {
		t.Fatalf("pptx_create failed: %s", out)
	}
	assertZipMembers(t, pptxPath, []string{
		"[Content_Types].xml",
		"_rels/.rels",
		"ppt/presentation.xml",
		"ppt/slides/slide1.xml",
		"ppt/slides/slide3.xml",
		"ppt/slideMasters/slideMaster1.xml",
		"ppt/theme/theme1.xml",
	})
	presXML := readZipMember(t, pptxPath, "ppt/presentation.xml")
	for _, want := range []string{"sldMasterIdLst", "r:id=\"rId2\"", "sldSz"} {
		if !strings.Contains(presXML, want) {
			t.Fatalf("presentation.xml missing %q:\n%s", want, presXML)
		}
	}
	presRels := readZipMember(t, pptxPath, "ppt/_rels/presentation.xml.rels")
	for _, want := range []string{"slides/slide1.xml", "slides/slide3.xml", "slideMasters/slideMaster1.xml"} {
		if !strings.Contains(presRels, want) {
			t.Fatalf("presentation rels missing %q:\n%s", want, presRels)
		}
	}
	slide1 := readZipMember(t, pptxPath, "ppt/slides/slide1.xml")
	for _, want := range []string{"Vision", "Fast", "masterClrMapping"} {
		if !strings.Contains(slide1, want) {
			t.Fatalf("slide1.xml missing %q:\n%s", want, slide1)
		}
	}
}

func TestVisualAndMotionTools(t *testing.T) {
	dir := t.TempDir()
	ctx := context.Background()

	visual := VisualTools(dir)
	out := visual["image_generate"].Execute(ctx, map[string]interface{}{
		"path":     filepath.Join(dir, "hero.svg"),
		"variant":  "poster",
		"title":    "Launch Day",
		"subtitle": "Everything ships today",
		"palette":  "ocean",
	})
	if !strings.Contains(out, "Generated") {
		t.Fatalf("image_generate poster failed: %s", out)
	}
	svg, err := os.ReadFile(filepath.Join(dir, "hero.svg"))
	if err != nil || !strings.Contains(string(svg), "<svg") || !strings.Contains(strings.ToUpper(string(svg)), "LAUNCH DAY") {
		t.Fatalf("poster svg invalid: %v", err)
	}

	chartOut := visual["image_generate"].Execute(ctx, map[string]interface{}{
		"path":    filepath.Join(dir, "chart.svg"),
		"variant": "chart",
		"title":   "Sales",
		"items": []interface{}{
			map[string]interface{}{"label": "Q1", "value": float64(120)},
			map[string]interface{}{"label": "Q2", "value": float64(250)},
		},
	})
	if !strings.Contains(chartOut, "Generated") {
		t.Fatalf("image_generate chart failed: %s", chartOut)
	}

	deckPath := filepath.Join(dir, "mydeck.html")
	deckOut := visual["slides_create"].Execute(ctx, map[string]interface{}{
		"path":  deckPath,
		"title": "My Deck",
		"slides": []interface{}{
			map[string]interface{}{"title": "Cover", "bullets": []interface{}{"Point one"}},
			map[string]interface{}{"title": "Next", "bullets": []interface{}{"Point two"}},
		},
	})
	if !strings.Contains(deckOut, "Created") {
		t.Fatalf("slides_create failed: %s", deckOut)
	}
	deck, _ := os.ReadFile(deckPath)
	for _, want := range []string{"deck-stage", "data-screen-label", "ArrowRight", "1920px"} {
		if !strings.Contains(string(deck), want) {
			t.Fatalf("deck.html missing %q", want)
		}
	}

	motion := MotionTools(dir)
	projectDir := filepath.Join(dir, "remotion-proj")
	remotionOut := motion["motion_remotion"].Execute(ctx, map[string]interface{}{
		"path":  projectDir,
		"title": "Teaser",
		"scenes": []interface{}{
			map[string]interface{}{"text": "Scene one", "durationInFrames": float64(60)},
			map[string]interface{}{"text": "Scene two"},
		},
	})
	if !strings.Contains(remotionOut, "Scaffolded") {
		t.Fatalf("motion_remotion failed: %s", remotionOut)
	}
	for _, member := range []string{"package.json", "src/Root.tsx", "src/index.ts"} {
		if _, err := os.Stat(filepath.Join(projectDir, member)); err != nil {
			t.Fatalf("remotion project missing %s", member)
		}
	}

	motionPath := filepath.Join(dir, "teaser.html")
	hyperOut := motion["motion_hyperframe"].Execute(ctx, map[string]interface{}{
		"path":  motionPath,
		"title": "Teaser",
		"scenes": []interface{}{
			map[string]interface{}{"text": "Hello", "durationSeconds": float64(2)},
			map[string]interface{}{"text": "World"},
		},
	})
	if !strings.Contains(hyperOut, "Generated") {
		t.Fatalf("motion_hyperframe failed: %s", hyperOut)
	}
	mh, _ := os.ReadFile(motionPath)
	if !strings.Contains(string(mh), "gsap") || !strings.Contains(string(mh), "scene-02") {
		t.Fatal("motion.html missing GSAP or scenes")
	}
}

func assertZipMembers(t *testing.T, path string, want []string) {
	t.Helper()
	r, err := zip.OpenReader(path)
	if err != nil {
		t.Fatalf("not a valid zip: %v", err)
	}
	defer r.Close()
	have := map[string]bool{}
	for _, f := range r.File {
		have[f.Name] = true
	}
	for _, w := range want {
		if !have[w] {
			t.Fatalf("zip %s missing member %s", path, w)
		}
	}
}

func readZipMember(t *testing.T, path, name string) string {
	t.Helper()
	data, err := readZipFile(path, name)
	if err != nil {
		t.Fatalf("read member: %v", err)
	}
	return string(data)
}
