package checkpoint

import (
	"context"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/google/uuid"
)

type Checkpoint struct {
	ID        string    `json:"id"`
	SessionID string    `json:"sessionId"`
	CreatedAt time.Time `json:"createdAt"`
	Files     []string  `json:"files,omitempty"`
}

type CheckpointManager struct {
	mu          sync.RWMutex
	checkpoints map[string]*Checkpoint
	workDir     string
	backupDir   string
}

func NewCheckpointManager(workDir string) *CheckpointManager {
	backupDir := filepath.Join(workDir, "build", "checkpoints")
	_ = os.MkdirAll(backupDir, 0755)

	return &CheckpointManager{
		checkpoints: make(map[string]*Checkpoint),
		workDir:     workDir,
		backupDir:   backupDir,
	}
}

func (cm *CheckpointManager) Create(ctx context.Context, sessionID string) (*Checkpoint, error) {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	id := "cp-" + uuid.New().String()[:8]
	cp := &Checkpoint{
		ID:        id,
		SessionID: sessionID,
		CreatedAt: time.Now(),
	}

	destDir := filepath.Join(cm.backupDir, id)
	if err := os.MkdirAll(destDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create backup dir: %w", err)
	}

	files, err := os.ReadDir(cm.workDir)
	if err == nil {
		for _, f := range files {
			if !f.IsDir() {
				srcPath := filepath.Join(cm.workDir, f.Name())
				destPath := filepath.Join(destDir, f.Name())
				if err := copyFile(srcPath, destPath); err == nil {
					cp.Files = append(cp.Files, f.Name())
				}
			}
		}
	}

	cm.checkpoints[id] = cp
	return cp, nil
}

func (cm *CheckpointManager) Restore(ctx context.Context, id string) (bool, error) {
	cm.mu.RLock()
	cp, ok := cm.checkpoints[id]
	cm.mu.RUnlock()

	if !ok {
		return false, fmt.Errorf("checkpoint %s not found", id)
	}

	srcDir := filepath.Join(cm.backupDir, id)

	currFiles, err := os.ReadDir(cm.workDir)
	if err == nil {
		for _, f := range currFiles {
			if !f.IsDir() {
				_ = os.Remove(filepath.Join(cm.workDir, f.Name()))
			}
		}
	}

	for _, fn := range cp.Files {
		srcPath := filepath.Join(srcDir, fn)
		destPath := filepath.Join(cm.workDir, fn)
		_ = copyFile(srcPath, destPath)
	}

	log.Printf("Deep restore completed from checkpoint %s.", cp.ID)
	return true, nil
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, in)
	return err
}
