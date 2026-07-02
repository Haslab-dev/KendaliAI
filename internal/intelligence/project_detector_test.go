package intelligence

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDetectProject_GoModule(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "go.mod"), []byte("module example.com/app\n\ngo 1.21"), 0644)
	os.WriteFile(filepath.Join(dir, "main.go"), []byte("package main\n\nfunc main() {}"), 0644)

	info := DetectProject(dir)

	if info.Framework != "Go" {
		t.Errorf("expected Framework 'Go', got '%s'", info.Framework)
	}
	if info.Language != "Go" {
		t.Errorf("expected Language 'Go', got '%s'", info.Language)
	}
	if info.BuildTool != "Go Modules" {
		t.Errorf("expected BuildTool 'Go Modules', got '%s'", info.BuildTool)
	}
	if len(info.Entrypoints) == 0 {
		t.Error("expected at least one entrypoint")
	}
}

func TestDetectProject_ReactVite(t *testing.T) {
	dir := t.TempDir()
	src := filepath.Join(dir, "src")
	os.MkdirAll(src, 0755)

	os.WriteFile(filepath.Join(dir, "package.json"), []byte(`{"dependencies":{"react":"^18.0.0","react-dom":"^18.0.0"},"devDependencies":{"vite":"^5.0.0"}}`), 0644)
	os.WriteFile(filepath.Join(dir, "vite.config.ts"), []byte(`export default defineConfig({})`), 0644)
	os.WriteFile(filepath.Join(src, "App.tsx"), []byte(`export default function App() { return <div/> }`), 0644)
	os.WriteFile(filepath.Join(src, "main.tsx"), []byte(`import App from './App'`), 0644)

	info := DetectProject(dir)

	if info.Framework != "React + Vite" {
		t.Errorf("expected Framework 'React + Vite', got '%s'", info.Framework)
	}
	if info.Language != "TypeScript" {
		t.Errorf("expected Language 'TypeScript', got '%s'", info.Language)
	}
}

func TestDetectProject_NextJS(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, "app"), 0755)

	os.WriteFile(filepath.Join(dir, "package.json"), []byte(`{"dependencies":{"next":"^14.0.0","react":"^18.0.0"}}`), 0644)
	os.WriteFile(filepath.Join(dir, "next.config.js"), []byte(`module.exports = {}`), 0644)
	os.WriteFile(filepath.Join(dir, "app", "layout.tsx"), []byte(`export default function Layout() {}`), 0644)
	os.WriteFile(filepath.Join(dir, "app", "page.tsx"), []byte(`export default function Page() {}`), 0644)

	info := DetectProject(dir)

	if info.Framework != "Next.js" {
		t.Errorf("expected Framework 'Next.js', got '%s'", info.Framework)
	}
	if info.Routing != "App Router (Next.js)" {
		t.Errorf("expected Routing 'App Router (Next.js)', got '%s'", info.Routing)
	}
}

func TestDetectProject_Python(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "requirements.txt"), []byte("flask==2.0.0\n"), 0644)
	os.WriteFile(filepath.Join(dir, "main.py"), []byte("def main():\n    pass"), 0644)

	info := DetectProject(dir)

	if info.Framework != "Python" {
		t.Errorf("expected Framework 'Python', got '%s'", info.Framework)
	}
	if info.BuildTool != "pip" {
		t.Errorf("expected BuildTool 'pip', got '%s'", info.BuildTool)
	}
}

func TestDetectProject_Rust(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, "src"), 0755)

	os.WriteFile(filepath.Join(dir, "Cargo.toml"), []byte("[package]\nname = \"test\""), 0644)
	os.WriteFile(filepath.Join(dir, "src", "main.rs"), []byte("fn main() {}"), 0644)

	info := DetectProject(dir)

	if info.Framework != "Rust" {
		t.Errorf("expected Framework 'Rust', got '%s'", info.Framework)
	}
	if info.BuildTool != "Cargo" {
		t.Errorf("expected BuildTool 'Cargo', got '%s'", info.BuildTool)
	}
}

func TestDetectProject_VueVite(t *testing.T) {
	dir := t.TempDir()
	src := filepath.Join(dir, "src")
	os.MkdirAll(src, 0755)

	os.WriteFile(filepath.Join(dir, "package.json"), []byte(`{"dependencies":{"vue":"^3.0.0"}}`), 0644)
	os.WriteFile(filepath.Join(dir, "vite.config.ts"), []byte(`export default defineConfig({})`), 0644)
	os.WriteFile(filepath.Join(src, "App.vue"), []byte(`<template><div/></template>`), 0644)

	info := DetectProject(dir)

	if info.Framework != "Vue + Vite" {
		t.Errorf("expected Framework 'Vue + Vite', got '%s'", info.Framework)
	}
}

func TestDetectProject_TailwindDetection(t *testing.T) {
	dir := t.TempDir()
	src := filepath.Join(dir, "src")
	os.MkdirAll(src, 0755)

	os.WriteFile(filepath.Join(dir, "package.json"), []byte(`{"dependencies":{"react":"^18.0.0"},"devDependencies":{"vite":"^5.0.0","tailwindcss":"^3.4.0"}}`), 0644)
	os.WriteFile(filepath.Join(dir, "vite.config.ts"), []byte(""), 0644)
	os.WriteFile(filepath.Join(dir, "tailwind.config.js"), []byte("module.exports = {}"), 0644)
	os.WriteFile(filepath.Join(src, "App.tsx"), []byte(""), 0644)
	os.WriteFile(filepath.Join(src, "main.tsx"), []byte(""), 0644)

	info := DetectProject(dir)

	if info.CSS != "Tailwind v3" {
		t.Errorf("expected CSS 'Tailwind v3', got '%s'", info.CSS)
	}
}
