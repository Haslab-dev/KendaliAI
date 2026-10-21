package acp

import (
	"testing"
)

func TestDiscovery(t *testing.T) {
	reg := newRegistry(nil)
	agents := reg.list()

	foundAgy := false
	foundCommandCode := false

	for _, a := range agents {
		t.Logf("Agent: id=%s name=%s available=%v cmd=%s", a.ID, a.Name, a.Available, a.Command)
		if a.ID == "agy" && a.Available {
			foundAgy = true
		}
		if a.ID == "commandcode" && a.Available {
			foundCommandCode = true
		}
	}

	if !foundAgy {
		t.Errorf("expected agy to be discovered and available")
	}
	if !foundCommandCode {
		t.Errorf("expected commandcode to be discovered and available")
	}
}
