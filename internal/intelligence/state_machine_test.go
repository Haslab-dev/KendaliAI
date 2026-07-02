package intelligence

import (
	"testing"
)

func TestStateMachine_ValidTransitions(t *testing.T) {
	sm := NewStateMachine(10)

	validPaths := [][]CtxPhase{
		{PhaseAnalyzeProject},
		{PhaseAnalyzeProject, PhaseBuildWorkingSet},
		{PhaseAnalyzeProject, PhaseBuildWorkingSet, PhasePlan},
		{PhaseAnalyzeProject, PhaseBuildWorkingSet, PhasePlan, PhaseReadTargetFiles, PhaseGenerateDiff, PhaseApplyPatch, PhaseVerifyBuild, PhaseDone},
	}

	for _, path := range validPaths {
		sm.Phase = PhaseIDLE
		for _, next := range path {
			if !sm.Transition(next) {
				t.Errorf("transition %s → %s should be valid", sm.CurrentPhase(), next)
				break
			}
		}
	}
}

func TestStateMachine_InvalidTransitions(t *testing.T) {
	sm := NewStateMachine(10)

	invalidPairs := []struct {
		from CtxPhase
		to   CtxPhase
	}{
		{PhaseIDLE, PhaseDone},
		{PhaseIDLE, PhaseReadTargetFiles},
		{PhaseDone, PhaseIDLE},
		{PhaseDone, PhaseAnalyzeProject},
		{PhaseReadTargetFiles, PhaseAnalyzeProject},
	}

	for _, p := range invalidPairs {
		sm.Phase = p.from
		if sm.Transition(p.to) {
			t.Errorf("transition %s → %s should be invalid", p.from, p.to)
		}
	}
}

func TestStateMachine_ReadBudget(t *testing.T) {
	sm := NewStateMachine(3)

	for i := 0; i < 3; i++ {
		can, _ := sm.CanRead()
		if !can {
			t.Fatalf("should be able to read at count %d", i)
		}
		sm.RecordRead("file.go")
	}

	can, msg := sm.CanRead()
	if can {
		t.Error("should be out of read budget")
	}
	if msg == "" {
		t.Error("should provide justification message")
	}
}

func TestStateMachine_AdditionalReads(t *testing.T) {
	sm := NewStateMachine(3)
	sm.ReadCount = 3

	sm.RequestAdditionalReads("need to verify edge case")
	if sm.MaxReads != 8 {
		t.Errorf("expected MaxReads=8 after additional request, got %d", sm.MaxReads)
	}

	can, _ := sm.CanRead()
	if !can {
		t.Error("should be able to read after requesting additional")
	}
}
