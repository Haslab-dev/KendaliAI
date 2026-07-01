package events

import (
	"sync"
)

type Projection interface {
	On(event Event)
}

type GoalProjection struct {
	mu     sync.Mutex
	Status map[string]string
}

func NewGoalProjection() *GoalProjection {
	return &GoalProjection{
		Status: make(map[string]string),
	}
}

func (gp *GoalProjection) On(ev Event) {
	gp.mu.Lock()
	defer gp.mu.Unlock()

	if ev.Type == "GoalUpdated" || ev.Type == "TaskStarted" {
		gp.Status[ev.GoalID] = "In Progress"
	} else if ev.Type == "TaskCompleted" {
		gp.Status[ev.GoalID] = "Completed"
	}
}

type MetricsProjection struct {
	mu          sync.Mutex
	TokenUsage  int
	CostSummary float64
}

func NewMetricsProjection() *MetricsProjection {
	return &MetricsProjection{}
}

func (mp *MetricsProjection) On(ev Event) {
	mp.mu.Lock()
	defer mp.mu.Unlock()

	if ev.Type == "MetricsRecorded" {
		mp.TokenUsage += 100
		mp.CostSummary += 0.05
	}
}

type ProjectionRegistry struct {
	mu          sync.Mutex
	projections []Projection
}

func NewProjectionRegistry() *ProjectionRegistry {
	return &ProjectionRegistry{}
}

func (pr *ProjectionRegistry) Register(p Projection) {
	pr.mu.Lock()
	defer pr.mu.Unlock()
	pr.projections = append(pr.projections, p)
}

func (pr *ProjectionRegistry) Apply(ev Event) {
	pr.mu.Lock()
	defer pr.mu.Unlock()

	for _, p := range pr.projections {
		p.On(ev)
	}
}
