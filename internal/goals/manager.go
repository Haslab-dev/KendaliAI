package goals

import (
	"errors"
	"sync"
	"time"

	"github.com/google/uuid"
)

type GoalStatus string

const (
	GoalActive    GoalStatus = "active"
	GoalPaused    GoalStatus = "paused"
	GoalCompleted GoalStatus = "completed"
	GoalCancelled GoalStatus = "cancelled"
	GoalFailed    GoalStatus = "failed"
)

type Priority int

const (
	PriorityLow      Priority = 1
	PriorityMedium   Priority = 5
	PriorityHigh     Priority = 10
	PriorityCritical Priority = 100
)

type ConstraintType string

const (
	ConstraintBudget ConstraintType = "budget"
	ConstraintTime   ConstraintType = "time"
	ConstraintTech   ConstraintType = "technology"
	ConstraintStyle  ConstraintType = "style"
	ConstraintScope  ConstraintType = "scope"
)

type Constraint struct {
	Type  ConstraintType `json:"type"`
	Key   string         `json:"key"`
	Value interface{}    `json:"value"`
	Hard  bool           `json:"hard"`
}

type CriterionStatus string

const (
	CriterionPending CriterionStatus = "pending"
	CriterionMet     CriterionStatus = "met"
	CriterionUnmet   CriterionStatus = "unmet"
	CriterionPartial CriterionStatus = "partial"
)

type AcceptanceCriterion struct {
	ID          string          `json:"id"`
	Description string          `json:"description"`
	Status      CriterionStatus `json:"status"`
	Evidence    []string        `json:"evidence,omitempty"`
}

type Goal struct {
	ID           string                `json:"id"`
	ParentID     *string               `json:"parentId,omitempty"`
	RootID       string                `json:"rootId"`
	Title        string                `json:"title"`
	Description  string                `json:"description"`
	Status       GoalStatus            `json:"status"`
	Priority     Priority              `json:"priority"`
	Constraints  []Constraint          `json:"constraints,omitempty"`
	Acceptance   []AcceptanceCriterion `json:"acceptance,omitempty"`
	Dependencies []string              `json:"dependencies,omitempty"`
	CreatedAt    time.Time             `json:"createdAt"`
	UpdatedAt    time.Time             `json:"updatedAt"`
	CompletedAt  *time.Time            `json:"completedAt,omitempty"`
}

type GoalGraph struct {
	mu       sync.RWMutex
	goals    map[string]*Goal
	children map[string][]string
	parents  map[string]string
	roots    []string
}

func NewGoalGraph() *GoalGraph {
	return &GoalGraph{
		goals:    make(map[string]*Goal),
		children: make(map[string][]string),
		parents:  make(map[string]string),
	}
}

type GoalManager struct {
	graphs map[string]*GoalGraph
	mu     sync.RWMutex
}

func NewGoalManager() *GoalManager {
	return &GoalManager{
		graphs: make(map[string]*GoalGraph),
	}
}

func (gm *GoalManager) GetGraph(sessionID string) *GoalGraph {
	gm.mu.Lock()
	defer gm.mu.Unlock()
	g, ok := gm.graphs[sessionID]
	if !ok {
		g = NewGoalGraph()
		gm.graphs[sessionID] = g
	}
	return g
}

func (gg *GoalGraph) CreateRootGoal(title, desc string) *Goal {
	gg.mu.Lock()
	defer gg.mu.Unlock()

	id := "g-" + uuid.New().String()[:8]
	g := &Goal{
		ID:          id,
		RootID:      id,
		Title:       title,
		Description: desc,
		Status:      GoalActive,
		Priority:    PriorityMedium,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	gg.goals[id] = g
	gg.roots = append(gg.roots, id)
	return g
}

func (gg *GoalGraph) CreateSubGoal(parentID string, title, desc string) (*Goal, error) {
	gg.mu.Lock()
	defer gg.mu.Unlock()

	parent, ok := gg.goals[parentID]
	if !ok {
		return nil, errors.New("parent goal not found")
	}

	id := "g-" + uuid.New().String()[:8]
	g := &Goal{
		ID:          id,
		ParentID:    &parentID,
		RootID:      parent.RootID,
		Title:       title,
		Description: desc,
		Status:      GoalActive,
		Priority:    PriorityMedium,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	gg.goals[id] = g
	gg.children[parentID] = append(gg.children[parentID], id)
	gg.parents[id] = parentID
	return g, nil
}

func (gg *GoalGraph) GetGoal(id string) (*Goal, bool) {
	gg.mu.RLock()
	defer gg.mu.RUnlock()
	g, ok := gg.goals[id]
	return g, ok
}

func (gg *GoalGraph) UpdateGoalStatus(id string, status GoalStatus) error {
	gg.mu.Lock()
	defer gg.mu.Unlock()

	g, ok := gg.goals[id]
	if !ok {
		return errors.New("goal not found")
	}

	g.Status = status
	g.UpdatedAt = time.Now()
	if status == GoalCompleted {
		now := time.Now()
		g.CompletedAt = &now
	}
	return nil
}

func (gg *GoalGraph) GetRoots() []string {
	gg.mu.RLock()
	defer gg.mu.RUnlock()
	return gg.roots
}
