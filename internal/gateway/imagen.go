package gateway

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/kendaliai/app/internal/agent"
	"github.com/kendaliai/app/internal/config"
	"github.com/kendaliai/app/internal/providers"
)

// ResolveImageModel picks the provider + model used for image generation:
// explicit request > model flagged SupportsImageGen > configured default >
// name inference. Returns an actionable error when nothing is configured.
func (r *Runtime) ResolveImageModel(preferred string) (*ProviderConfig, string, error) {
	providersList, err := r.store.ListProviders()
	if err != nil {
		return nil, "", fmt.Errorf("list providers: %w", err)
	}

	findModel := func(model string) (*ProviderConfig, string, bool) {
		if strings.TrimSpace(model) == "" {
			return nil, "", false
		}
		for i := range providersList {
			p := providersList[i]
			if !p.Enabled {
				continue
			}
			for _, m := range p.Models {
				if !m.Enabled {
					continue
				}
				if strings.EqualFold(m.ID, model) || strings.EqualFold(m.Name, model) {
					return &p, m.ID, true
				}
			}
		}
		return nil, "", false
	}

	if p, model, ok := findModel(preferred); ok {
		return p, model, nil
	}

	for i := range providersList {
		p := providersList[i]
		if !p.Enabled {
			continue
		}
		for _, m := range p.Models {
			if m.Enabled && ModelSupportsImageGen(m) {
				return &p, m.ID, nil
			}
		}
	}

	if config.Cfg != nil && strings.TrimSpace(config.Cfg.DefaultImageModel) != "" {
		if p, model, ok := findModel(config.Cfg.DefaultImageModel); ok {
			return p, model, nil
		}
	}

	return nil, "", fmt.Errorf("no image-generation model configured. Add a provider model such as gpt-image-1, dall-e-3, imagen-3.0-generate-002, or gemini-2.5-flash-image in Settings → Providers, enable its image capability, and optionally set it as the default image model")
}

// ImageGenTool exposes model-based raster image generation to the agent.
func (r *Runtime) ImageGenTool(sessionID string) agent.ToolDef {
	return agent.ToolDef{
		Name:        "generate_image",
		Description: "Generate a raster image from a text prompt using the configured image-generation model (OpenAI-compatible /images/generations or Gemini). Returns a previewable workspace file. Use `image_generate` instead for offline vector/SVG diagrams.",
		Signature:   `{"prompt": "string - detailed visual description", "model": "string - optional image model id", "size": "string - optional e.g. 1024x1024", "quality": "string - optional low|medium|high", "path": "string - optional output filename/path"}`,
		Category:    "visual",
		Execute: func(ctx context.Context, args map[string]interface{}) string {
			return r.generateImage(ctx, sessionID, args)
		},
	}
}

func (r *Runtime) generateImage(ctx context.Context, sessionID string, args map[string]interface{}) string {
	prompt := strings.TrimSpace(stringArg(args, "prompt"))
	if prompt == "" {
		return "Error: generate_image requires a non-empty 'prompt'."
	}

	provCfg, model, err := r.ResolveImageModel(stringArg(args, "model"))
	if err != nil {
		return "Error: " + err.Error()
	}

	imgCtx, cancel := context.WithTimeout(ctx, 3*time.Minute)
	defer cancel()

	result, err := providers.GenerateImage(imgCtx,
		providers.ProviderImageConfig{Type: provCfg.Type, Endpoint: provCfg.Endpoint, APIKey: provCfg.APIKey},
		providers.ImageRequest{
			Prompt:  prompt,
			Model:   model,
			Size:    stringArg(args, "size"),
			Quality: stringArg(args, "quality"),
		})
	if err != nil {
		return fmt.Sprintf("Error: image generation failed: %v", err)
	}

	ext := imageExtForMime(result.Mime)
	relPath, absPath, err := r.resolveGeneratedImagePath(stringArg(args, "path"), ext)
	if err != nil {
		return "Error: " + err.Error()
	}
	if err := os.MkdirAll(filepath.Dir(absPath), 0755); err != nil {
		return "Error: failed to create image directory: " + err.Error()
	}
	if err := os.WriteFile(absPath, result.Data, 0644); err != nil {
		return "Error: failed to write image: " + err.Error()
	}

	previewURL := fmt.Sprintf("/api/workspace/preview?path=%s", url.QueryEscape(relPath))
	downloadURL := fmt.Sprintf("/api/workspace/download?path=%s", url.QueryEscape(relPath))
	note := ""
	if result.RevisedPrompt != "" && result.RevisedPrompt != prompt {
		note = fmt.Sprintf("\n_Revised prompt: %s_", result.RevisedPrompt)
	}

	_ = sessionID // reserved for per-session generated-asset tracking
	return fmt.Sprintf("![%s](%s)\n\nGenerated **%s** with `%s` (%d bytes). [Preview](%s) · [Download](%s)%s",
		filepath.Base(relPath), previewURL, filepath.Base(relPath), model, len(result.Data), previewURL, downloadURL, note)
}

func imageExtForMime(mimeType string) string {
	switch strings.ToLower(mimeType) {
	case "image/jpeg", "image/jpg":
		return ".jpg"
	case "image/webp":
		return ".webp"
	case "image/gif":
		return ".gif"
	default:
		return ".png"
	}
}

// resolveGeneratedImagePath keeps generated images inside the workspace.
func (r *Runtime) resolveGeneratedImagePath(requested, ext string) (relPath, absPath string, err error) {
	base := r.workRoot
	if requested == "" {
		relPath = filepath.Join("generated", "images", fmt.Sprintf("img-%d%s", time.Now().UnixMilli(), ext))
	} else {
		cleaned := filepath.Clean(strings.TrimSpace(requested))
		if strings.HasPrefix(cleaned, "/workspaces/") || strings.HasPrefix(cleaned, "workspaces/") {
			cleaned = strings.TrimPrefix(strings.TrimPrefix(cleaned, "/workspaces/"), "workspaces/")
		}
		if filepath.Ext(cleaned) == "" {
			cleaned += ext
		}
		if filepath.IsAbs(cleaned) {
			rel, relErr := filepath.Rel(base, cleaned)
			if relErr != nil || strings.HasPrefix(rel, "..") {
				return "", "", fmt.Errorf("path must stay inside the workspace")
			}
			relPath = rel
		} else {
			relPath = cleaned
		}
	}

	absPath = filepath.Join(base, relPath)
	rel, err := filepath.Rel(base, absPath)
	if err != nil || strings.HasPrefix(rel, "..") {
		return "", "", fmt.Errorf("path must stay inside the workspace")
	}
	return relPath, absPath, nil
}
