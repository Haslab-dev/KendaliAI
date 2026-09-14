package gateway

import (
	"strings"
)

type reasoningFilterState int

const (
	statePending reasoningFilterState = iota
	stateReasoningLine
	stateDialogue
)

// reasoningStreamFilter processes streamed text deltas, routing unflagged
// reasoning to onThinking and genuine dialogue to onText.
type reasoningStreamFilter struct {
	state        reasoningFilterState
	lineStartBuf strings.Builder
	onThinking   func(string)
	onText       func(string)
}

func newReasoningStreamFilter(onThinking, onText func(string)) *reasoningStreamFilter {
	return &reasoningStreamFilter{
		state:      statePending,
		onThinking: onThinking,
		onText:     onText,
	}
}

func (f *reasoningStreamFilter) Feed(delta string) {
	if f.state == stateDialogue {
		if f.onText != nil {
			f.onText(delta)
		}
		return
	}

	for _, ch := range delta {
		f.feedRune(ch)
	}
}

func (f *reasoningStreamFilter) feedRune(r rune) {
	switch f.state {
	case stateDialogue:
		if f.onText != nil {
			f.onText(string(r))
		}

	case stateReasoningLine:
		if f.onThinking != nil {
			f.onThinking(string(r))
		}
		if r == '\n' {
			f.state = statePending
		}

	case statePending:
		f.lineStartBuf.WriteRune(r)
		if r == '\n' || f.lineStartBuf.Len() >= 60 {
			bufStr := f.lineStartBuf.String()
			trimmed := strings.TrimSpace(bufStr)

			if trimmed == "" {
				// Empty line or leading whitespace between reasoning paragraphs
				if f.onThinking != nil {
					f.onThinking(bufStr)
				}
				f.lineStartBuf.Reset()
				f.state = statePending
				return
			}

			if isReasoningBlock(trimmed) {
				// Confirmed reasoning line
				if f.onThinking != nil {
					f.onThinking(bufStr)
				}
				f.lineStartBuf.Reset()
				if r == '\n' {
					f.state = statePending
				} else {
					f.state = stateReasoningLine
				}
			} else {
				// Confirmed dialogue transition
				f.state = stateDialogue
				if f.onText != nil {
					f.onText(bufStr)
				}
				f.lineStartBuf.Reset()
			}
		}
	}
}

func (f *reasoningStreamFilter) Flush() {
	if f.lineStartBuf.Len() > 0 {
		bufStr := f.lineStartBuf.String()
		trimmed := strings.TrimSpace(bufStr)
		if f.state == stateDialogue {
			if f.onText != nil {
				f.onText(bufStr)
			}
		} else {
			if trimmed != "" && !isReasoningBlock(trimmed) {
				f.state = stateDialogue
				if f.onText != nil {
					f.onText(bufStr)
				}
			} else {
				if f.onThinking != nil {
					f.onThinking(bufStr)
				}
			}
		}
		f.lineStartBuf.Reset()
	}
}
