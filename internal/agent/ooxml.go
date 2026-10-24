package agent

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// ============================================================================
// Minimal OOXML (Office Open XML) helpers — native Go, stdlib only.
// Produces real .docx / .xlsx / .pptx files readable by Word, Excel,
// PowerPoint, Google Workspace, and LibreOffice without external binaries.
// ============================================================================

// writeZip writes files (name -> content) to path as a zip archive.
func writeZip(path string, files map[string][]byte) error {
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	buf := new(bytes.Buffer)
	w := zip.NewWriter(buf)
	for name, data := range files {
		f, err := w.Create(name)
		if err != nil {
			return err
		}
		if _, err := f.Write(data); err != nil {
			return err
		}
	}
	if err := w.Close(); err != nil {
		return err
	}
	return os.WriteFile(path, buf.Bytes(), 0644)
}

// readZipFile extracts one file from a zip archive by name.
func readZipFile(path, name string) ([]byte, error) {
	r, err := zip.OpenReader(path)
	if err != nil {
		return nil, err
	}
	defer r.Close()
	for _, f := range r.File {
		if f.Name == name {
			rc, err := f.Open()
			if err != nil {
				return nil, err
			}
			defer rc.Close()
			var buf bytes.Buffer
			if _, err := buf.ReadFrom(rc); err != nil {
				return nil, err
			}
			return buf.Bytes(), nil
		}
	}
	return nil, fmt.Errorf("file %q not found in %s", name, path)
}

// rewriteZip replaces one member's content while keeping every other member.
func rewriteZip(path, name string, replace []byte) error {
	r, err := zip.OpenReader(path)
	if err != nil {
		return err
	}
	files := map[string][]byte{}
	for _, f := range r.File {
		rc, err := f.Open()
		if err != nil {
			r.Close()
			return err
		}
		var buf bytes.Buffer
		_, _ = buf.ReadFrom(rc)
		rc.Close()
		if f.Name == name {
			files[f.Name] = replace
		} else {
			files[f.Name] = buf.Bytes()
		}
	}
	r.Close()
	return writeZip(path, files)
}

// xmlEscape escapes text for OOXML XML documents.
func xmlEscape(s string) string {
	var b strings.Builder
	_ = xml.EscapeText(&b, []byte(s))
	return b.String()
}

// ============================================================================
// DOCX
// ============================================================================

const (
	docxContentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
	rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
)

// docxRun renders one text run with optional bold/italic and explicit sizing.
func docxRun(text string, bold, italic bool, extraRPr string) string {
	if text == "" {
		return ""
	}
	props := extraRPr
	if bold {
		props += "<w:b/>"
	}
	if italic {
		props += "<w:i/>"
	}
	rpr := ""
	if props != "" {
		rpr = "<w:rPr>" + props + "</w:rPr>"
	}
	return "<w:r>" + rpr + "<w:t xml:space=\"preserve\">" + xmlEscape(text) + "</w:t></w:r>"
}

// docxParagraph builds a paragraph. style: "" (body), "h1".."h3", "bullet".
func docxParagraph(text, style string) string {
	var prefix string
	var headingRPr string
	switch style {
	case "h1":
		prefix = ""
		headingRPr = "<w:sz w:val=\"56\"/><w:szCs w:val=\"56\"/>"
	case "h2":
		headingRPr = "<w:sz w:val=\"40\"/><w:szCs w:val=\"40\"/>"
	case "h3":
		headingRPr = "<w:sz w:val=\"30\"/><w:szCs w:val=\"30\"/>"
	case "bullet":
		prefix = "•  "
	}
	outline := map[string]string{
		"h1": "<w:pPr><w:outlineLvl w:val=\"0\"/><w:spacing w:before=\"240\" w:after=\"120\"/></w:pPr>",
		"h2": "<w:pPr><w:outlineLvl w:val=\"1\"/><w:spacing w:before=\"200\" w:after=\"100\"/></w:pPr>",
		"h3": "<w:pPr><w:outlineLvl w:val=\"2\"/><w:spacing w:before=\"160\" w:after=\"80\"/></w:pPr>",
	}[style]

	// Inline **bold** and *italic* parsing
	var runs strings.Builder
	boldSeg := false
	italicSeg := false
	var buf strings.Builder
	flush := func() {
		if buf.Len() > 0 {
			runs.WriteString(docxRun(prefix+buf.String(), boldSeg, italicSeg, headingRPr))
			prefix = ""
			buf.Reset()
		}
	}

	i := 0
	for i < len(text) {
		switch {
		case strings.HasPrefix(text[i:], "**"):
			flush()
			boldSeg = !boldSeg
			i += 2
		case strings.HasPrefix(text[i:], "*"):
			flush()
			italicSeg = !italicSeg
			i++
		default:
			buf.WriteByte(text[i])
			i++
		}
	}
	flush()

	if runs.Len() == 0 {
		return ""
	}
	return "<w:p>" + outline + runs.String() + "</w:p>"
}

// markdownToDocxBody converts markdown-lite text into OOXML paragraphs.
func markdownToDocxBody(markdown string) string {
	var sb strings.Builder
	numberIdx := 0
	for _, line := range strings.Split(strings.ReplaceAll(markdown, "\r\n", "\n"), "\n") {
		trimmed := strings.TrimSpace(line)
		switch {
		case trimmed == "":
			numberIdx = 0
			continue
		case strings.HasPrefix(trimmed, "### "):
			numberIdx = 0
			sb.WriteString(docxParagraph(strings.TrimPrefix(trimmed, "### "), "h3"))
		case strings.HasPrefix(trimmed, "## "):
			numberIdx = 0
			sb.WriteString(docxParagraph(strings.TrimPrefix(trimmed, "## "), "h2"))
		case strings.HasPrefix(trimmed, "# "):
			numberIdx = 0
			sb.WriteString(docxParagraph(strings.TrimPrefix(trimmed, "# "), "h1"))
		case strings.HasPrefix(trimmed, "- "):
			numberIdx = 0
			sb.WriteString(docxParagraph(strings.TrimPrefix(trimmed, "- "), "bullet"))
		default:
			if num, rest, ok := splitNumberedLine(trimmed); ok {
				numberIdx++
				sb.WriteString(docxParagraph(fmt.Sprintf("%d. %s", num, rest), ""))
			} else {
				sb.WriteString(docxParagraph(trimmed, ""))
			}
		}
	}
	return sb.String()
}

// splitNumberedLine parses a leading "N. " or "N) " prefix.
func splitNumberedLine(s string) (int, string, bool) {
	i := 0
	for i < len(s) && s[i] >= '0' && s[i] <= '9' {
		i++
	}
	if i == 0 || i >= len(s) || (s[i] != '.' && s[i] != ')') || i+1 >= len(s) || s[i+1] != ' ' {
		return 0, "", false
	}
	num := 0
	for _, d := range s[:i] {
		num = num*10 + int(d-'0')
	}
	return num, s[i+2:], true
}

func docxDocumentXML(bodyParas string) string {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>` +
		bodyParas +
		`<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`
}

func buildDocx(markdown string) map[string][]byte {
	return map[string][]byte{
		"[Content_Types].xml":      []byte(docxContentTypes),
		"_rels/.rels":              []byte(rootRels),
		"word/document.xml":        []byte(docxDocumentXML(markdownToDocxBody(markdown))),
	}
}

// docxXMLToText strips OOXML paragraph/run markup into plain text.
func docxXMLToText(xmlData []byte) string {
	s := string(xmlData)
	// Paragraph and break boundaries become newlines
	s = strings.ReplaceAll(s, "</w:p>", "\n")
	s = strings.ReplaceAll(s, "<w:br/>", "\n")
	// Drop all remaining tags
	var out strings.Builder
	inTag := false
	for _, r := range s {
		switch {
		case r == '<':
			inTag = true
		case r == '>':
			inTag = false
		case !inTag:
			out.WriteRune(r)
		}
	}
	lines := strings.Split(out.String(), "\n")
	cleaned := make([]string, 0, len(lines))
	for _, l := range lines {
		l = strings.TrimSpace(l)
		if l != "" {
			cleaned = append(cleaned, l)
		}
	}
	return strings.Join(cleaned, "\n")
}

// ============================================================================
// XLSX
// ============================================================================

const (
	xlsxContentTypes1Sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet%d.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`

	xlsxRootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`
)

// colName converts a 0-based column index to spreadsheet letters (A, B, ...).
func colName(idx int) string {
	name := ""
	for idx >= 0 {
		name = string(rune('A'+idx%26)) + name
		idx = idx/26 - 1
	}
	return name
}

// xlsxCell renders one cell; strings become inline strings, numbers plain.
func xlsxCell(row, col int, value string) string {
	ref := fmt.Sprintf("%s%d", colName(col), row+1)
	trimmed := strings.TrimSpace(value)
	isNumber := trimmed != "" && !strings.ContainsFunc(trimmed, func(r rune) bool {
		return (r < '0' || r > '9') && r != '.' && r != '-' && r != '+' && r != 'e' && r != 'E' && r != '%'
	})
	if isNumber {
		// strip % and thousand separators conservatively
		num := strings.NewReplacer(",", "", "%", "", " ", "").Replace(trimmed)
		return fmt.Sprintf(`<c r="%s"><v>%s</v></c>`, ref, num)
	}
	return fmt.Sprintf(`<c r="%s" t="inlineStr"><is><t xml:space="preserve">%s</t></is></c>`, ref, xmlEscape(value))
}

func xlsxSheetXML(rows [][]string) string {
	var sb strings.Builder
	sb.WriteString(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>`)
	for r, row := range rows {
		sb.WriteString("<row>")
		for c, val := range row {
			sb.WriteString(xlsxCell(r, c, val))
		}
		sb.WriteString("</row>")
	}
	sb.WriteString("</sheetData></worksheet>")
	return sb.String()
}

func buildXlsx(sheets []xlsxSheet) map[string][]byte {
	files := map[string][]byte{
		"_rels/.rels": []byte(xlsxRootRels),
	}

	var wbSheets, wbRels, ctOverrides strings.Builder
	for i, sh := range sheets {
		n := i + 1
		files[fmt.Sprintf("xl/worksheets/sheet%d.xml", n)] = []byte(xlsxSheetXML(sh.Rows))
		wbSheets.WriteString(fmt.Sprintf(`<sheet name="%s" sheetId="%d" r:id="rId%d"/>`, xmlEscape(sh.Name), n, n))
		wbRels.WriteString(fmt.Sprintf(`<Relationship Id="rId%d" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet%d.xml"/>`, n, n))
		ctOverrides.WriteString(fmt.Sprintf(`<Override PartName="/xl/worksheets/sheet%d.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`, n))
	}

	files["[Content_Types].xml"] = []byte(fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
%s</Types>`, ctOverrides.String()))

	files["xl/workbook.xml"] = []byte(fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>%s</sheets></workbook>`, wbSheets.String()))

	files["xl/_rels/workbook.xml.rels"] = []byte(fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">%s</Relationships>`, wbRels.String()))

	return files
}

type xlsxSheet struct {
	Name string
	Rows [][]string
}

// ============================================================================
// PPTX
// ============================================================================

type pptxSlide struct {
	Title   string
	Bullets []string
}

// pptxSlideXML builds one slide with a title text box and a bullet body.
// Plain (non-placeholder) shapes with explicit geometry render reliably in
// PowerPoint, Google Slides, and LibreOffice without a full layout tree.
func pptxSlideXML(s pptxSlide, idx int) string {
	var paras strings.Builder
	for _, b := range s.Bullets {
		paras.WriteString(fmt.Sprintf(
			`<a:p><a:pPr marL="342900" indent="-342900"><a:buFont typeface="Arial"/><a:buChar char="•"/></a:pPr><a:r><a:rPr lang="en-US" sz="2000"/><a:t>%s</a:t></a:r></a:p>`,
			xmlEscape(b)))
	}
	if s.Bullets == nil {
		paras.WriteString(`<a:p><a:endParaRPr lang="en-US"/></a:p>`)
	}
	return fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
    <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
    <p:sp>
      <p:nvSpPr><p:cNvPr id="2" name="Title %d"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
      <p:spPr><a:xfrm><a:off x="838200" y="365125"/><a:ext cx="10515600" cy="1325563"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
      <p:txBody><a:bodyPr wrap="square"/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="4000" b="1"/><a:t>%s</a:t></a:r></a:p></p:txBody>
    </p:sp>
    <p:sp>
      <p:nvSpPr><p:cNvPr id="3" name="Content %d"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
      <p:spPr><a:xfrm><a:off x="838200" y="1825625"/><a:ext cx="10515600" cy="4351338"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
      <p:txBody><a:bodyPr wrap="square"/><a:lstStyle/>%s</p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`, idx, xmlEscape(s.Title), idx, paras.String())
}

const pptxThemeXML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Kendali Theme">
<a:themeElements>
<a:clrScheme name="Kendali"><a:dk1><a:srgbClr val="09090B"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="18181B"/></a:dk2><a:lt2><a:srgbClr val="FAFAFA"/></a:lt2><a:accent1><a:srgbClr val="6D28D9"/></a:accent1><a:accent2><a:srgbClr val="2563EB"/></a:accent2><a:accent3><a:srgbClr val="059669"/></a:accent3><a:accent4><a:srgbClr val="D97706"/></a:accent4><a:accent5><a:srgbClr val="DC2626"/></a:accent5><a:accent6><a:srgbClr val="DB2777"/></a:accent6><a:hlink><a:srgbClr val="6D28D9"/></a:hlink><a:folHlink><a:srgbClr val="52525B"/></a:folHlink></a:clrScheme>
<a:fontScheme name="Kendali"><a:majorFont><a:latin typeface="Inter"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Inter"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>
<a:fmtScheme name="Kendali">
<a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>
<a:lnStyleLst><a:ln><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>
<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>
<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>
</a:fmtScheme>
</a:themeElements></a:theme>`

func buildPptx(slides []pptxSlide) map[string][]byte {
	if len(slides) == 0 {
		slides = []pptxSlide{{Title: "Presentation"}}
	}

	files := map[string][]byte{}

	// Content types
	var slideOverrides strings.Builder
	for i := range slides {
		slideOverrides.WriteString(fmt.Sprintf(`<Override PartName="/ppt/slides/slide%d.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`, i+1))
	}
	files["[Content_Types].xml"] = []byte(fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
%s</Types>`, slideOverrides.String()))

	files["_rels/.rels"] = []byte(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`)

	// presentation.xml + rels
	var sldIds, presRels strings.Builder
	for i := range slides {
		sldIds.WriteString(fmt.Sprintf(`<p:sldId id="%d" r:id="rId%d"/>`, 256+i, i+2))
		presRels.WriteString(fmt.Sprintf(`<Relationship Id="rId%d" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide%d.xml"/>`, i+2, i+1))
	}
	masterRelID := len(slides) + 2
	presRels.WriteString(fmt.Sprintf(`<Relationship Id="rId%d" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>`, masterRelID))
	files["ppt/presentation.xml"] = []byte(fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId%d"/></p:sldMasterIdLst>
  <p:sldIdLst>%s</p:sldIdLst>
  <p:sldSz cx="12192000" cy="6858000"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`, masterRelID, sldIds.String()))
	files["ppt/_rels/presentation.xml.rels"] = []byte(fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">%s</Relationships>`, presRels.String()))

	// slide master + layout + theme
	files["ppt/slideMasters/slideMaster1.xml"] = []byte(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
</p:sldMaster>`)
	files["ppt/slideMasters/_rels/slideMaster1.xml.rels"] = []byte(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>`)
	files["ppt/slideLayouts/slideLayout1.xml"] = []byte(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="obj" preserve="1">
  <p:cSld name="Title and Content"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldLayout>`)
	files["ppt/slideLayouts/_rels/slideLayout1.xml.rels"] = []byte(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`)
	files["ppt/theme/theme1.xml"] = []byte(pptxThemeXML)

	// slides
	for i, s := range slides {
		n := i + 1
		files[fmt.Sprintf("ppt/slides/slide%d.xml", n)] = []byte(pptxSlideXML(s, n))
		files[fmt.Sprintf("ppt/slides/_rels/slide%d.xml.rels", n)] = []byte(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`)
	}
	return files
}
