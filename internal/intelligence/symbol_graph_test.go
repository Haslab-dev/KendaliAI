package intelligence

import (
	"os"
	"path/filepath"
	"testing"
)

func TestExtractGoSymbols(t *testing.T) {
	dir := t.TempDir()
	code := `package main

func Hello() string {
	return "hello"
}

func unexported() {}

type Config struct {
	Name string
}

func (c *Config) Validate() error {
	return nil
}

var DefaultPort = 8080
var hidden = "secret"
`
	os.WriteFile(filepath.Join(dir, "main.go"), []byte(code), 0644)

	symbols := extractGoSymbols(filepath.Join(dir, "main.go"), dir)

	expected := map[string]SymbolEntry{
		"Hello":      {Name: "Hello", Kind: "function", Exported: true},
		"unexported": {Name: "unexported", Kind: "function", Exported: false},
		"Config":     {Name: "Config", Kind: "type", Exported: true},
		"Validate":   {Name: "Validate", Kind: "method", Exported: true, Parent: "Config"},
	}

	for _, s := range symbols {
		exp, ok := expected[s.Name]
		if !ok {
			t.Logf("unexpected symbol: %+v", s)
			continue
		}
		if s.Kind != exp.Kind {
			t.Errorf("symbol %s: expected kind %s, got %s", s.Name, exp.Kind, s.Kind)
		}
		if s.Exported != exp.Exported {
			t.Errorf("symbol %s: expected exported=%v, got %v", s.Name, exp.Exported, s.Exported)
		}
	}
}

func TestExtractTSSymbols(t *testing.T) {
	dir := t.TempDir()
	code := `import React from 'react'

export default function App() {
	return <div/>
}

function Navbar() {
	return <nav/>
}

export const Hero: React.FC = () => {
	return <section/>
}

export function helper() {
	return 42
}

export interface Props {
	title: string
}

export type Status = 'idle' | 'loading'
`
	os.WriteFile(filepath.Join(dir, "App.tsx"), []byte(code), 0644)

	symbols := extractTSSymbols(filepath.Join(dir, "App.tsx"), dir)

	names := map[string]bool{}
	for _, s := range symbols {
		names[s.Name] = true
		if s.Name == "App" && s.Kind != "component" {
			t.Errorf("App should be component, got %s", s.Kind)
		}
		if s.Name == "Navbar" && s.Kind != "component" {
			t.Errorf("Navbar should be component, got %s", s.Kind)
		}
		if s.Name == "Hero" && s.Kind != "component" {
			t.Errorf("Hero should be component, got %s", s.Kind)
		}
		if s.Name == "helper" && s.Kind != "function" {
			t.Errorf("helper should be function, got %s", s.Kind)
		}
	}

	expectedNames := []string{"App", "Navbar", "Hero", "helper", "Props", "Status"}
	for _, name := range expectedNames {
		if !names[name] {
			t.Errorf("missing symbol: %s", name)
		}
	}
}

func TestExtractPySymbols(t *testing.T) {
	dir := t.TempDir()
	code := `def greet(name: str) -> str:
    return f"Hello {name}"

async def fetch_data():
    pass

class User:
    def __init__(self, name):
        self.name = name

def _internal_util():
    pass
`
	os.WriteFile(filepath.Join(dir, "app.py"), []byte(code), 0644)

	symbols := extractPySymbols(filepath.Join(dir, "app.py"), dir)

	names := map[string]bool{}
	for _, s := range symbols {
		names[s.Name] = true
	}

	if !names["greet"] {
		t.Error("missing: greet")
	}
	if !names["fetch_data"] {
		t.Error("missing: fetch_data")
	}
	if !names["User"] {
		t.Error("missing: User")
	}
	if names["_internal_util"] {
		t.Error("should skip _internal_util (underscore prefix)")
	}
}
