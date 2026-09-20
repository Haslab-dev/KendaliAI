package config

import "runtime"

// ComputerUseConfig gates the macOS desktop-control tool set. When Enabled is
// nil the tools register on darwin and stay off elsewhere. Per-tool calls are
// additionally subject to the agent policy engine (internal/policy).
type ComputerUseConfig struct {
	Enabled *bool `json:"enabled,omitempty" yaml:"enabled,omitempty"`
}

// ComputerUseEnabled reports whether computer-use tools should be registered.
func ComputerUseEnabled(cfg *Config) bool {
	if cfg == nil || cfg.ComputerUse.Enabled == nil {
		return runtime.GOOS == "darwin"
	}
	return *cfg.ComputerUse.Enabled
}
