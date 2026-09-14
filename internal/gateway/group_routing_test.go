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
