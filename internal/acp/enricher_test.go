package acp

import (
	"os"
	"testing"
)

func TestRealDiscovery(t *testing.T) {
	home, err := os.UserHomeDir()
	if err != nil {
		t.Fatal(err)
	}

	// 1. CommandCode
	cmdModels, cmdDef := discoverCommandCodeModels(home)
	t.Logf("CommandCode: %d models found, default: %s", len(cmdModels), cmdDef)
	if len(cmdModels) > 0 {
		t.Logf("CommandCode sample: %v", cmdModels[:min(5, len(cmdModels))])
	}

	// 2. Agy
	agyModels, agyDef := discoverAgyModels(home)
	t.Logf("Agy: %d models found, default: %s", len(agyModels), agyDef)
	if len(agyModels) > 0 {
		t.Logf("Agy sample: %v", agyModels[:min(5, len(agyModels))])
	}

	// 3. OpenCode
	opencodeModels, opencodeDef := discoverOpenCodeModels(home)
	t.Logf("OpenCode: %d models found, default: %s", len(opencodeModels), opencodeDef)
	if len(opencodeModels) > 0 {
		t.Logf("OpenCode sample: %v", opencodeModels)
	}

	// 4. OMP
	ompModels, ompDef := discoverOmpModels(home)
	t.Logf("OMP: %d models found, default: %s", len(ompModels), ompDef)
	if len(ompModels) > 0 {
		t.Logf("OMP sample: %v", ompModels)
	}

	// 5. Pi
	piModels, piDef := discoverPiModels(home)
	t.Logf("Pi: %d models found, default: %s", len(piModels), piDef)
	if len(piModels) > 0 {
		t.Logf("Pi sample: %v", piModels)
	}

	// Test EnrichAgentDescriptors
	agents := defaultAgents()
	enriched := EnrichAgentDescriptors(agents)
	for _, a := range enriched {
		t.Logf("Enriched agent %s: default=%s, total models=%d", a.ID, a.DefaultModel, len(a.SupportedModels))
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
