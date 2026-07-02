package skills

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type ExportFormat string

const (
	FormatKSP    ExportFormat = "ksp"
	FormatClaude ExportFormat = "claude"
	FormatHermes ExportFormat = "hermes"
)

type Exporter struct {
	manager *Manager
}

func NewExporter(manager *Manager) *Exporter {
	return &Exporter{manager: manager}
}

func (e *Exporter) Export(skillID string, format ExportFormat, outputPath string) (string, error) {
	pkg, err := e.manager.Get(skillID)
	if err != nil {
		return "", fmt.Errorf("skill not found: %s", skillID)
	}

	switch format {
	case FormatClaude:
		return e.exportClaude(pkg, outputPath)
	case FormatHermes:
		return e.exportHermes(pkg, outputPath)
	case FormatKSP:
		return e.exportKSP(pkg, outputPath)
	default:
		return "", fmt.Errorf("unknown format: %s", format)
	}
}

func (e *Exporter) exportClaude(pkg *SkillPackage, outputPath string) (string, error) {
	dir := filepath.Join(outputPath, pkg.Spec.ID)
	os.RemoveAll(dir)
	os.MkdirAll(dir, 0755)

	fm := fmt.Sprintf(`---
name: %s
description: %s
version: "%s"
author: %s
keywords: %s
---
`, pkg.Spec.Name, pkg.Spec.Description, pkg.Spec.Version, pkg.Spec.Author, strings.Join(pkg.Spec.Keywords, ", "))

	skillMD := fm + "\n" + pkg.Prompt
	os.WriteFile(filepath.Join(dir, "skill.md"), []byte(skillMD), 0644)

	if pkg.Examples != "" {
		os.WriteFile(filepath.Join(dir, "examples.md"), []byte(pkg.Examples), 0644)
	}

	copyMappedDirs(e.manager.skillDir(pkg.Spec.ID), dir, map[string]string{
		"resources/templates": "resources/templates",
		"resources/assets":    "resources/assets",
		"resources/docs":      "resources/docs",
		"tools":               "tools",
	})

	return dir, nil
}

func (e *Exporter) exportHermes(pkg *SkillPackage, outputPath string) (string, error) {
	dir := filepath.Join(outputPath, pkg.Spec.ID)
	os.RemoveAll(dir)
	os.MkdirAll(dir, 0755)

	fm := fmt.Sprintf(`---
name: %s
description: %s
version: "%s"
author: %s
keywords: %s
---
`, pkg.Spec.Name, pkg.Spec.Description, pkg.Spec.Version, pkg.Spec.Author, strings.Join(pkg.Spec.Keywords, ", "))

	skillMD := fm + "\n" + pkg.Prompt
	os.WriteFile(filepath.Join(dir, "SKILL.md"), []byte(skillMD), 0644)

	if pkg.Examples != "" {
		os.WriteFile(filepath.Join(dir, "examples.md"), []byte(pkg.Examples), 0644)
	}

	srcDir := e.manager.skillDir(pkg.Spec.ID)
	copyMappedDirs(srcDir, dir, map[string]string{
		"tools":               "scripts",
		"resources/docs":      "references",
		"resources/templates": "templates",
		"resources/assets":    "assets",
	})

	return dir, nil
}

func (e *Exporter) exportKSP(pkg *SkillPackage, outputPath string) (string, error) {
	dir := filepath.Join(outputPath, pkg.Spec.ID+".ksp")
	os.RemoveAll(dir)
	srcDir := e.manager.skillDir(pkg.Spec.ID)
	copyDir(srcDir, dir)
	return dir, nil
}
