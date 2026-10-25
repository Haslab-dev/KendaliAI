package gateway

import "strings"

// InferModelCapabilities derives vision / image-generation support from a
// model id. Explicit provider-level overrides (ModelItem.SupportsVision /
// SupportsImageGen) always win.
func InferModelCapabilities(id string) (vision bool, imageGen bool) {
	m := strings.ToLower(strings.TrimSpace(id))
	if m == "" {
		return false, false
	}

	visionMarkers := []string{
		"gpt-4o", "gpt-4.1", "gpt-4-turbo", "gpt-4-vision", "gpt-5", "gpt-6",
		"o1", "o3", "o4-mini",
		"claude-3", "claude-4", "claude-sonnet", "claude-opus", "claude-haiku",
		"gemini", "gemma-3",
		"llama-3.2", "llama-4", "llava", "internvl",
		"qwen-vl", "qwen2-vl", "qwen2.5-vl", "qwen3-vl",
		"pixtral", "mimo-v2", "glm-4v", "glm-4.5v", "deepseek-vl",
		"mistral-small", "molmo", "phi-4-multimodal",
	}
	for _, marker := range visionMarkers {
		if strings.Contains(m, marker) {
			vision = true
			break
		}
	}

	imageMarkers := []string{
		"gpt-image", "dall-e", "dalle",
		"imagen", "gemini-2.5-flash-image", "gemini-3-pro-image", "gemini-2.0-flash-exp-image",
		"flux", "stable-diffusion", "sdxl", "seedream", "ideogram", "recraft",
	}
	for _, marker := range imageMarkers {
		if strings.Contains(m, marker) {
			imageGen = true
			break
		}
	}
	// Image models are inherently multimodal inputs as well.
	if imageGen {
		vision = true
	}
	return vision, imageGen
}

// ModelSupportsVision reports whether a model accepts inline images.
func ModelSupportsVision(item ModelItem) bool {
	if item.SupportsVision != nil {
		return *item.SupportsVision
	}
	v, _ := InferModelCapabilities(item.ID)
	return v
}

// ModelSupportsImageGen reports whether a model can generate images.
func ModelSupportsImageGen(item ModelItem) bool {
	if item.SupportsImageGen != nil {
		return *item.SupportsImageGen
	}
	_, img := InferModelCapabilities(item.ID)
	return img
}

// modelVisionCapability resolves vision support for a model within a provider.
func modelVisionCapability(provCfg *ProviderConfig, model string) bool {
	if provCfg != nil {
		for _, item := range provCfg.Models {
			if strings.EqualFold(item.ID, model) {
				return ModelSupportsVision(item)
			}
		}
	}
	vision, _ := InferModelCapabilities(model)
	return vision
}
