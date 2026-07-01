package events

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

type Event struct {
	ID        int    `json:"id"`
	SessionID string `json:"sessionId"`
	GoalID    string `json:"goalId,omitempty"`
	Type      string `json:"type"`
	Payload   string `json:"payload"`
}

type EventStore struct {
	db *sql.DB
}

func NewEventStore(db *sql.DB) *EventStore {
	_, _ = db.Exec(`CREATE TABLE IF NOT EXISTS event_traces (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		session_id TEXT NOT NULL,
		goal_id TEXT,
		type TEXT NOT NULL,
		payload TEXT NOT NULL,
		created_at INTEGER NOT NULL
	)`)
	return &EventStore{db: db}
}

func (es *EventStore) SaveEvent(ctx context.Context, sessionID, goalID, eventType, payload string) error {
	now := time.Now().UnixMilli()
	_, err := es.db.Exec(`
		INSERT INTO event_traces (session_id, goal_id, type, payload, created_at)
		VALUES (?, ?, ?, ?, ?)`,
		sessionID, goalID, eventType, payload, now)
	if err != nil {
		return fmt.Errorf("failed to save event trace: %w", err)
	}
	return nil
}

func (es *EventStore) ReplaySession(sessionID string) ([]Event, error) {
	rows, err := es.db.Query(`
		SELECT id, session_id, goal_id, type, payload FROM event_traces
		WHERE session_id = ? ORDER BY id ASC`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []Event
	for rows.Next() {
		var ev Event
		var goalID sql.NullString
		if err := rows.Scan(&ev.ID, &ev.SessionID, &goalID, &ev.Type, &ev.Payload); err != nil {
			return nil, err
		}
		if goalID.Valid {
			ev.GoalID = goalID.String
		}
		events = append(events, ev)
	}
	return events, nil
}

func (es *EventStore) ReplayGoal(goalID string) ([]Event, error) {
	rows, err := es.db.Query(`
		SELECT id, session_id, goal_id, type, payload FROM event_traces
		WHERE goal_id = ? ORDER BY id ASC`, goalID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []Event
	for rows.Next() {
		var ev Event
		var gID sql.NullString
		if err := rows.Scan(&ev.ID, &ev.SessionID, &gID, &ev.Type, &ev.Payload); err != nil {
			return nil, err
		}
		if gID.Valid {
			ev.GoalID = gID.String
		}
		events = append(events, ev)
	}
	return events, nil
}
