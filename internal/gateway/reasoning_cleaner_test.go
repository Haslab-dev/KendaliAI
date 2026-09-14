package gateway

import (
	"strings"
	"testing"
)

func TestIsReasoningBlock(t *testing.T) {
	reasoningSamples := []string{
		"Hmm, the user asked the team to laugh, and Personal Assistant and Marcus Chen have already responded with humor and a backend joke. As Alex Rivera, I should contribute from a frontend perspective to keep the banter going while staying in character.",
		"Marcus's joke was about backend errors being handled, so I can playfully contrast that with frontend chaos. A lighthearted remark about CSS or React errors would fit naturally.",
		"I'll keep it brief—one short joke referencing frontend struggles, then pivot back to readiness. The tone should be casual and collaborative, matching the vibe.",
		"The user asked to test the tunnel.",
		"The user is asking for help with database schema.",
		"Thinking Process: user wants to see jokes.",
		"Internal thought: keep it concise and punchy.",
		"As Alex Rivera, I should reply briefly.",
		"Let me draft a quick response.",
		"I should probably add a frontend perspective here.",
		"We need to consider that Marcus already chimed in.",
	}

	for _, sample := range reasoningSamples {
		if !isReasoningBlock(sample) {
			t.Errorf("expected isReasoningBlock to return true for: %q", sample)
		}
	}

	dialogueSamples := []string{
		"Haha, gue barusan new tab 20 biar bisa ketawa lebih kenceng. Kalau di frontend, error-nya biasanya visible langsung sama user — gak ada \"handle\" tiba-tiba. 😅",
		"Tapi oke, joke-nya udah sampai. Kalau butuh sesuatu yang serius — desain system, atau performance tuning — gue standby.",
		"Halo bos! 👋 Gue di sini standby.",
		"Wkwkwkwk 😂 mantap banget!",
		"Berikut adalah file konfigurasi yang dibutuhkan.",
		"Tentu, saya bisa bantu konfigurasi cloudflared tunnel.",
	}

	for _, sample := range dialogueSamples {
		if isReasoningBlock(sample) {
			t.Errorf("expected isReasoningBlock to return false for dialogue: %q", sample)
		}
	}
}

func TestStripUnflaggedReasoningAlexRivera(t *testing.T) {
	rawInput := `Hmm, the user asked the team to laugh, and Personal Assistant and Marcus Chen have already responded with humor and a backend joke. As Alex Rivera, I should contribute from a frontend perspective to keep the banter going while staying in character.

Marcus's joke was about backend errors being handled, so I can playfully contrast that with frontend chaos. A lighthearted remark about CSS or React errors would fit naturally. 

I'll keep it brief—one short joke referencing frontend struggles, then pivot back to readiness. The tone should be casual and collaborative, matching the vibe.
Haha, gue barusan new tab 20 biar bisa ketawa lebih kenceng. Kalau di frontend, error-nya biasanya visible langsung sama user — gak ada "handle" tiba-tiba. 😅

Tapi oke, joke-nya udah sampai. Kalau butuh sesuatu yang serius — desain system,组件结构, atau performance tuning — gue standby.`

	dialogue, thought := stripUnflaggedReasoning(rawInput)

	if strings.Contains(dialogue, "Hmm, the user asked") {
		t.Errorf("dialogue should NOT contain reasoning, got: %s", dialogue)
	}
	if !strings.Contains(dialogue, "Haha, gue barusan new tab 20") {
		t.Errorf("dialogue MUST contain the joke, got: %s", dialogue)
	}
	if !strings.Contains(dialogue, "Tapi oke, joke-nya udah sampai") {
		t.Errorf("dialogue MUST contain the closing offer, got: %s", dialogue)
	}

	if !strings.Contains(thought, "Hmm, the user asked") {
		t.Errorf("thought MUST contain the stripped reasoning, got: %s", thought)
	}
	if !strings.Contains(thought, "Marcus's joke was about") {
		t.Errorf("thought MUST contain paragraph 2 reasoning, got: %s", thought)
	}
}

func TestReasoningStreamFilter(t *testing.T) {
	rawInput := `Hmm, the user asked the team to laugh, and Personal Assistant and Marcus Chen have already responded with humor and a backend joke. As Alex Rivera, I should contribute from a frontend perspective to keep the banter going while staying in character.

Marcus's joke was about backend errors being handled, so I can playfully contrast that with frontend chaos. A lighthearted remark about CSS or React errors would fit naturally. 

I'll keep it brief—one short joke referencing frontend struggles, then pivot back to readiness. The tone should be casual and collaborative, matching the vibe.
Haha, gue barusan new tab 20 biar bisa ketawa lebih kenceng. Kalau di frontend, error-nya biasanya visible langsung sama user — gak ada "handle" tiba-tiba. 😅

Tapi oke, joke-nya udah sampai. Kalau butuh sesuatu yang serius — desain system,组件结构, atau performance tuning — gue standby.`

	var thinkingOut strings.Builder
	var textOut strings.Builder

	filter := newReasoningStreamFilter(
		func(delta string) { thinkingOut.WriteString(delta) },
		func(delta string) { textOut.WriteString(delta) },
	)

	// Feed in small token-sized chunks (e.g. 5 runes) to simulate realistic SSE streaming
	runes := []rune(rawInput)
	chunkSize := 8
	for i := 0; i < len(runes); i += chunkSize {
		end := i + chunkSize
		if end > len(runes) {
			end = len(runes)
		}
		filter.Feed(string(runes[i:end]))
	}
	filter.Flush()

	tText := textOut.String()
	tThink := thinkingOut.String()

	if strings.Contains(tText, "Hmm, the user asked") {
		t.Errorf("streamed text MUST NOT contain reasoning, got: %s", tText)
	}
	if !strings.Contains(tText, "Haha, gue barusan new tab 20") {
		t.Errorf("streamed text MUST contain dialogue joke, got: %s", tText)
	}
	if !strings.Contains(tThink, "Hmm, the user asked") {
		t.Errorf("streamed thinking MUST contain initial thought, got: %s", tThink)
	}
	if !strings.Contains(tThink, "Marcus's joke was about") {
		t.Errorf("streamed thinking MUST contain paragraph 2 thought, got: %s", tThink)
	}
}
