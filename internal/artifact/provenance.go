package artifact

import (
	"sync"
	"time"
)

type Artifact struct {
	ID          string    `json:"id"`
	Path        string    `json:"path"`
	Workspace   string    `json:"workspace"`
	SessionID   string    `json:"sessionId"`
	GoalID      string    `json:"goalId"`
	AgentPID    string    `json:"agentPid"`
	TaskID      string    `json:"taskId"`
	Version     int       `json:"version"`
	Hash        string    `json:"hash"`
	DerivedFrom []string  `json:"derivedFrom,omitempty"`
	ProducedBy  string    `json:"producedBy"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type ArtifactProvenanceGraph struct {
	mu        sync.RWMutex
	artifacts map[string]*Artifact
}

func NewArtifactProvenanceGraph() *ArtifactProvenanceGraph {
	return &ArtifactProvenanceGraph{
		artifacts: make(map[string]*Artifact),
	}
}

func (ap *ArtifactProvenanceGraph) Add(art *Artifact) {
	ap.mu.Lock()
	defer ap.mu.Unlock()
	ap.artifacts[art.ID] = art
}

func (ap *ArtifactProvenanceGraph) Get(id string) (*Artifact, bool) {
	ap.mu.RLock()
	defer ap.mu.RUnlock()
	art, ok := ap.artifacts[id]
	return art, ok
}

func (ap *ArtifactProvenanceGraph) List() []*Artifact {
	ap.mu.RLock()
	defer ap.mu.RUnlock()

	list := make([]*Artifact, 0, len(ap.artifacts))
	for _, art := range ap.artifacts {
		list = append(list, art)
	}
	return list
}
