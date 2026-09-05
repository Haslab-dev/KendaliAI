package gateway

import (
	"strings"
	"testing"

	"github.com/ledongthuc/pdf"
)

func TestRepairVerticalText(t *testing.T) {
	garbled := "A\nc\nt\niv\nit\ny\n \nA\ns\ns\nig\nn\ne\nd\n \nt\no\n \nJ\nu\nn\ne\n\nINSTALL & Setup\nPolygon Edge"
	want := "Activity Assigned to June\nINSTALL & Setup\nPolygon Edge"
	got := repairVerticalText(garbled)
	if got != want {
		t.Errorf("repairVerticalText:\n got %q\nwant %q", got, want)
	}
}

func TestRepairVerticalTextLeavesProseAlone(t *testing.T) {
	prose := "This is a normal paragraph\nwith several longer lines\nthat must not be touched."
	if got := repairVerticalText(prose); got != prose {
		t.Errorf("normal prose was rewritten:\n got %q", got)
	}
}

// The vertical run "A\nc\nt" must NOT be repaired when the document is mostly
// prose — the 50% threshold guards against mangling normal short lines.
func TestRepairVerticalTextThreshold(t *testing.T) {
	mixed := "This is a full normal sentence.\nA\nc\nt\nAnother complete sentence follows here."
	got := repairVerticalText(mixed)
	if !strings.Contains(got, "A\nc\nt") {
		t.Errorf("short run in prose-heavy doc should stay untouched, got %q", got)
	}
}

// renderPageText: fragments sharing a row assemble in X order; higher Y (PDF
// coordinates grow upward) comes first.
func TestRenderPageTextRowsAndOrder(t *testing.T) {
	// Simulate a two-row layout: row 1 (top, Y=100) has contiguous glyphs that
	// must concatenate into one word; row 2 (bottom, Y=90) has a space glyph
	// and a column gap that becomes a space.
	texts := []pdf.Text{
		{S: "Assigned", X: 10, Y: 90, W: 40, FontSize: 10},
		{S: " ", X: 51, Y: 90, W: 4, FontSize: 10},
		{S: "to", X: 56, Y: 90, W: 10, FontSize: 10},
		{S: "Ac", X: 10, Y: 100, W: 19.5, FontSize: 10},
		{S: "tiv", X: 30, Y: 100, W: 14, FontSize: 10},
		{S: "ity", X: 44.5, Y: 100, W: 15, FontSize: 10},
	}
	got := renderPageText(texts)
	want := "Activity\nAssigned to"
	if got != want {
		t.Errorf("renderPageText:\n got %q\nwant %q", got, want)
	}
}

// TestRenderPageTextRotatedHeaders: sheet exports render month headers as
// rotated glyphs (FontSize == Trm[0][0] ≈ 0, placed bottom-to-top in stream
// order). Each such run must reassemble into one readable word instead of
// interleaving with horizontal rows.
func TestRenderPageTextRotatedHeaders(t *testing.T) {
	texts := []pdf.Text{
		// rotated header "June" — same X, rising Y, FontSize ~ 0
		{S: "J", X: 100, Y: 80},
		{S: "u", X: 100, Y: 86},
		{S: "n", X: 100, Y: 92},
		{S: "e", X: 100, Y: 98},
		// horizontal body rows
		{S: "Install", X: 10, Y: 50, W: 30, FontSize: 10},
		{S: "&", X: 45, Y: 50, W: 6, FontSize: 10},
		{S: "Setup", X: 53, Y: 50, W: 24, FontSize: 10},
		{S: "Reza", X: 10, Y: 40, W: 20, FontSize: 10},
	}
	got := renderPageText(texts)
	want := "June\nInstall & Setup\nReza"
	if got != want {
		t.Errorf("renderPageText:\n got %q\nwant %q", got, want)
	}
}

// TestRenderPageTextPerGlyphPositioning: formal letters place every glyph
// individually — ~1.5pt intra-word gaps and ~4-8pt word gaps at font size 12.
// Word-space detection must be relative to the font size, not a fixed 1pt.
func TestRenderPageTextPerGlyphPositioning(t *testing.T) {
	mk := func(s string, x float64) pdf.Text {
		return pdf.Text{S: s, X: x, W: float64(len(s)) * 6, FontSize: 12, Y: 100}
	}
	texts := []pdf.Text{
		mk("K", 10), mk("a", 17.5), mk("r", 25), mk("a", 32.5), mk("w", 40), mk("ang", 47.5),
		mk("17", 68),  // wide gap -> word space
		{S: "Oktober", X: 10, W: 34, FontSize: 12, Y: 88}, // next row
	}
	got := renderPageText(texts)
	want := "Karawang 17\nOktober"
	if got != want {
		t.Errorf("renderPageText:\n got %q\nwant %q", got, want)
	}
}
