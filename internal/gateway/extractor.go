package gateway

import (
	"bytes"
	"fmt"
	"path/filepath"
	"sort"
	"strings"
	"unicode/utf8"

	"github.com/ledongthuc/pdf"
)

// ExtractTextContent extracts clean plain text from file data based on filename extension.
func ExtractTextContent(filename string, data []byte) (string, error) {
	ext := strings.ToLower(filepath.Ext(filename))

	switch ext {
	case ".pdf":
		return ExtractTextFromPDF(data)
	default:
		if utf8.Valid(data) {
			return strings.TrimSpace(string(data)), nil
		}
		return strings.TrimSpace(strings.ToValidUTF8(string(data), "")), nil
	}
}

// ExtractTextFromPDF parses a PDF byte stream and returns structured plain text per page.
//
// Position-aware reconstruction: sheets/table exports (e.g. Google Sheets PDFs)
// emit one text fragment per glyph or cell, which GetPlainText renders as
// letter-per-line soup. Grouping fragments by Y (rows) and sorting by X
// (reading order) reconstructs real lines instead.
func ExtractTextFromPDF(data []byte) (string, error) {
	if len(data) == 0 {
		return "", fmt.Errorf("empty PDF data")
	}

	reader, err := pdf.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return "", fmt.Errorf("failed to parse PDF document: %w", err)
	}

	var b strings.Builder
	numPages := reader.NumPage()

	for pageIndex := 1; pageIndex <= numPages; pageIndex++ {
		p := reader.Page(pageIndex)
		if p.V.IsNull() {
			continue
		}

		var pageText string
		content := p.Content()
		if len(content.Text) > 0 {
			pageText = renderPageText(content.Text)
		} else {
			// Fallback for pages where the content view is unavailable.
			plain, plainErr := p.GetPlainText(nil)
			if plainErr != nil {
				continue
			}
			pageText = plain
		}

		pageText = repairVerticalText(pageText)
		trimmed := strings.TrimSpace(pageText)
		if trimmed != "" {
			b.WriteString(fmt.Sprintf("\n--- Page %d ---\n", pageIndex))
			b.WriteString(trimmed)
			b.WriteString("\n")
		}
	}

	result := strings.TrimSpace(b.String())
	if result == "" {
		return "", fmt.Errorf("no readable text could be extracted from PDF (it may be a scanned image or encrypted)")
	}

	return result, nil
}

// renderPageText reconstructs reading order from positioned text fragments:
// fragments whose Y coordinates sit within the same visual row are joined
// left-to-right — a wide horizontal gap between fragments becomes a space
// (table columns), fragments that touch are concatenated (word glyphs).
func renderPageText(texts []pdf.Text) string {
	if len(texts) == 0 {
		return ""
	}

	fragments := make([]pdf.Text, len(texts))
	copy(fragments, texts)
	sort.SliceStable(fragments, func(i, j int) bool {
		if fragments[i].Y != fragments[j].Y {
			return fragments[i].Y > fragments[j].Y // PDF Y grows upward
		}
		return fragments[i].X < fragments[j].X
	})

	const rowTolerance = 2.5
	const gapThreshold = 1.0 // points; wider gaps become spaces

	var lines []string
	var current strings.Builder
	currentY := fragments[0].Y
	lineEndX := fragments[0].X

	flush := func() {
		if current.Len() > 0 {
			lines = append(lines, current.String())
			current.Reset()
		}
	}

	for _, frag := range fragments {
		if abs(frag.Y-currentY) > rowTolerance {
			flush()
			currentY = frag.Y
			lineEndX = frag.X
		}
		if current.Len() > 0 && frag.X-lineEndX > gapThreshold && !strings.HasPrefix(frag.S, " ") {
			current.WriteString(" ")
		}
		current.WriteString(frag.S)
		if end := frag.X + frag.W; end > lineEndX {
			lineEndX = end
		}
	}
	flush()

	return strings.Join(lines, "\n")
}

func abs(v float64) float64 {
	if v < 0 {
		return -v
	}
	return v
}

// repairVerticalText is the safety net for extraction paths that still yield
// letter-per-line output: runs of consecutive 1-2 character lines are joined
// back into words (space fragments naturally act as separators). Normal prose
// lines are left untouched.
func repairVerticalText(text string) string {
	lines := strings.Split(text, "\n")

	shortish := 0
	nonEmpty := 0
	for _, l := range lines {
		t := strings.TrimSpace(l)
		if t == "" {
			continue
		}
		nonEmpty++
		if len(t) <= 2 {
			shortish++
		}
	}
	// Only rewrite when the vertical-soup pattern clearly dominates.
	if nonEmpty == 0 || shortish*100/nonEmpty < 75 {
		return text
	}

	var out []string
	i := 0
	for i < len(lines) {
		line := lines[i]
		if runeLen(strings.TrimSpace(line)) <= 2 && i+1 < len(lines) && runeLen(strings.TrimSpace(lines[i+1])) <= 2 {
			var run []string
			for i < len(lines) && runeLen(strings.TrimSpace(lines[i])) <= 2 {
				run = append(run, lines[i])
				i++
			}
			out = append(out, strings.Join(run, ""))
			continue
		}
		out = append(out, line)
		i++
	}
	return strings.Join(out, "\n")
}

func runeLen(s string) int {
	n := 0
	for range s {
		n++
	}
	return n
}
