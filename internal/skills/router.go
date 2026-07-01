package skills

import (
	"context"
	"strings"
	"sync"

	"github.com/kendaliai/app/internal/embedding"
)

type Router struct {
	manager *Manager
	mu      sync.RWMutex
	cache   map[string][]float32
	client  *embedding.Client
}

func NewRouter(manager *Manager) *Router {
	return &Router{
		manager: manager,
		cache:   make(map[string][]float32),
	}
}

func (r *Router) Match(ctx context.Context, message string) (*SkillSpec, float64, error) {
	specs, err := r.manager.List()
	if err != nil || len(specs) == 0 {
		return nil, 0, nil
	}

	if r.client == nil {
		r.client = embedding.NewClient()
	}

	vecs, err := r.client.Embed(ctx, []string{message})
	if err != nil || len(vecs) == 0 {
		return nil, 0, nil
	}
	msgEmb := vecs[0]

	var bestSpec *SkillSpec
	bestScore := 0.0

	for _, spec := range specs {
		score := r.keywordScore(message, spec)
		embScore := r.embeddingScore(msgEmb, spec.ID)
		combined := score*0.3 + embScore*0.7

		if combined > bestScore {
			bestScore = combined
			s := spec
			bestSpec = &s
		}
	}

	threshold := 0.6
	if bestSpec != nil && bestSpec.Routing.Threshold > 0 {
		threshold = bestSpec.Routing.Threshold
	}

	if bestScore >= threshold {
		return bestSpec, bestScore, nil
	}

	return nil, bestScore, nil
}

func (r *Router) keywordScore(message string, spec SkillSpec) float64 {
	lower := strings.ToLower(message)
	matches := 0
	total := len(spec.Routing.Keywords)

	if total == 0 {
		return 0.2
	}

	for _, kw := range spec.Routing.Keywords {
		if strings.Contains(lower, strings.ToLower(kw)) {
			matches++
		}
	}

	if matches == 0 {
		return 0.1
	}

	score := float64(matches) / float64(total)
	nameLower := strings.ToLower(spec.Name)
	if strings.Contains(lower, nameLower) {
		score += 0.2
	}
	if score > 1.0 {
		score = 1.0
	}
	return score
}

func (r *Router) embeddingScore(msgEmb embedding.Vector, skillID string) float64 {
	r.mu.RLock()
	skillEmb, ok := r.cache[skillID]
	r.mu.RUnlock()

	if !ok {
		pkg, err := r.manager.Get(skillID)
		if err != nil {
			return 0.0
		}
		if r.client == nil {
			r.client = embedding.NewClient()
		}

		text := pkg.Spec.Name + " " + pkg.Spec.Description + " " + pkg.Prompt
		if len(text) > 500 {
			text = text[:500]
		}

		vecs, err := r.client.Embed(context.Background(), []string{text})
		if err != nil || len(vecs) == 0 {
			return 0.0
		}

		r.mu.Lock()
		r.cache[skillID] = vecs[0]
		r.mu.Unlock()
		skillEmb = vecs[0]
	}

	if len(msgEmb) == 0 || len(skillEmb) == 0 {
		return 0.0
	}

	return cosineSimilarity(msgEmb, skillEmb)
}

func cosineSimilarity(a, b embedding.Vector) float64 {
	if len(a) != len(b) || len(a) == 0 {
		return 0
	}
	var dot, normA, normB float64
	for i := range a {
		dot += float64(a[i]) * float64(b[i])
		normA += float64(a[i]) * float64(a[i])
		normB += float64(b[i]) * float64(b[i])
	}
	if normA == 0 || normB == 0 {
		return 0
	}
	return dot / (normA * normB)
}
