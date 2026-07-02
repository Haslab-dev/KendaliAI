package intelligence

import (
	"fmt"
)

type StateMachine struct {
	Phase        CtxPhase
	ReadCount    int
	MaxReads     int
	WorkingSet   *WorkingSet
	EditPlans    []EditPlan
	FilesRead    map[string]bool
}

func NewStateMachine(maxReads int) *StateMachine {
	if maxReads <= 0 {
		maxReads = 10
	}
	return &StateMachine{
		Phase:     PhaseIDLE,
		MaxReads:  maxReads,
		FilesRead: map[string]bool{},
	}
}

func (sm *StateMachine) CurrentPhase() CtxPhase {
	return sm.Phase
}

func (sm *StateMachine) Transition(next CtxPhase) bool {
	validTransitions := map[CtxPhase][]CtxPhase{
		PhaseIDLE:              {PhaseAnalyzeProject},
		PhaseAnalyzeProject:    {PhaseBuildWorkingSet, PhaseDone},
		PhaseBuildWorkingSet:   {PhasePlan, PhaseReadTargetFiles},
		PhasePlan:              {PhaseReadTargetFiles, PhaseGenerateDiff, PhaseDone},
		PhaseReadTargetFiles:   {PhaseGenerateDiff, PhaseApplyPatch},
		PhaseGenerateDiff:      {PhaseApplyPatch, PhaseReadTargetFiles},
		PhaseApplyPatch:        {PhaseVerifyBuild, PhaseReadTargetFiles},
		PhaseVerifyBuild:       {PhaseDone, PhaseReadTargetFiles, PhaseApplyPatch},
		PhaseDone:              {},
	}

	allowed := validTransitions[sm.Phase]
	for _, a := range allowed {
		if a == next {
			sm.Phase = next
			return true
		}
	}
	return false
}

func (sm *StateMachine) CanRead() (bool, string) {
	if sm.ReadCount >= sm.MaxReads {
		return false, fmt.Sprintf("Read budget exhausted (%d/%d). Use working set cache or justify additional reads.", sm.ReadCount, sm.MaxReads)
	}
	return true, ""
}

func (sm *StateMachine) RecordRead(file string) {
	sm.ReadCount++
	sm.FilesRead[file] = true
}

func (sm *StateMachine) RequestAdditionalReads(justification string) bool {
	sm.MaxReads += 5
	return true
}

func (sm *StateMachine) ShouldContinue() bool {
	return sm.Phase != PhaseDone
}

func (sm *StateMachine) FilesReadSlice() []string {
	var files []string
	for f := range sm.FilesRead {
		files = append(files, f)
	}
	return files
}

func (sm *StateMachine) PhasePrompt() string {
	switch sm.Phase {
	case PhaseAnalyzeProject:
		return "Phase: ANALYZE_PROJECT\nTask: Determine project structure, framework, and entrypoints. DO NOT read files yet."
	case PhaseBuildWorkingSet:
		return fmt.Sprintf("Phase: BUILD_WORKING_SET\nTask: Select the minimal files needed. Working set has %d files. Read budget: %d/%d remaining.",
			len(sm.WorkingSet.Files), sm.MaxReads-sm.ReadCount, sm.MaxReads)
	case PhasePlan:
		return fmt.Sprintf("Phase: PLAN\nTask: Create an edit plan. List files to edit, operations, and targets. Read budget: %d/%d remaining.",
			sm.MaxReads-sm.ReadCount, sm.MaxReads)
	case PhaseReadTargetFiles:
		return fmt.Sprintf("Phase: READ_TARGET_FILES\nTask: Read only the files in the working set that need modification. Read budget: %d/%d remaining.",
			sm.MaxReads-sm.ReadCount, sm.MaxReads)
	case PhaseGenerateDiff:
		return fmt.Sprintf("Phase: GENERATE_DIFF\nTask: Generate exact changes using apply_patch. Read budget: %d/%d.",
			sm.MaxReads-sm.ReadCount, sm.MaxReads)
	case PhaseApplyPatch:
		return "Phase: APPLY_PATCH\nTask: Apply the generated patches. Verify correctness."
	case PhaseVerifyBuild:
		return "Phase: VERIFY_BUILD\nTask: Run tests, check syntax, verify the build. Confirm completion."
	case PhaseDone:
		return "DONE"
	default:
		return "Phase: IDLE"
	}
}
