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
// textToken is a positioned run of text on the page: either a normal
// horizontal fragment or a re-assembled rotated (vertical) word.
type textToken struct {
	s        string
	x, y, w  float64
	fontSize float64
}

// renderPageText reconstructs reading order from positioned text fragments.
// Rotated glyphs (vertical headers in sheet exports) are detected via their
// zeroed horizontal matrix scale (FontSize == Trm[0][0] ≈ 0) and re-assembled
// in stream order — which is their reading order — into single words. The
// remaining horizontal fragments are grouped into rows by Y (2.5pt tolerance)
// and sorted by X; wide gaps become spaces, touching glyphs concatenate.
func renderPageText(texts []pdf.Text) string {
	if len(texts) == 0 {
		return ""
	}

	// Pass 1 — collect rotated glyph runs (FontSize ≈ 0) into vertical tokens.
	isRotated := func(t pdf.Text) bool { return t.FontSize < 0.5 && t.FontSize > -0.5 }

	tokens := make([]textToken, 0, len(texts))
	var run []pdf.Text

	flushRun := func() {
		if len(run) == 0 {
			return
		}
		// Stream order is the reading order of the rotated word; split into
		// separate words when the glyph positions jump (new word/column).
		start := 0
		for i := 1; i <= len(run); i++ {
			split := i == len(run)
			if !split {
				if abs(run[i].Y-run[i-1].Y) > 6 || abs(run[i].X-run[i-1].X) > 3 {
					split = true
				}
			}
			if !split {
				continue
			}
			var sb strings.Builder
			minY, maxY := run[start].Y, run[start].Y
			for _, r := range run[start:i] {
				sb.WriteString(r.S)
				if r.Y < minY {
					minY = r.Y
				}
				if r.Y > maxY {
					maxY = r.Y
				}
			}
			tokens = append(tokens, textToken{
				s: sb.String(),
				x: run[start].X,
				y: maxY,            // occupy the topmost row band it spans
				w: maxY - minY + 8, // horizontal extent ≈ its vertical span
			})
			start = i
		}
		run = run[:0]
	}

	for _, t := range texts {
		if isRotated(t) {
			run = append(run, t)
		} else {
			flushRun()
			tokens = append(tokens, textToken{s: t.S, x: t.X, y: t.Y, w: t.W, fontSize: t.FontSize})
		}
	}
	flushRun()

	// Pass 2 — row assembly over tokens (Y banding, X order, gap → space).
	fragments := tokens
	sort.SliceStable(fragments, func(i, j int) bool {
		if fragments[i].y != fragments[j].y {
			return fragments[i].y > fragments[j].y // PDF Y grows upward
		}
		return fragments[i].x < fragments[j].x
	})

	const rowTolerance = 2.5
	const gapThreshold = 1.0 // points; wider gaps become spaces

	var lines []string
	var current strings.Builder
	currentY := fragments[0].y
	lineEndX := fragments[0].x

	flush := func() {
		if current.Len() > 0 {
			lines = append(lines, current.String())
			current.Reset()
		}
	}

	for _, frag := range fragments {
		if abs(frag.y-currentY) > rowTolerance {
			flush()
			currentY = frag.y
			lineEndX = frag.x
		}
		// Word-space detection relative to the glyph size: per-glyph-positioned
		// PDFs (common in formal letters) leave sub-point gaps between every
		// character, while a real space is ~0.25em of the font size.
		spaceGap := frag.fontSize * 0.18
		if spaceGap < 0.75 {
			spaceGap = 0.75
		}
		if current.Len() > 0 && frag.x-lineEndX > spaceGap &&
			!strings.HasPrefix(frag.s, " ") && !strings.HasSuffix(current.String(), " ") {
			current.WriteString(" ")
		}
		current.WriteString(frag.s)
		if end := frag.x + frag.w; end > lineEndX {
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
