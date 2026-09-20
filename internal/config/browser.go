package config

// BrowserUseConfig gates the browser-use tool set (internal/browser). When
// Enabled is nil the tools register. Headless defaults to true; set true to
// run a visible Chromium window. Per-tool calls remain subject to the agent
// policy engine (internal/policy).
type BrowserUseConfig struct {
	Enabled     *bool  `json:"enabled,omitempty" yaml:"enabled,omitempty"`
	Headless    *bool  `json:"headless,omitempty" yaml:"headless,omitempty"`
	ExecPath    string `json:"execPath,omitempty" yaml:"execPath,omitempty"`
	UserDataDir string `json:"userDataDir,omitempty" yaml:"userDataDir,omitempty"`
	WindowW     int    `json:"windowW,omitempty" yaml:"windowW,omitempty"`
	WindowH     int    `json:"windowH,omitempty" yaml:"windowH,omitempty"`
}

// BrowserUseEnabled reports whether browser-use tools should be registered.
func BrowserUseEnabled(cfg *Config) bool {
	return cfg == nil || cfg.BrowserUse.Enabled == nil || *cfg.BrowserUse.Enabled
}
