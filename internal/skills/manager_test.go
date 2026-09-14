package skills

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestManagerListAndGetRepoSkills(t *testing.T) {
	cwd, _ := os.Getwd()
	// Navigate to repo root if running in internal/skills
	repoRoot := cwd
	if filepath.Base(repoRoot) == "skills" && filepath.Base(filepath.Dir(repoRoot)) == "internal" {
		repoRoot = filepath.Dir(filepath.Dir(repoRoot))
	}
	_ = os.Chdir(repoRoot)

	mgr := NewManager(filepath.Join(repoRoot, "skills"))
	specs, err := mgr.List()
	if err != nil {
		t.Fatalf("failed to list skills: %v", err)
	}

	if len(specs) == 0 {
		t.Fatalf("expected repo skills to be listed, got 0")
	}

	foundCloudflared := false
	foundMonitor := false
	for _, s := range specs {
		if s.ID == "cloudflared-tunnel" {
			foundCloudflared = true
		}
		if s.ID == "vps-sre-monitor" {
			foundMonitor = true
		}
	}

	if !foundCloudflared {
		t.Errorf("cloudflared-tunnel skill not found in List()")
	}
	if !foundMonitor {
		t.Errorf("vps-sre-monitor skill not found in List()")
	}

	pkg, err := mgr.Get("cloudflared-tunnel")
	if err != nil {
		t.Fatalf("failed to get cloudflared-tunnel skill: %v", err)
	}
	if pkg.Spec.Name != "Cloudflared Tunnel" {
		t.Errorf("expected skill name 'Cloudflared Tunnel', got '%s'", pkg.Spec.Name)
	}

	router := NewRouter(mgr)
	match, score, err := router.Match(context.Background(), "expose my localhost port with cloudflared tunnel")
	if err != nil {
		t.Fatalf("router match error: %v", err)
	}
	if match == nil || match.ID != "cloudflared-tunnel" {
		t.Errorf("expected route match cloudflared-tunnel, got %v (score: %.2f)", match, score)
	}
}
