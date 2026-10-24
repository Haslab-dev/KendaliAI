package agent

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/kendaliai/app/internal/plugins"
	"github.com/kendaliai/app/internal/skills"
)

// TestComprehensiveTools tests all Document, Visual, and Motion tools
// including synthetic prefix stripping (/workspaces/, ~/workspaces/) and download links.
func TestComprehensiveTools(t *testing.T) {
	dir := t.TempDir()
	ctx := context.Background()

	// 1. Test DocumentTools
	docTools := DocumentTools(dir)

	// A. docx_create with synthetic prefix
	docxOut := docTools["docx_create"].Execute(ctx, map[string]interface{}{
		"path":    "/workspaces/test_document.docx",
		"content": "# Test Header\n\n- Bullet 1\n- Bullet 2\n\n**Bold text** and *italic*.",
	})
	if !strings.Contains(docxOut, "Created file") || !strings.Contains(docxOut, "/api/workspace/download") {
		t.Fatalf("docx_create failed or missing download link: %s", docxOut)
	}
	expectedDocx := filepath.Join(dir, "test_document.docx")
	if _, err := os.Stat(expectedDocx); err != nil {
		t.Fatalf("expected docx file at %s: %v", expectedDocx, err)
	}

	// B. docx_read
	readDocx := docTools["docx_read"].Execute(ctx, map[string]interface{}{
		"path": "test_document.docx",
	})
	if !strings.Contains(readDocx, "Test Header") || !strings.Contains(readDocx, "Bullet 1") {
		t.Fatalf("docx_read failed: %s", readDocx)
	}

	// C. docx_append
	appendDocx := docTools["docx_append"].Execute(ctx, map[string]interface{}{
		"path":    "test_document.docx",
		"content": "## Subheader Appendix\n- Extra appended point",
	})
	if !strings.Contains(appendDocx, "Appended") {
		t.Fatalf("docx_append failed: %s", appendDocx)
	}

	// D. xlsx_create with /workspaces/ path
	xlsxOut := docTools["xlsx_create"].Execute(ctx, map[string]interface{}{
		"path": "/workspaces/anggaran_marketing_q4.xlsx",
		"sheets": []interface{}{
			map[string]interface{}{
				"name": "Q4 Budget",
				"rows": []interface{}{
					[]interface{}{"Kategori", "Rencana", "Realisasi"},
					[]interface{}{"Digital Ads", float64(50000000), float64(45000000)},
					[]interface{}{"Influencer", float64(30000000), float64(32000000)},
				},
			},
		},
	})
	if !strings.Contains(xlsxOut, "Created file") || !strings.Contains(xlsxOut, "/api/workspace/download") {
		t.Fatalf("xlsx_create failed or missing download link: %s", xlsxOut)
	}
	expectedXlsx := filepath.Join(dir, "anggaran_marketing_q4.xlsx")
	if _, err := os.Stat(expectedXlsx); err != nil {
		t.Fatalf("expected xlsx file at %s: %v", expectedXlsx, err)
	}

	// E. xlsx_read
	readXlsx := docTools["xlsx_read"].Execute(ctx, map[string]interface{}{
		"path": "anggaran_marketing_q4.xlsx",
	})
	if !strings.Contains(readXlsx, "Digital Ads") || !strings.Contains(readXlsx, "50000000") {
		t.Fatalf("xlsx_read failed: %s", readXlsx)
	}

	// F. pptx_create
	pptxOut := docTools["pptx_create"].Execute(ctx, map[string]interface{}{
		"path": "~/workspaces/presentation.pptx",
		"slides": []interface{}{
			map[string]interface{}{"title": "Slide 1: Intro", "bullets": []interface{}{"Welcome", "Agenda"}},
			map[string]interface{}{"title": "Slide 2: Roadmap", "bullets": []interface{}{"Phase 1", "Phase 2"}},
		},
	})
	if !strings.Contains(pptxOut, "Created file") || !strings.Contains(pptxOut, "/api/workspace/download") {
		t.Fatalf("pptx_create failed: %s", pptxOut)
	}
	expectedPptx := filepath.Join(dir, "presentation.pptx")
	if _, err := os.Stat(expectedPptx); err != nil {
		t.Fatalf("expected pptx file at %s: %v", expectedPptx, err)
	}

	// 2. Test VisualTools
	visTools := VisualTools(dir)

	// A. image_generate (poster)
	posterOut := visTools["image_generate"].Execute(ctx, map[string]interface{}{
		"path":     "/workspaces/poster.svg",
		"variant":  "poster",
		"title":    "Kendali AI",
		"subtitle": "Next Gen Autonomous Agent",
	})
	if !strings.Contains(posterOut, "Generated") || !strings.Contains(posterOut, "/api/workspace/download") {
		t.Fatalf("image_generate failed: %s", posterOut)
	}

	// B. slides_create (.deck.html)
	deckOut := visTools["slides_create"].Execute(ctx, map[string]interface{}{
		"path":  "deck.html",
		"title": "Agent Deck",
		"slides": []interface{}{
			map[string]interface{}{"title": "Welcome", "bullets": []interface{}{"Intro to AI"}},
		},
	})
	if !strings.Contains(deckOut, "Created presentation") || !strings.Contains(deckOut, "/api/workspace/download") {
		t.Fatalf("slides_create failed: %s", deckOut)
	}

	// 3. Test MotionTools
	motionTools := MotionTools(dir)

	// A. motion_hyperframe (.motion.html)
	motionOut := motionTools["motion_hyperframe"].Execute(ctx, map[string]interface{}{
		"path":  "/workspaces/teaser_kendali_ai.motion.html",
		"title": "Kendali AI Teaser 60fps",
		"scenes": []interface{}{
			map[string]interface{}{"text": "The Future of Autonomous AI", "durationSeconds": float64(4)},
			map[string]interface{}{"text": "100% Local & Deterministic", "durationSeconds": float64(4)},
			map[string]interface{}{"text": "Try Kendali AI Today", "durationSeconds": float64(3)},
		},
	})
	if !strings.Contains(motionOut, "Generated motion animation") || !strings.Contains(motionOut, "/api/workspace/download") {
		t.Fatalf("motion_hyperframe failed: %s", motionOut)
	}
	expectedMotion := filepath.Join(dir, "teaser_kendali_ai.motion.html")
	motionBytes, err := os.ReadFile(expectedMotion)
	if err != nil {
		t.Fatalf("expected motion file at %s: %v", expectedMotion, err)
	}
	motionContent := string(motionBytes)
	for _, expectedSnippet := range []string{"gsap", "1920px", "The Future of Autonomous AI", "scene-01"} {
		if !strings.Contains(motionContent, expectedSnippet) {
			t.Fatalf("motion HTML missing expected snippet %q", expectedSnippet)
		}
	}

	// B. motion_remotion
	remotionOut := motionTools["motion_remotion"].Execute(ctx, map[string]interface{}{
		"path":  "remotion_project",
		"title": "Kendali Video",
		"scenes": []interface{}{
			map[string]interface{}{"text": "Intro Scene", "durationInFrames": float64(60)},
		},
	})
	if !strings.Contains(remotionOut, "Scaffolded Remotion project") {
		t.Fatalf("motion_remotion failed: %s", remotionOut)
	}
}

// TestPluginsCatalogAndDefaultOn tests that all capability plugins exist
// and that motion-hyperframe is enabled by default.
func TestPluginsCatalogAndDefaultOn(t *testing.T) {
	cat := plugins.Catalog()
	if len(cat) == 0 {
		t.Fatal("plugins catalog is empty")
	}

	foundHyperframe := false
	for _, p := range cat {
		if p.ID == "motion-hyperframe" {
			foundHyperframe = true
			if !p.DefaultOn {
				t.Fatal("motion-hyperframe must be DefaultOn: true")
			}
			if len(p.Tools) == 0 || p.Tools[0] != "motion_hyperframe" {
				t.Fatalf("motion-hyperframe missing tool motion_hyperframe, got %v", p.Tools)
			}
		}
	}
	if !foundHyperframe {
		t.Fatal("motion-hyperframe plugin not found in Catalog")
	}

	// Test DefaultEnabledPlugins contains motion-hyperframe
	defaults := plugins.DefaultEnabledPlugins()
	hasHyperframe := false
	for _, id := range defaults {
		if id == "motion-hyperframe" {
			hasHyperframe = true
			break
		}
	}
	if !hasHyperframe {
		t.Fatalf("DefaultEnabledPlugins missing motion-hyperframe: %v", defaults)
	}

	// Test EffectivePlugins for nil and empty slice
	effNil := plugins.EffectivePlugins(nil)
	if len(effNil) != len(defaults) {
		t.Fatalf("EffectivePlugins(nil) = %v; want defaults %v", effNil, defaults)
	}
	effEmpty := plugins.EffectivePlugins([]string{})
	if len(effEmpty) != len(defaults) {
		t.Fatalf("EffectivePlugins([]) = %v; want defaults %v", effEmpty, defaults)
	}

	// Test ToolsForPlugins unlocks motion_hyperframe
	toolsMap := plugins.ToolsForPlugins(defaults)
	for _, expectedTool := range []string{"docx_create", "xlsx_create", "pptx_create", "image_generate", "slides_create", "motion_hyperframe"} {
		if !toolsMap[expectedTool] {
			t.Fatalf("ToolsForPlugins missing tool %s", expectedTool)
		}
	}
}

// TestSkillsManagerDiscovery tests skill discovery from repo directory.
func TestSkillsManagerDiscovery(t *testing.T) {
	cwd, _ := os.Getwd()
	repoRoot := cwd
	for {
		if _, err := os.Stat(filepath.Join(repoRoot, "go.mod")); err == nil {
			break
		}
		parent := filepath.Dir(repoRoot)
		if parent == repoRoot {
			break
		}
		repoRoot = parent
	}
	_ = os.Chdir(repoRoot)
	defer func() { _ = os.Chdir(cwd) }()

	mgr := skills.NewManager(filepath.Join(repoRoot, "skills"))
	list, err := mgr.List()
	if err != nil {
		t.Fatalf("skills.List error: %v", err)
	}
	if len(list) == 0 {
		t.Fatal("expected discovered skills in repo, found 0")
	}

	foundMotionSkill := false
	for _, s := range list {
		if strings.Contains(s.ID, "hyperframe") || strings.Contains(s.Name, "HyperFrame") {
			foundMotionSkill = true
			break
		}
	}
	if !foundMotionSkill {
		t.Logf("Skills found: %d", len(list))
	}
}

// TestMCPNormalization tests MCP text formatting and response envelopes.
func TestMCPNormalization(t *testing.T) {
	sample := `{"content":[{"type":"text","text":"Result from MCP tool"}]}`
	normalized := normalizeMCPTextOutput(sample)
	if normalized != "Result from MCP tool" {
		t.Fatalf("expected 'Result from MCP tool', got %q", normalized)
	}
}
