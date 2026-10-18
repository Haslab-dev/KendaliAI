package config

import (
	"encoding/json"
	"testing"

	"gopkg.in/yaml.v3"
)

func TestEngineConfig_EnableJevDefaults(t *testing.T) {
	// 1. Nil config safe check
	var nilCfg *Config
	if nilCfg.EngineEnableJev() {
		t.Error("expected nil config EngineEnableJev() to be false")
	}

	// 2. Default initialized config has EnableJev = false
	cfg := &Config{}
	if cfg.EngineEnableJev() {
		t.Error("expected default EngineEnableJev() to be false")
	}
	if cfg.Engine.EnableJev {
		t.Error("expected default cfg.Engine.EnableJev to be false")
	}

	// 3. YAML unmarshaling with enableJev: false
	yamlDefault := `
version: 1
engine:
  kind: rakit
  jevApiKey: ""
`
	var cfgYaml Config
	if err := yaml.Unmarshal([]byte(yamlDefault), &cfgYaml); err != nil {
		t.Fatalf("unmarshal yaml: %v", err)
	}
	if cfgYaml.EngineEnableJev() {
		t.Error("expected EngineEnableJev() to be false when omitted in YAML")
	}

	// 4. YAML unmarshaling with enableJev: true
	yamlEnabled := `
version: 1
engine:
  kind: rakit
  enableJev: true
  jevApiKey: "sk-test-123"
  jevEndpoint: "https://jev.typesafe.ai/v1"
`
	var cfgYaml2 Config
	if err := yaml.Unmarshal([]byte(yamlEnabled), &cfgYaml2); err != nil {
		t.Fatalf("unmarshal yaml: %v", err)
	}
	if !cfgYaml2.EngineEnableJev() {
		t.Error("expected EngineEnableJev() to be true when enabled in YAML")
	}
	if cfgYaml2.Engine.JevApiKey != "sk-test-123" {
		t.Errorf("expected jevApiKey 'sk-test-123', got %q", cfgYaml2.Engine.JevApiKey)
	}

	// 5. JSON unmarshaling with enableJev
	jsonEnabled := `{"version":1,"engine":{"kind":"rakit","enableJev":true,"jevApiKey":"sk-json"}}`
	var cfgJSON Config
	if err := json.Unmarshal([]byte(jsonEnabled), &cfgJSON); err != nil {
		t.Fatalf("unmarshal json: %v", err)
	}
	if !cfgJSON.EngineEnableJev() {
		t.Error("expected EngineEnableJev() to be true when enabled in JSON")
	}
}
