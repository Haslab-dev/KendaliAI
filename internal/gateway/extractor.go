package gateway

import (
	"bytes"
	"fmt"
	"path/filepath"
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
		text, err := p.GetPlainText(nil)
		if err == nil {
			trimmed := strings.TrimSpace(text)
			if trimmed != "" {
				b.WriteString(fmt.Sprintf("\n--- Page %d ---\n", pageIndex))
				b.WriteString(trimmed)
				b.WriteString("\n")
			}
		}
	}

	result := strings.TrimSpace(b.String())
	if result == "" {
		return "", fmt.Errorf("no readable text could be extracted from PDF (it may be a scanned image or encrypted)")
	}

	return result, nil
}
