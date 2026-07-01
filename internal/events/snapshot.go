package events

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

type Snapshot struct {
	ID                string    `json:"id"`
	SessionID         string    `json:"sessionId"`
	ProjectionType    string    `json:"projectionType"`
	ProjectionVersion int       `json:"projectionVersion"`
	LastEventID       int64     `json:"lastEventId"`
	CreatedAt         time.Time `json:"createdAt"`
	Checksum          string    `json:"checksum"`
	Compressed        bool      `json:"compressed"`
	State             []byte    `json:"state"`
}

type SnapshotStore struct {
	db *sql.DB
}

func NewSnapshotStore(db *sql.DB) *SnapshotStore {
	_, _ = db.Exec(`CREATE TABLE IF NOT EXISTS snapshots (
		id TEXT PRIMARY KEY,
		session_id TEXT NOT NULL,
		projection_type TEXT NOT NULL,
		projection_version INTEGER NOT NULL,
		last_event_id INTEGER NOT NULL,
		created_at INTEGER NOT NULL,
		checksum TEXT NOT NULL,
		compressed INTEGER NOT NULL,
		state BLOB NOT NULL
	)`)
	return &SnapshotStore{db: db}
}

func (ss *SnapshotStore) SaveSnapshot(ctx context.Context, snap Snapshot) error {
	compressedVal := 0
	if snap.Compressed {
		compressedVal = 1
	}

	_, err := ss.db.ExecContext(ctx, `
		INSERT OR REPLACE INTO snapshots (id, session_id, projection_type, projection_version, last_event_id, created_at, checksum, compressed, state)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		snap.ID, snap.SessionID, snap.ProjectionType, snap.ProjectionVersion, snap.LastEventID, snap.CreatedAt.UnixMilli(), snap.Checksum, compressedVal, snap.State)
	if err != nil {
		return fmt.Errorf("failed to save snapshot: %w", err)
	}
	return nil
}

func (ss *SnapshotStore) LoadLatestSnapshot(ctx context.Context, sessionID, projType string) (*Snapshot, error) {
	row := ss.db.QueryRowContext(ctx, `
		SELECT id, session_id, projection_type, projection_version, last_event_id, created_at, checksum, compressed, state
		FROM snapshots
		WHERE session_id = ? AND projection_type = ?
		ORDER BY last_event_id DESC LIMIT 1`, sessionID, projType)

	var snap Snapshot
	var createdAtMilli int64
	var compressedInt int

	err := row.Scan(&snap.ID, &snap.SessionID, &snap.ProjectionType, &snap.ProjectionVersion, &snap.LastEventID, &createdAtMilli, &snap.Checksum, &compressedInt, &snap.State)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	snap.CreatedAt = time.UnixMilli(createdAtMilli)
	snap.Compressed = compressedInt == 1
	return &snap, nil
}
