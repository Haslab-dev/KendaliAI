package intelligence

import (
	"encoding/json"
	"os"
	"path/filepath"
)

var projectPatterns = map[string]ProjectPattern{
	"Next.js": {
		ConfigMatchers:  []string{"next.config.js", "next.config.mjs", "next.config.ts"},
		RootMatchers:    []string{"app/layout.tsx", "app/layout.jsx", "pages/_app.tsx", "pages/_app.jsx"},
		PackageDep:      "next",
		Language:        "TypeScript",
		DefaultEntry:    []string{"app/layout.tsx", "app/page.tsx", "next.config.js"},
		DefaultCSS:      "Tailwind",
	},
	"React + Vite": {
		ConfigMatchers:  []string{"vite.config.ts", "vite.config.js"},
		RootMatchers:    []string{"src/App.tsx", "src/App.jsx", "src/main.tsx", "src/main.jsx"},
		PackageDep:      "react",
		Language:        "TypeScript",
		DefaultEntry:    []string{"index.html", "src/main.tsx", "src/App.tsx", "vite.config.ts"},
		DefaultCSS:      "Tailwind",
	},
	"React + CRA": {
		ConfigMatchers:  []string{},
		RootMatchers:    []string{"src/App.tsx", "src/App.jsx", "src/index.tsx", "src/index.jsx"},
		PackageDep:      "react-scripts",
		Language:        "TypeScript",
		DefaultEntry:    []string{"public/index.html", "src/index.tsx", "src/App.tsx", "package.json"},
		DefaultCSS:      "CSS",
	},
	"Vue + Vite": {
		ConfigMatchers:  []string{"vite.config.ts", "vite.config.js"},
		RootMatchers:    []string{"src/App.vue", "src/main.ts", "src/main.js"},
		PackageDep:      "vue",
		Language:        "TypeScript",
		DefaultEntry:    []string{"index.html", "src/main.ts", "src/App.vue", "vite.config.ts"},
		DefaultCSS:      "Tailwind",
	},
	"Angular": {
		ConfigMatchers:  []string{"angular.json"},
		RootMatchers:    []string{"src/main.ts", "src/app/app.component.ts"},
		PackageDep:      "@angular/core",
		Language:        "TypeScript",
		DefaultEntry:    []string{"angular.json", "src/main.ts", "src/app/app.component.ts", "package.json"},
		DefaultCSS:      "CSS",
	},
	"Svelte": {
		ConfigMatchers:  []string{"svelte.config.js"},
		RootMatchers:    []string{"src/App.svelte", "src/main.ts", "src/main.js"},
		PackageDep:      "svelte",
		Language:        "TypeScript",
		DefaultEntry:    []string{"svelte.config.js", "src/main.ts", "src/App.svelte", "package.json"},
		DefaultCSS:      "CSS",
	},
	"NestJS": {
		ConfigMatchers:  []string{"nest-cli.json"},
		RootMatchers:    []string{"src/main.ts", "src/app.module.ts", "src/app.controller.ts"},
		PackageDep:      "@nestjs/core",
		Language:        "TypeScript",
		DefaultEntry:    []string{"nest-cli.json", "src/main.ts", "src/app.module.ts", "package.json"},
		DefaultCSS:      "",
	},
	"Remix": {
		ConfigMatchers:  []string{"remix.config.js", "remix.config.ts"},
		RootMatchers:    []string{"app/root.tsx", "app/entry.server.tsx"},
		PackageDep:      "@remix-run/react",
		Language:        "TypeScript",
		DefaultEntry:    []string{"remix.config.js", "app/root.tsx", "app/routes/_index.tsx", "package.json"},
		DefaultCSS:      "Tailwind",
	},
	"Go": {
		ConfigMatchers:  []string{"go.mod"},
		RootMatchers:    []string{"cmd/*/main.go", "main.go"},
		PackageDep:      "",
		Language:        "Go",
		DefaultEntry:    []string{"go.mod", "main.go"},
		DefaultCSS:      "",
	},
	"Python": {
		ConfigMatchers:  []string{"requirements.txt", "pyproject.toml", "setup.py", "setup.cfg"},
		RootMatchers:    []string{"main.py", "app.py", "src/main.py"},
		PackageDep:      "",
		Language:        "Python",
		DefaultEntry:    []string{"requirements.txt", "main.py"},
		DefaultCSS:      "",
	},
	"Rust": {
		ConfigMatchers:  []string{"Cargo.toml"},
		RootMatchers:    []string{"src/main.rs", "src/lib.rs"},
		PackageDep:      "",
		Language:        "Rust",
		DefaultEntry:    []string{"Cargo.toml", "src/main.rs"},
		DefaultCSS:      "",
	},
	"Flutter": {
		ConfigMatchers:  []string{"pubspec.yaml"},
		RootMatchers:    []string{"lib/main.dart", "lib/src/app.dart"},
		PackageDep:      "flutter",
		Language:        "Dart",
		DefaultEntry:    []string{"pubspec.yaml", "lib/main.dart"},
		DefaultCSS:      "",
	},
	"Bun": {
		ConfigMatchers:  []string{"bun.lockb", "bunfig.toml"},
		RootMatchers:    []string{"src/index.ts", "src/index.tsx", "index.ts", "src/main.ts"},
		PackageDep:      "",
		Language:        "TypeScript",
		DefaultEntry:    []string{"package.json", "src/index.ts", "tsconfig.json"},
		DefaultCSS:      "",
	},
	"Hono": {
		ConfigMatchers:  []string{},
		RootMatchers:    []string{"src/index.ts", "src/index.tsx", "src/app.ts"},
		PackageDep:      "hono",
		Language:        "TypeScript",
		DefaultEntry:    []string{"package.json", "src/index.ts", "tsconfig.json"},
		DefaultCSS:      "",
	},
	"Django": {
		ConfigMatchers:  []string{"manage.py", "requirements.txt"},
		RootMatchers:    []string{"*/settings.py", "*/urls.py", "*/wsgi.py"},
		PackageDep:      "",
		Language:        "Python",
		DefaultEntry:    []string{"manage.py", "requirements.txt", "settings.py", "urls.py"},
		DefaultCSS:      "",
	},
	"FastAPI": {
		ConfigMatchers:  []string{},
		RootMatchers:    []string{"main.py", "app.py", "src/main.py"},
		PackageDep:      "fastapi",
		Language:        "Python",
		DefaultEntry:    []string{"main.py", "requirements.txt", "app.py"},
		DefaultCSS:      "",
	},
	"SwiftUI": {
		ConfigMatchers:  []string{"*.xcodeproj", "*.xcworkspace", "Package.swift"},
		RootMatchers:    []string{"Sources/*/main.swift", "Sources/*/App.swift", "*.swift"},
		PackageDep:      "",
		Language:        "Swift",
		DefaultEntry:    []string{"Package.swift", "Sources"},
		DefaultCSS:      "",
	},
}

type ProjectPattern struct {
	ConfigMatchers []string
	RootMatchers   []string
	PackageDep     string
	Language       string
	DefaultEntry   []string
	DefaultCSS     string
}

func DetectProject(rootPath string) *ProjectInfo {
	pkg := readPackageJSON(rootPath)
	for name, pattern := range projectPatterns {
		if matchPattern(rootPath, pkg, name, pattern) {
			info := &ProjectInfo{
				Framework: name,
				Language:  pattern.Language,
				BuildTool: detectBuildTool(rootPath, pkg),
				CSS:       detectCSS(rootPath, pkg, pattern),
				Routing:   detectRouting(rootPath, pkg),
			}
			info.Entrypoints = resolveEntrypoints(rootPath, pattern.DefaultEntry)
			info.ConfigFiles = resolveExisting(rootPath, pattern.ConfigMatchers)
			if pkg != nil {
				info.ConfigFiles = append(info.ConfigFiles, "package.json")
			}
			if _, err := os.Stat(filepath.Join(rootPath, "go.mod")); err == nil {
				info.ConfigFiles = append(info.ConfigFiles, "go.mod")
			}
			if _, err := os.Stat(filepath.Join(rootPath, "Cargo.toml")); err == nil {
				info.ConfigFiles = append(info.ConfigFiles, "Cargo.toml")
			}
			return info
		}
	}

	detected := detectMinimal(rootPath)
	detected.ConfigFiles = resolveExisting(rootPath, detected.ConfigFiles)
	return detected
}

func matchPattern(rootPath string, pkg map[string]interface{}, name string, pattern ProjectPattern) bool {
	if pattern.PackageDep != "" && pkg != nil {
		if !hasDependency(pkg, pattern.PackageDep) && !hasDevDependency(pkg, pattern.PackageDep) {
			return false
		}
	}
	for _, m := range pattern.ConfigMatchers {
		if _, err := os.Stat(filepath.Join(rootPath, m)); err == nil {
			return true
		}
	}
	for _, m := range pattern.RootMatchers {
		matches, _ := filepath.Glob(filepath.Join(rootPath, m))
		if len(matches) > 0 {
			return true
		}
	}
	return false
}

func readPackageJSON(rootPath string) map[string]interface{} {
	path := filepath.Join(rootPath, "package.json")
	data, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	var result map[string]interface{}
	jsonDecode(data, &result)
	return result
}

func jsonDecode(data []byte, v interface{}) {
	json.Unmarshal(data, v)
}

func hasDependency(pkg map[string]interface{}, name string) bool {
	if deps, ok := pkg["dependencies"].(map[string]interface{}); ok {
		_, exists := deps[name]
		return exists
	}
	return false
}

func hasDevDependency(pkg map[string]interface{}, name string) bool {
	if deps, ok := pkg["devDependencies"].(map[string]interface{}); ok {
		_, exists := deps[name]
		return exists
	}
	return false
}

func detectBuildTool(rootPath string, pkg map[string]interface{}) string {
	if _, err := os.Stat(filepath.Join(rootPath, "go.mod")); err == nil {
		return "Go Modules"
	}
	if _, err := os.Stat(filepath.Join(rootPath, "Cargo.toml")); err == nil {
		return "Cargo"
	}
	if _, err := os.Stat(filepath.Join(rootPath, "pubspec.yaml")); err == nil {
		return "Flutter"
	}
	if _, err := os.Stat(filepath.Join(rootPath, "vite.config.ts")); err == nil {
		return "Vite"
	}
	if _, err := os.Stat(filepath.Join(rootPath, "vite.config.js")); err == nil {
		return "Vite"
	}
	if _, err := os.Stat(filepath.Join(rootPath, "next.config.js")); err == nil {
		return "Next.js"
	}
	if _, err := os.Stat(filepath.Join(rootPath, "next.config.mjs")); err == nil {
		return "Next.js"
	}
	if pkg != nil {
		if _, ok := pkg["scripts"].(map[string]interface{})["build"]; ok {
			return "npm/yarn/build"
		}
	}
	if _, err := os.Stat(filepath.Join(rootPath, "requirements.txt")); err == nil {
		return "pip"
	}
	return "unknown"
}

func detectCSS(rootPath string, pkg map[string]interface{}, pattern ProjectPattern) string {
	if _, err := os.Stat(filepath.Join(rootPath, "tailwind.config.js")); err == nil {
		return "Tailwind v3"
	}
	if _, err := os.Stat(filepath.Join(rootPath, "tailwind.config.ts")); err == nil {
		return "Tailwind v3"
	}
	if _, err := os.Stat(filepath.Join(rootPath, "postcss.config.js")); err == nil {
		return "Tailwind v4"
	}
	if _, err := os.Stat(filepath.Join(rootPath, "postcss.config.mjs")); err == nil {
		return "Tailwind v4"
	}
	if pkg != nil {
		if hasDevDependency(pkg, "tailwindcss") || hasDependency(pkg, "tailwindcss") {
			return "Tailwind"
		}
	}
	return pattern.DefaultCSS
}

func detectRouting(rootPath string, pkg map[string]interface{}) string {
	if _, err := os.Stat(filepath.Join(rootPath, "app")); err == nil {
		if _, err := os.Stat(filepath.Join(rootPath, "app/layout.tsx")); err == nil {
			return "App Router (Next.js)"
		}
		if _, err := os.Stat(filepath.Join(rootPath, "app/layout.jsx")); err == nil {
			return "App Router (Next.js)"
		}
	}
	if _, err := os.Stat(filepath.Join(rootPath, "pages")); err == nil {
		return "Pages Router"
	}
	if pkg != nil {
		if hasDependency(pkg, "react-router-dom") {
			return "React Router"
		}
		if hasDependency(pkg, "@tanstack/react-router") {
			return "TanStack Router"
		}
	}
	return "none"
}

func resolveEntrypoints(rootPath string, defaults []string) []string {
	var entries []string
	for _, d := range defaults {
		matches, _ := filepath.Glob(filepath.Join(rootPath, d))
		if len(matches) > 0 {
			for _, m := range matches {
				entries = append(entries, m)
			}
		}
	}
	return entries
}

func resolveExisting(rootPath string, paths []string) []string {
	var existing []string
	for _, p := range paths {
		if _, err := os.Stat(filepath.Join(rootPath, p)); err == nil {
			existing = append(existing, p)
		}
	}
	return existing
}

func detectMinimal(rootPath string) *ProjectInfo {
	if _, err := os.Stat(filepath.Join(rootPath, "go.mod")); err == nil {
		entries := resolveEntrypoints(rootPath, []string{"cmd/*/main.go", "main.go"})
		if len(entries) == 0 {
			entries = []string{"go.mod"}
		}
		return &ProjectInfo{
			Framework:   "Go",
			Language:    "Go",
			BuildTool:   "Go Modules",
			CSS:         "",
			Routing:     "none",
			Entrypoints: entries,
			ConfigFiles: []string{"go.mod"},
		}
	}
	if _, err := os.Stat(filepath.Join(rootPath, "Cargo.toml")); err == nil {
		return &ProjectInfo{
			Framework:   "Rust",
			Language:    "Rust",
			BuildTool:   "Cargo",
			CSS:         "",
			Routing:     "none",
			Entrypoints: resolveEntrypoints(rootPath, []string{"src/main.rs"}),
			ConfigFiles: []string{"Cargo.toml"},
		}
	}
	if _, err := os.Stat(filepath.Join(rootPath, "requirements.txt")); err == nil {
		return &ProjectInfo{
			Framework:   "Python",
			Language:    "Python",
			BuildTool:   "pip",
			CSS:         "",
			Routing:     "none",
			Entrypoints: resolveEntrypoints(rootPath, []string{"main.py", "app.py"}),
			ConfigFiles: []string{"requirements.txt"},
		}
	}
	if _, err := os.Stat(filepath.Join(rootPath, "pubspec.yaml")); err == nil {
		return &ProjectInfo{
			Framework:   "Flutter",
			Language:    "Dart",
			BuildTool:   "Flutter",
			CSS:         "",
			Routing:     "none",
			Entrypoints: resolveEntrypoints(rootPath, []string{"lib/main.dart"}),
			ConfigFiles: []string{"pubspec.yaml"},
		}
	}
	if _, err := os.Stat(filepath.Join(rootPath, "package.json")); err == nil {
		return &ProjectInfo{
			Framework:   "Node.js",
			Language:    "TypeScript",
			BuildTool:   "npm",
			CSS:         "",
			Routing:     "none",
			Entrypoints: resolveEntrypoints(rootPath, []string{"src/index.ts", "src/index.js", "src/main.ts", "src/main.js", "index.ts", "index.js"}),
			ConfigFiles: []string{"package.json"},
		}
	}
	return &ProjectInfo{
		Framework:   "Unknown",
		Language:    "Unknown",
		BuildTool:   "unknown",
		CSS:         "",
		Routing:     "none",
		Entrypoints: nil,
		ConfigFiles: nil,
	}
}
