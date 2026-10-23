package acp

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"gopkg.in/yaml.v3"
)

var (
	catalogCacheMu   sync.RWMutex
	catalogCacheTime time.Time
	cachedModels     = make(map[string][]string)
	cachedDefaults   = make(map[string]string)
)

const catalogCacheTTL = 5 * time.Minute

// EnrichAgentDescriptors enriches a list of AgentDescriptors with real on-disk
// and CLI discovered models and default model choices.
func EnrichAgentDescriptors(descriptors []AgentDescriptor) []AgentDescriptor {
	home, err := os.UserHomeDir()
	if err != nil {
		return descriptors
	}

	catalogCacheMu.RLock()
	isFresh := time.Since(catalogCacheTime) < catalogCacheTTL && len(cachedModels) > 0
	catalogCacheMu.RUnlock()

	if !isFresh {
		refreshCatalogCache(home)
	}

	catalogCacheMu.RLock()
	defer catalogCacheMu.RUnlock()

	result := make([]AgentDescriptor, len(descriptors))
	for i, d := range descriptors {
		normID := NormalizeAgentID(d.ID)
		if models, ok := cachedModels[normID]; ok && len(models) > 0 {
			d.SupportedModels = models
		}
		if def, ok := cachedDefaults[normID]; ok && def != "" {
			d.DefaultModel = def
		} else if len(d.SupportedModels) > 0 && d.DefaultModel == "" {
			d.DefaultModel = d.SupportedModels[0]
		}
		result[i] = d
	}

	return result
}

// RefreshCatalogCacheAsync refreshes the catalog cache in a background goroutine.
func RefreshCatalogCacheAsync() {
	go func() {
		home, err := os.UserHomeDir()
		if err == nil {
			refreshCatalogCache(home)
		}
	}()
}

func refreshCatalogCache(home string) {
	catalogCacheMu.Lock()
	defer catalogCacheMu.Unlock()

	// Double-check TTL
	if time.Since(catalogCacheTime) < 30*time.Second && len(cachedModels) > 0 {
		return
	}

	newModels := make(map[string][]string)
	newDefaults := make(map[string]string)

	// 1. Command Code
	if m, def := discoverCommandCodeModels(home); len(m) > 0 {
		newModels["commandcode"] = m
		newDefaults["commandcode"] = def
	}

	// 2. Google Antigravity
	if m, def := discoverAgyModels(home); len(m) > 0 {
		newModels["agy"] = m
		newDefaults["agy"] = def
	}

	// 3. OpenCode
	if m, def := discoverOpenCodeModels(home); len(m) > 0 {
		newModels["opencode"] = m
		newDefaults["opencode"] = def
	}

	// 4. Oh My Pi (OMP)
	if m, def := discoverOmpModels(home); len(m) > 0 {
		newModels["omp"] = m
		newDefaults["omp"] = def
	}

	// 5. Pi Agent
	if m, def := discoverPiModels(home); len(m) > 0 {
		newModels["pi"] = m
		newDefaults["pi"] = def
	}

	// 6. Claude Code
	if m, def := discoverClaudeCodeModels(home); len(m) > 0 {
		newModels["claude-code"] = m
		newDefaults["claude-code"] = def
	}

	// 7. OpenAI Codex
	if m, def := discoverCodexModels(home); len(m) > 0 {
		newModels["codex"] = m
		newDefaults["codex"] = def
	}

	for k, v := range newModels {
		cachedModels[k] = v
	}
	for k, v := range newDefaults {
		cachedDefaults[k] = v
	}
	catalogCacheTime = time.Now()
}

// discoverCommandCodeModels finds real models from catalog cache or by running `cmd --list-models`.
func discoverCommandCodeModels(home string) ([]string, string) {
	configRoot := filepath.Join(home, ".commandcode")
	defaultModel := "deepseek/deepseek-v4-flash"

	// Read config.json
	configPath := filepath.Join(configRoot, "config.json")
	if data, err := os.ReadFile(configPath); err == nil {
		var doc struct {
			Model string `json:"model"`
		}
		if err := json.Unmarshal(data, &doc); err == nil && doc.Model != "" {
			defaultModel = doc.Model
		}
	}

	seen := make(map[string]bool)
	var result []string
	addModel := func(m string) {
		m = strings.TrimSpace(m)
		if m != "" && !seen[m] {
			seen[m] = true
			result = append(result, m)
		}
	}

	// Strategy A: Read cached catalog JSON files from ~/.commandcode/cache/model-catalog/v1/
	cacheDir := filepath.Join(configRoot, "cache", "model-catalog", "v1")
	if entries, err := os.ReadDir(cacheDir); err == nil {
		for _, e := range entries {
			if strings.HasPrefix(e.Name(), "catalog-") && strings.HasSuffix(e.Name(), ".json") {
				catalogPath := filepath.Join(cacheDir, e.Name())
				if content, err := os.ReadFile(catalogPath); err == nil {
					var cat struct {
						Body struct {
							Data []struct {
								ID string `json:"id"`
							} `json:"data"`
						} `json:"body"`
					}
					if err := json.Unmarshal(content, &cat); err == nil {
						for _, item := range cat.Body.Data {
							addModel(item.ID)
						}
					}
				}
			}
		}
	}

	if len(result) > 0 {
		return result, defaultModel
	}

	// Strategy B: Run `cmd --list-models` if available
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	cmdPath := "cmd"
	if found, err := ResolveExecutablePath("cmd"); err == nil {
		cmdPath = found
	}

	cmd := exec.CommandContext(ctx, cmdPath, "--list-models")
	cmd.Env = enrichedEnv(nil)
	out, err := cmd.Output()
	if err == nil && len(out) > 0 {
		lines := strings.Split(string(out), "\n")
		modelLineRe := regexp.MustCompile(`^([a-zA-Z0-9_\-\.\:\/]+)\s+`)
		for _, l := range lines {
			l = strings.TrimSpace(l)
			if l == "" || strings.HasPrefix(l, "Available models") || strings.HasPrefix(l, "Pass the full id") || strings.HasPrefix(l, "Docs:") || strings.HasPrefix(l, "cmd --model") {
				continue
			}
			matches := modelLineRe.FindStringSubmatch(l)
			if len(matches) > 1 {
				m := matches[1]
				if !strings.HasPrefix(m, "http") && !strings.Contains(l, "Decision models") {
					addModel(m)
				}
			}
		}
	}

	return result, defaultModel
}

// discoverAgyModels queries Google Antigravity CLI for available models.
func discoverAgyModels(home string) ([]string, string) {
	defaultModel := "gemini-3.8-flash-high"

	// Read ~/.gemini/antigravity-cli/settings.json
	settingsPath := filepath.Join(home, ".gemini", "antigravity-cli", "settings.json")
	if data, err := os.ReadFile(settingsPath); err == nil {
		var doc struct {
			Model string `json:"model"`
		}
		if err := json.Unmarshal(data, &doc); err == nil && doc.Model != "" {
			// Convert human label like "Gemini 3.8 Flash (High)" to slug if needed
			mNorm := strings.ToLower(doc.Model)
			if strings.Contains(mNorm, "gemini 3.8 flash (high)") {
				defaultModel = "gemini-3.8-flash-high"
			} else if strings.Contains(mNorm, "gemini 4 argon (medium)") {
				defaultModel = "gemini-4-argon-medium"
			} else {
				defaultModel = doc.Model
			}
		}
	}

	cmdPath := "agy"
	if found, err := ResolveExecutablePath("agy"); err == nil {
		cmdPath = found
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3500*time.Millisecond)
	defer cancel()

	cmd := exec.CommandContext(ctx, cmdPath, "models")
	cmd.Env = enrichedEnv(nil)
	out, err := cmd.Output()

	seen := make(map[string]bool)
	var result []string
	addModel := func(m string) {
		m = strings.TrimSpace(m)
		if m != "" && !seen[m] {
			seen[m] = true
			result = append(result, m)
		}
	}

	if err == nil && len(out) > 0 {
		lines := strings.Split(string(out), "\n")
		// Match lines where first word is a model identifier
		modelRe := regexp.MustCompile(`^[a-zA-Z0-9_\-\.\:]+`)
		for _, l := range lines {
			l = strings.TrimSpace(l)
			// Remove any ANSI escape sequences or spinners
			l = cleanAgyLine(l)
			if l == "" || strings.Contains(l, "Fetching available") {
				continue
			}
			parts := strings.Fields(l)
			if len(parts) >= 1 && modelRe.MatchString(parts[0]) {
				addModel(parts[0])
			}
		}
	}

	// If CLI didn't return models, provide current standard high-profile list
	if len(result) == 0 {
		fallback := []string{
			"gemini-4-argon-medium",
			"gemini-4-argon-high",
			"gemini-4-argon-low",
			"gemini-3.8-flash-high",
			"gemini-3.8-flash-medium",
			"gemini-3.8-flash-low",
			"claude-opus-5-5-high",
			"claude-opus-5-5-medium",
			"claude-sonnet-5-5-high",
			"claude-sonnet-5-5-medium",
			"gpt-oss-120b-medium",
		}
		for _, f := range fallback {
			addModel(f)
		}
	}

	return result, defaultModel
}

func cleanAgyLine(l string) string {
	// Strip spinners or ANSI codes
	ansiRe := regexp.MustCompile(`\x1b\[[0-9;]*[a-zA-Z]`)
	l = ansiRe.ReplaceAllString(l, "")
	// Strip braille spinner characters \u2800-\u28ff
	var sb strings.Builder
	for _, r := range l {
		if r >= 0x2800 && r <= 0x28ff {
			continue
		}
		sb.WriteRune(r)
	}
	return strings.TrimSpace(sb.String())
}

// discoverOpenCodeModels reads ~/.config/opencode/opencode.json(c) or runs `opencode models`.
func discoverOpenCodeModels(home string) ([]string, string) {
	configDirs := []string{
		filepath.Join(home, ".config", "opencode"),
		filepath.Join(home, ".opencode"),
	}

	modelSet := make(map[string]bool)
	var modelList []string
	defaultModel := ""

	addModel := func(m string) {
		m = strings.TrimSpace(m)
		if m != "" && !modelSet[m] {
			modelSet[m] = true
			modelList = append(modelList, m)
		}
	}

	for _, dir := range configDirs {
		for _, name := range []string{"opencode.jsonc", "opencode.json"} {
			path := filepath.Join(dir, name)
			data, err := os.ReadFile(path)
			if err != nil {
				continue
			}
			clean := stripComments(string(data))
			var doc struct {
				Model    string `json:"model"`
				Provider map[string]struct {
					Name    string `json:"name"`
					Options struct {
						BaseURL string `json:"baseURL"`
					} `json:"options"`
					Models map[string]interface{} `json:"models"`
				} `json:"provider"`
			}
			if err := json.Unmarshal([]byte(clean), &doc); err == nil {
				if doc.Model != "" && defaultModel == "" {
					defaultModel = doc.Model
					addModel(doc.Model)
				}
				for provID, prov := range doc.Provider {
					for modelID := range prov.Models {
						addModel(provID + "/" + modelID)
						addModel(modelID)
					}
				}
			}
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	cmdPath := "opencode"
	if found, err := ResolveExecutablePath("opencode"); err == nil {
		cmdPath = found
	}

	cmd := exec.CommandContext(ctx, cmdPath, "models")
	cmd.Env = enrichedEnv(nil)
	if out, err := cmd.Output(); err == nil {
		for _, line := range strings.Split(string(out), "\n") {
			line = strings.TrimSpace(line)
			if line != "" && !strings.Contains(line, " ") {
				addModel(line)
			}
		}
	}

	if defaultModel == "" && len(modelList) > 0 {
		defaultModel = modelList[0]
	}

	return modelList, defaultModel
}

// discoverOmpModels reads ~/.omp/agent/config.yml and ~/.omp/agent/models.yml.
func discoverOmpModels(home string) ([]string, string) {
	dir := filepath.Join(home, ".omp", "agent")
	modelSet := make(map[string]bool)
	var modelList []string
	defaultModel := ""

	addModel := func(m string) {
		m = strings.TrimSpace(m)
		if m != "" && !modelSet[m] {
			modelSet[m] = true
			modelList = append(modelList, m)
		}
	}

	// 1. Read config.yml
	configPath := filepath.Join(dir, "config.yml")
	if data, err := os.ReadFile(configPath); err == nil {
		var doc struct {
			Model      string `yaml:"model"`
			ModelRoles struct {
				Default string `yaml:"default"`
			} `yaml:"modelRoles"`
		}
		if err := yaml.Unmarshal(data, &doc); err == nil {
			if doc.ModelRoles.Default != "" {
				defaultModel = doc.ModelRoles.Default
				addModel(doc.ModelRoles.Default)
			} else if doc.Model != "" {
				defaultModel = doc.Model
				addModel(doc.Model)
			}
		}
	}

	// 2. Read models.yml
	modelsPath := filepath.Join(dir, "models.yml")
	if data, err := os.ReadFile(modelsPath); err == nil {
		var doc struct {
			Providers map[string]struct {
				Models []struct {
					ID string `yaml:"id"`
				} `yaml:"models"`
			} `yaml:"providers"`
		}
		if err := yaml.Unmarshal(data, &doc); err == nil {
			for provID, prov := range doc.Providers {
				for _, m := range prov.Models {
					if m.ID != "" {
						addModel(provID + "/" + m.ID)
						addModel(m.ID)
					}
				}
			}
		}
	}

	if defaultModel == "" && len(modelList) > 0 {
		defaultModel = modelList[0]
	}

	return modelList, defaultModel
}

// discoverPiModels reads ~/.pi/agent/models.json and runs `pi --list-models`.
func discoverPiModels(home string) ([]string, string) {
	dir := filepath.Join(home, ".pi", "agent")
	modelsPath := filepath.Join(dir, "models.json")

	modelSet := make(map[string]bool)
	var modelList []string
	defaultModel := ""

	addModel := func(m string) {
		m = strings.TrimSpace(m)
		if m != "" && !modelSet[m] {
			modelSet[m] = true
			modelList = append(modelList, m)
		}
	}

	if data, err := os.ReadFile(modelsPath); err == nil {
		var doc struct {
			Providers map[string]struct {
				Name    string `json:"name"`
				BaseURL string `json:"baseUrl"`
				Models  []struct {
					ID   string `json:"id"`
					Name string `json:"name"`
				} `json:"models"`
			} `json:"providers"`
		}
		if err := json.Unmarshal(data, &doc); err == nil {
			for provID, prov := range doc.Providers {
				for _, m := range prov.Models {
					id := m.ID
					if id == "" {
						id = m.Name
					}
					if id != "" {
						addModel(provID + "/" + id)
						addModel(id)
					}
				}
			}
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	cmdPath := "pi"
	if found, err := ResolveExecutablePath("pi"); err == nil {
		cmdPath = found
	}
	cmd := exec.CommandContext(ctx, cmdPath, "--list-models")
	cmd.Env = enrichedEnv(nil)
	if out, err := cmd.Output(); err == nil {
		lines := strings.Split(string(out), "\n")
		for _, l := range lines {
			fields := strings.Fields(l)
			if len(fields) >= 2 && fields[0] != "provider" && fields[1] != "model" {
				prov := fields[0]
				mod := fields[1]
				addModel(prov + "/" + mod)
				addModel(mod)
			}
		}
	}

	if len(modelList) > 0 {
		defaultModel = modelList[0]
	}

	return modelList, defaultModel
}

// discoverClaudeCodeModels reads ~/.claude/settings.json.
func discoverClaudeCodeModels(home string) ([]string, string) {
	settingsPath := filepath.Join(home, ".claude", "settings.json")
	var models []string
	seen := make(map[string]bool)
	defaultModel := "sonnet"

	add := func(m string) {
		m = strings.TrimSpace(m)
		if m != "" && !seen[m] {
			seen[m] = true
			models = append(models, m)
		}
	}

	if data, err := os.ReadFile(settingsPath); err == nil {
		var doc struct {
			Model string `json:"model"`
			Env   map[string]string `json:"env"`
		}
		if err := json.Unmarshal(data, &doc); err == nil {
			if doc.Model != "" {
				defaultModel = doc.Model
				add(doc.Model)
			}
			for k, v := range doc.Env {
				if strings.Contains(k, "MODEL") && v != "" {
					add(v)
				}
			}
		}
	}

	// Always ensure standard Claude models are present
	for _, m := range []string{"sonnet", "opus", "haiku", "claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5"} {
		add(m)
	}

	return models, defaultModel
}

// discoverCodexModels reads ~/.codex/config.toml.
func discoverCodexModels(home string) ([]string, string) {
	configPath := filepath.Join(home, ".codex", "config.toml")
	var models []string
	seen := make(map[string]bool)
	defaultModel := "deepseek-v4-1-flash"

	add := func(m string) {
		m = strings.TrimSpace(m)
		if m != "" && !seen[m] {
			seen[m] = true
			models = append(models, m)
		}
	}

	if data, err := os.ReadFile(configPath); err == nil {
		lines := strings.Split(string(data), "\n")
		re := regexp.MustCompile(`^\s*model\s*=\s*"([^"]+)"`)
		for _, l := range lines {
			if strings.HasPrefix(strings.TrimSpace(l), "#") {
				continue
			}
			if matches := re.FindStringSubmatch(l); len(matches) > 1 {
				defaultModel = matches[1]
				add(defaultModel)
			}
		}
	}

	for _, m := range []string{"deepseek-v4-1-flash", "gpt-6.1-sol", "gpt-6-luna", "gpt-5.6-terra", "gpt-5.5"} {
		add(m)
	}

	return models, defaultModel
}

// stripComments removes // and /* */ comments from JSONC text.
func stripComments(data string) string {
	var b strings.Builder
	b.Grow(len(data))
	inString := false
	escaped := false
	for i := 0; i < len(data); i++ {
		c := data[i]
		if inString {
			b.WriteByte(c)
			if escaped {
				escaped = false
			} else if c == '\\' {
				escaped = true
			} else if c == '"' {
				inString = false
			}
			continue
		}
		switch {
		case c == '"':
			inString = true
			b.WriteByte(c)
		case c == '/' && i+1 < len(data) && data[i+1] == '/':
			for i < len(data) && data[i] != '\n' {
				i++
			}
			if i < len(data) {
				b.WriteByte('\n')
			}
		case c == '/' && i+1 < len(data) && data[i+1] == '*':
			i += 2
			for i+1 < len(data) && !(data[i] == '*' && data[i+1] == '/') {
				i++
			}
			i++
		default:
			b.WriteByte(c)
		}
	}
	return b.String()
}
