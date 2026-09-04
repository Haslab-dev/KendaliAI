package gateway

import (
	"strings"
	"unicode/utf8"
)

// ChunkText splits a long text into overlapping chunks using recursive character splitting.
func ChunkText(text string, maxChunkSize int, overlapSize int) []string {
	clean := strings.TrimSpace(text)
	if clean == "" {
		return nil
	}
	if maxChunkSize <= 0 {
		maxChunkSize = 1500 // ~350-400 tokens
	}
	if overlapSize <= 0 || overlapSize >= maxChunkSize {
		overlapSize = 150
	}

	if utf8.RuneCountInString(clean) <= maxChunkSize {
		return []string{clean}
	}

	var chunks []string
	separators := []string{"\n\n", "\n", ". ", " ", ""}

	var recursiveSplit func(txt string, sepIdx int) []string
	recursiveSplit = func(txt string, sepIdx int) []string {
		if utf8.RuneCountInString(txt) <= maxChunkSize {
			return []string{txt}
		}
		if sepIdx >= len(separators) {
			runes := []rune(txt)
			var parts []string
			step := maxChunkSize - overlapSize
			if step <= 0 {
				step = maxChunkSize
			}
			for i := 0; i < len(runes); i += step {
				end := i + maxChunkSize
				if end > len(runes) {
					end = len(runes)
				}
				parts = append(parts, string(runes[i:end]))
				if end == len(runes) {
					break
				}
			}
			return parts
		}

		sep := separators[sepIdx]
		var splits []string
		if sep == "" {
			splits = strings.Split(txt, "")
		} else {
			splits = strings.Split(txt, sep)
		}

		var currentChunk strings.Builder
		var res []string

		for _, piece := range splits {
			pieceTrimmed := piece
			if currentChunk.Len() > 0 && currentChunk.Len()+len(sep)+len(pieceTrimmed) > maxChunkSize {
				accum := currentChunk.String()
				if utf8.RuneCountInString(accum) > maxChunkSize {
					sub := recursiveSplit(accum, sepIdx+1)
					res = append(res, sub...)
				} else {
					res = append(res, accum)
				}
				currentChunk.Reset()
			}

			if currentChunk.Len() > 0 && sep != "" {
				currentChunk.WriteString(sep)
			}
			currentChunk.WriteString(pieceTrimmed)
		}

		if currentChunk.Len() > 0 {
			accum := currentChunk.String()
			if utf8.RuneCountInString(accum) > maxChunkSize {
				sub := recursiveSplit(accum, sepIdx+1)
				res = append(res, sub...)
			} else {
				res = append(res, accum)
			}
		}

		return res
	}

	rawChunks := recursiveSplit(clean, 0)
	for _, c := range rawChunks {
		cTrim := strings.TrimSpace(c)
		if cTrim != "" {
			chunks = append(chunks, cTrim)
		}
	}
	return chunks
}
