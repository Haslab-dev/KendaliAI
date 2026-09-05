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
		{S: "Assigned", X: 10, Y: 90, W: 40},
		{S: " ", X: 51, Y: 90, W: 4},
		{S: "to", X: 56, Y: 90, W: 10},
		{S: "Ac", X: 10, Y: 100, W: 19.5},
		{S: "tiv", X: 30, Y: 100, W: 14},
		{S: "ity", X: 44.5, Y: 100, W: 15},
	}
	got := renderPageText(texts)
	want := "Activity\nAssigned to"
	if got != want {
		t.Errorf("renderPageText:\n got %q\nwant %q", got, want)
	}
}
