package gateway

import "testing"

func TestInferModelCapabilities(t *testing.T) {
	cases := []struct {
		id       string
		vision   bool
		imageGen bool
	}{
		{"gpt-4o", true, false},
		{"claude-3-7-sonnet", true, false},
		{"gemini-2.5-flash", true, false},
		{"gpt-image-1", true, true},
		{"dall-e-3", true, true},
		{"gemini-2.5-flash-image", true, true},
		{"deepseek-chat", false, false},
		{"qwen2.5:32b", false, false},
	}
	for _, c := range cases {
		vision, image := InferModelCapabilities(c.id)
		if vision != c.vision || image != c.imageGen {
			t.Errorf("%s: got vision=%v image=%v, want vision=%v image=%v", c.id, vision, image, c.vision, c.imageGen)
		}
	}
}

func TestModelCapabilityOverrides(t *testing.T) {
	yes := true
	no := false
	if !ModelSupportsVision(ModelItem{ID: "text-only-model", SupportsVision: &yes}) {
		t.Fatal("explicit vision override should win")
	}
	if ModelSupportsImageGen(ModelItem{ID: "dall-e-3", SupportsImageGen: &no}) {
		t.Fatal("explicit image override should win")
	}
}
