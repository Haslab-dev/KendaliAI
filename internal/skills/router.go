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

	var bestSpec *SkillSpec
	bestScore := 0.0

	for _, spec := range specs {
		score := r.keywordScore(message, spec)

		if score >= 0.85 {
			s := spec
			bestSpec = &s
			bestScore = score
			break
		}

		if score > 0.2 {
			embScore := r.embeddingScore(message, spec)
			combined := score*0.5 + embScore*0.5

			if combined > bestScore {
				bestScore = combined
				s := spec
				bestSpec = &s
			}
		}
	}

	threshold := 0.35
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
	lower = strings.ReplaceAll(lower, ",", " ")
	lower = strings.ReplaceAll(lower, ".", " ")
	specID := strings.ToLower(spec.ID)
	specName := strings.ToLower(spec.Name)
	specNameClean := strings.ReplaceAll(specName, "-", " ")
	specIDClean := strings.ReplaceAll(specID, "-", " ")

	if strings.Contains(lower, strings.ReplaceAll("gunakan skill "+specName, "-", " ")) ||
		strings.Contains(lower, strings.ReplaceAll("gunakan skill "+specID, "-", " ")) ||
		strings.Contains(lower, strings.ReplaceAll("use skill "+specName, "-", " ")) ||
		strings.Contains(lower, strings.ReplaceAll("use skill "+specID, "-", " ")) {
		return 0.95
	}

	if strings.Contains(lower, specNameClean) || strings.Contains(lower, specIDClean) {
		return 0.85
	}

	matches := 0
	total := len(spec.Routing.Keywords)

	for _, kw := range spec.Routing.Keywords {
		kw = strings.TrimSpace(strings.ToLower(kw))
		kw = strings.Trim(kw, ".,;:()[]{}!@#$%^&*\"'")
		if len(kw) < 2 {
			continue
		}
		if strings.Contains(lower, kw) {
			matches++
		}
	}

	effectiveTotal := total
	if effectiveTotal == 0 {
		return 0.15
	}

	if matches == 0 {
		shortWords := 0
		for _, kw := range spec.Routing.Keywords {
			kw = strings.TrimSpace(strings.ToLower(kw))
			kw = strings.Trim(kw, ".,;:()[]{}!@#$%^&*\"'")
			if len(kw) >= 2 && strings.Contains(lower, kw) {
				shortWords++
			}
		}
		if shortWords > 0 {
			return 0.35
		}
		return 0.0
	}

	score := float64(matches) / float64(effectiveTotal)
	if score < 0.1 && matches >= 2 {
		score = 0.3
	}
	if score > 0.95 {
		score = 0.95
	}
	return score
}

func (r *Router) embeddingScore(message string, spec SkillSpec) float64 {
	if r.client == nil {
		r.client = embedding.NewClient()
	}

	vecs, err := r.client.Embed(context.Background(), []string{message})
	if err != nil || len(vecs) == 0 {
		return 0.0
	}
	msgEmb := vecs[0]

	skillID := spec.ID
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
