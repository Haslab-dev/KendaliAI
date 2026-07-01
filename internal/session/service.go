package session

import (
	"database/sql"
	"fmt"
)

type SessionState struct {
	SessionID      string `json:"sessionId"`
	WorkspaceRoot  string `json:"workspaceRoot"`
	GoalGraphJSON  string `json:"goalGraphJson"`
	BlackboardJSON string `json:"blackboardJson"`
	ActivePIDsJSON string `json:"activePidsJson"`
}

type SessionService struct {
	db *sql.DB
}

func NewSessionService(db *sql.DB) *SessionService {
	_, _ = db.Exec(`CREATE TABLE IF NOT EXISTS session_states (
		session_id TEXT PRIMARY KEY,
		workspace_root TEXT,
		goal_graph_json TEXT,
		blackboard_json TEXT,
		active_pids_json TEXT
	)`)

	return &SessionService{db: db}
}

func (ss *SessionService) Save(state SessionState) error {
	_, err := ss.db.Exec(`
		INSERT INTO session_states (session_id, workspace_root, goal_graph_json, blackboard_json, active_pids_json)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(session_id) DO UPDATE SET
			workspace_root = excluded.workspace_root,
			goal_graph_json = excluded.goal_graph_json,
			blackboard_json = excluded.blackboard_json,
			active_pids_json = excluded.active_pids_json`,
		state.SessionID, state.WorkspaceRoot, state.GoalGraphJSON, state.BlackboardJSON, state.ActivePIDsJSON)
	
	if err != nil {
		return fmt.Errorf("failed to save session state: %w", err)
	}
	return nil
}

func (ss *SessionService) Load(sessionID string) (*SessionState, error) {
	var state SessionState
	err := ss.db.QueryRow(`
		SELECT session_id, workspace_root, goal_graph_json, blackboard_json, active_pids_json
		FROM session_states WHERE session_id = ?`, sessionID).
		Scan(&state.SessionID, &state.WorkspaceRoot, &state.GoalGraphJSON, &state.BlackboardJSON, &state.ActivePIDsJSON)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to load session state: %w", err)
	}

	return &state, nil
}
