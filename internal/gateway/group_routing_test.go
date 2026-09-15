package gateway

import (
	"testing"
)

func TestResolveGroupTurnAgent(t *testing.T) {
	agents := []AgentConfig{
		{ID: "personal-assistant", Name: "Personal Assistant", Role: "Coordinator", Department: "Executive"},
		{ID: "lead-frontend", Name: "Alex Rivera", Role: "Lead Frontend Dev", Department: "Engineering"},
		{ID: "lead-backend", Name: "Marcus Chen", Role: "Lead Backend Dev", Department: "Engineering"},
		{ID: "lead-architecture", Name: "Elena Rostova", Role: "Lead Solution Architecture", Department: "Architecture"},
	}

	participants := []ChatParticipant{
		{ParticipantType: "agent", ParticipantID: "personal-assistant"},
		{ParticipantType: "agent", ParticipantID: "lead-frontend"},
		{ParticipantType: "agent", ParticipantID: "lead-backend"},
		{ParticipantType: "agent", ParticipantID: "lead-architecture"},
	}

	tests := []struct {
		name          string
		prompt        string
		expectedAgent string
		expectedStrict bool
	}{
		{
			name:          "explicit @mention Alex",
			prompt:        "@Alex tolong buatkan UI button",
			expectedAgent: "lead-frontend",
			expectedStrict: true,
		},
		{
			name:          "explicit @mention handle",
			prompt:        "tolong cek PR @lead-backend",
			expectedAgent: "lead-backend",
			expectedStrict: true,
		},
		{
			name:          "direct vocative greeting Alex",
			prompt:        "Halo Alex, gimana kabarnya?",
			expectedAgent: "lead-frontend",
			expectedStrict: true,
		},
		{
			name:          "nickname vocative Chen",
			prompt:        "chen, tolong jelaskan apa itu Node.js",
			expectedAgent: "lead-backend",
			expectedStrict: true,
		},
		{
			name:          "general question about frontend",
			prompt:        "ada ide styling Tailwind untuk tampilan dashboard baru?",
			expectedAgent: "lead-frontend",
			expectedStrict: false, // General discussion! Others can share POV!
		},
		{
			name:          "general question about backend architecture",
			prompt:        "menurut kalian arsitektur websocket dan database sqlite ini kuat ga?",
			expectedAgent: "lead-backend",
			expectedStrict: false, // General discussion! Others can share POV!
		},
		{
			name:          "general question about system design",
			prompt:        "bagaimana sistem microservice dan scalability kita?",
			expectedAgent: "lead-architecture",
			expectedStrict: false, // General discussion! Others can share POV!
		},
		{
			name:          "multiple mentions - Marcus first, Alex second",
			prompt:        "@Marcus Chen, menurutmu arsitektur mana yang paling cocok untuk kendali-ai? Coba tanyakan pendapat @Alex Rivera juga.",
			expectedAgent: "lead-backend",
			expectedStrict: true,
		},
		{
			name:          "multiple mentions - Alex first, Marcus second",
			prompt:        "@Alex Rivera, tolong review component ini ya. Nanti tanyakan juga ke @Marcus Chen.",
			expectedAgent: "lead-frontend",
			expectedStrict: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			gotAgent, gotStrict := resolveGroupTurnAgent(tc.prompt, participants, agents)
			if gotAgent != tc.expectedAgent {
				t.Errorf("expected agent %q, got %q", tc.expectedAgent, gotAgent)
			}
			if gotStrict != tc.expectedStrict {
				t.Errorf("expected strict %v, got %v", tc.expectedStrict, gotStrict)
			}
		})
	}
}

func TestFindMentionedOtherAgent(t *testing.T) {
	agents := []AgentConfig{
		{ID: "personal-assistant", Name: "Personal Assistant"},
		{ID: "lead-frontend", Name: "Alex Rivera"},
		{ID: "lead-backend", Name: "Marcus Chen"},
		{ID: "lead-architecture", Name: "Elena Rostova"},
	}

	// Marcus mentions Alex at the end
	msg1 := "Menurut gue arsitektur microservices paling pas. Bagaimana menurutmu @Alex Rivera?"
	targetID, found := findMentionedOtherAgent(msg1, "lead-backend", agents)
	if !found || targetID != "lead-frontend" {
		t.Fatalf("expected 'lead-frontend', got %q (found: %v)", targetID, found)
	}

	// Should not self-mention
	msg2 := "Sebagai @Marcus Chen, saya setuju."
	_, found2 := findMentionedOtherAgent(msg2, "lead-backend", agents)
	if found2 {
		t.Fatalf("did not expect self-mention to be detected")
	}
}

func TestFindAllMentionedAgents_QueueOrder(t *testing.T) {
	agents := []AgentConfig{
		{ID: "personal-assistant", Name: "Personal Assistant"},
		{ID: "lead-frontend", Name: "Alex Rivera"},
		{ID: "lead-backend", Name: "Marcus Chen"},
		{ID: "lead-architecture", Name: "Elena Rostova"},
	}

	// 1. Multiple mentions in sequence
	msg1 := "bagaimana pendapatmu @lead-frontend @lead-backend @lead-architecture"
	res1 := findAllMentionedAgents(msg1, "", agents)
	expected1 := []string{"lead-frontend", "lead-backend", "lead-architecture"}
	if len(res1) != len(expected1) {
		t.Fatalf("expected %v, got %v", expected1, res1)
	}
	for i, id := range expected1 {
		if res1[i] != id {
			t.Errorf("at index %d: expected %s, got %s", i, id, res1[i])
		}
	}

	// 2. Mention with reverse order in sentence
	msg2 := "@Elena tolong periksa, lalu tanyakan ke @Marcus Chen dan @Alex"
	res2 := findAllMentionedAgents(msg2, "", agents)
	expected2 := []string{"lead-architecture", "lead-backend", "lead-frontend"}
	if len(res2) != len(expected2) {
		t.Fatalf("expected %v, got %v", expected2, res2)
	}
	for i, id := range expected2 {
		if res2[i] != id {
			t.Errorf("at index %d: expected %s, got %s", i, id, res2[i])
		}
	}

	// 3. Self-mention exclusion
	msg3 := "Halo @Alex, ini @Marcus Chen bicara. @Elena juga simak."
	res3 := findAllMentionedAgents(msg3, "lead-backend", agents)
	expected3 := []string{"lead-frontend", "lead-architecture"}
	if len(res3) != len(expected3) {
		t.Fatalf("expected %v, got %v", expected3, res3)
	}
	for i, id := range expected3 {
		if res3[i] != id {
			t.Errorf("at index %d: expected %s, got %s", i, id, res3[i])
		}
	}
}
