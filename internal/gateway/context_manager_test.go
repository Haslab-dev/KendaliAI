package gateway

import (
	"testing"
)

func TestModelContextCapacity(t *testing.T) {
	tests := []struct {
		model    string
		expected int
	}{
		// 1.05M models
		{"gpt-6-astra", 1050000},
		{"gpt-5-6-luna", 1050000},
		{"custom-gpt-6-experiment", 1050000},

		// 1M models
		{"deepseek-v4-flash", 1000000},
		{"deepseek-v4-1-flash", 1000000},
		{"glm-5-3-flash", 1000000},
		{"mimo-v2-5", 1000000},
		{"nemotron-3-super-120b-a12b", 1000000},
		{"nemotron-3-ultra-550b-a55b", 1000000},
		{"gemini-1.5-pro", 1000000},

		// 256K models
		{"gemma-4-31b", 256000},
		{"codestral-latest", 256000},

		// 200K models
		{"claude-3-7-sonnet", 200000},
		{"claude-3-5-sonnet-20241022", 200000},

		// 128K models
		{"gpt-oss-120b", 128000},
		{"qwen-3.8-27b", 128000},
		{"qwen3.7-flash-2026-07-15", 128000},
		{"MiniMax-M2.7-highspeed", 128000},
		{"nemotron-3.5-lightning-30b-a3b", 128000},
		{"nemotron-3-nano-omni-30b-a3b", 128000},
		{"nemotron-4-340b-instruct", 128000},
		{"mistral-small-latest", 128000},
		{"phi-3.5-moe-instruct", 128000},
		{"deepseek-r1-distill-llama-70b", 128000},
		{"laguna-s-2.1", 128000},
		{"laguna-xs-2.1", 128000},
		{"ling-3.0-flash-fin", 128000},
		{"north-mini-code", 128000},
		{"muse-spark-1.3-contributor", 128000},
		{"kira-3.5-flash", 128000},
		{"agnes-2-5-flash", 128000},
		{"gpt-4o", 128000},
		{"o3-mini", 128000},

		// 64K models
		{"deepseek-chat", 64000},

		// Standard open-weights fallback (32K)
		{"llama-3-70b-instruct", 32768},
		{"mistral-7b-instruct", 32768},
		{"unknown-local-model", 32768},
	}

	for _, tt := range tests {
		got := ModelContextCapacity(tt.model)
		if got != tt.expected {
			t.Errorf("ModelContextCapacity(%q) = %d; want %d", tt.model, got, tt.expected)
		}
	}
}

func TestResolveContextConfig(t *testing.T) {
	cfg1M := ResolveContextConfig("deepseek-v4-flash")
	if cfg1M.MaxRecentWindow != 80 || cfg1M.SafeTokenBudget != 750000 {
		t.Errorf("unexpected 1M context config: %+v", cfg1M)
	}

	cfg256K := ResolveContextConfig("codestral-latest")
	if cfg256K.MaxRecentWindow != 50 || cfg256K.SafeTokenBudget != 190000 {
		t.Errorf("unexpected 256K context config: %+v", cfg256K)
	}

	cfg128K := ResolveContextConfig("gpt-oss-120b")
	if cfg128K.MaxRecentWindow != 30 || cfg128K.SafeTokenBudget != 90000 {
		t.Errorf("unexpected 128K context config: %+v", cfg128K)
	}
}
