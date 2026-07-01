package providers

import (
	"context"
	"errors"
	"fmt"
	"log"

	"github.com/kendaliai/app/internal/agent"
	"github.com/kendaliai/app/internal/config"
)

type MultiProviderRouter struct {
	providers []agent.Provider
}

func NewMultiProviderRouter(cfg *config.Config) *MultiProviderRouter {
	var list []agent.Provider

	for _, p := range cfg.ChatProviders {
		switch p.Type {
		case "openai", "openai-compatible", "deepseek":
			prov := NewProvider(p.APIKey, p.Model, p.Endpoint)
			list = append(list, prov)
		case "anthropic":
			prov := NewAnthropicProvider(p.APIKey, p.Model, p.Endpoint)
			list = append(list, prov)
		}
	}

	if len(list) == 0 {
		log.Println("⚠️ No chat providers loaded in MultiProviderRouter")
	}

	return &MultiProviderRouter{
		providers: list,
	}
}

func (r *MultiProviderRouter) ChatCompletion(ctx context.Context, msgs []agent.Message) (*agent.Response, error) {
	var errs []error
	for idx, p := range r.providers {
		resp, err := p.ChatCompletion(ctx, msgs)
		if err == nil {
			return resp, nil
		}
		log.Printf("⚠️ Provider %d failed: %v. Trying fallback...", idx, err)
		errs = append(errs, err)
	}

	if len(errs) == 0 {
		return nil, errors.New("no chat providers configured")
	}

	return nil, fmt.Errorf("all providers failed: %v", errs)
}
