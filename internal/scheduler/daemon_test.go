package scheduler

import (
	"testing"
	"time"
)

func TestCalculateNextRun_Every1AM(t *testing.T) {
	// Reference: 2026-09-13 12:00:00
	ref := time.Date(2026, 9, 13, 12, 0, 0, 0, time.UTC)
	next := CalculateNextRun("every 1 am", ref)

	expected := time.Date(2026, 9, 14, 1, 0, 0, 0, time.UTC)
	if !next.Equal(expected) {
		t.Fatalf("expected %v, got %v", expected, next)
	}
}

func TestCalculateNextRun_Cron(t *testing.T) {
	// "0 1 * * *" = 1:00 AM daily
	ref := time.Date(2026, 9, 13, 0, 30, 0, 0, time.UTC)
	next := CalculateNextRun("0 1 * * *", ref)

	expected := time.Date(2026, 9, 13, 1, 0, 0, 0, time.UTC)
	if !next.Equal(expected) {
		t.Fatalf("expected %v, got %v", expected, next)
	}
}

func TestCalculateNextRun_Relative(t *testing.T) {
	ref := time.Date(2026, 9, 13, 10, 0, 0, 0, time.UTC)
	next := CalculateNextRun("in 15 minutes", ref)

	expected := time.Date(2026, 9, 13, 10, 15, 0, 0, time.UTC)
	if !next.Equal(expected) {
		t.Fatalf("expected %v, got %v", expected, next)
	}
}
