package scheduler

import (
	"context"
	"testing"
	"time"
)

func TestCalculateNextRun_Every1AM(t *testing.T) {
	// Reference: 2026-09-13 12:00:00
	ref := time.Date(2026, 9, 13, 12, 0, 0, 0, time.UTC)
	next := CalculateNextRun("every 1 am", ref)

	expected := time.Date(2026, 9, 14, 1, 0, 0, 0, time.UTC)
	if !next.Equal(expected) {
		t.Fatalf("expected %v, got %v", expected, next)
	}
}

func TestCalculateNextRun_Cron(t *testing.T) {
	// "0 1 * * *" = 1:00 AM daily
	ref := time.Date(2026, 9, 13, 0, 30, 0, 0, time.UTC)
	next := CalculateNextRun("0 1 * * *", ref)

	expected := time.Date(2026, 9, 13, 1, 0, 0, 0, time.UTC)
	if !next.Equal(expected) {
		t.Fatalf("expected %v, got %v", expected, next)
	}
}

func TestCalculateNextRun_Relative(t *testing.T) {
	ref := time.Date(2026, 9, 13, 10, 0, 0, 0, time.UTC)
	next := CalculateNextRun("in 15 minutes", ref)

	expected := time.Date(2026, 9, 13, 10, 15, 0, 0, time.UTC)
	if !next.Equal(expected) {
		t.Fatalf("expected %v, got %v", expected, next)
	}
}

func TestExecuteTask_JobTypeRouting(t *testing.T) {
	d := &Daemon{
		storeDir: t.TempDir(),
		tasks:    make(map[string]*ScheduledTask),
	}

	notificationCalled := false
	turnCalled := false

	NotificationExecutor = func(ctx context.Context, sessionID, agentID, taskName, message, channel string, deliverTelegram bool) error {
		notificationCalled = true
		if taskName != "Standup" {
			t.Errorf("expected taskName 'Standup', got %s", taskName)
		}
		if message != "Stretch now" {
			t.Errorf("expected message 'Stretch now', got %s", message)
		}
		return nil
	}

	TurnExecutor = func(ctx context.Context, sessionID, agentID, prompt, channel string, deliverTelegram bool) error {
		turnCalled = true
		return nil
	}

	// 1. Notification job
	notifTask := &ScheduledTask{
		ID:       "task-notif",
		Name:     "Standup",
		JobType:  "notification",
		Prompt:   "Stretch now",
		Schedule: "in 1 minute",
		Enabled:  true,
	}
	_ = d.executeTaskSync(context.Background(), notifTask, time.Now())
	if !notificationCalled {
		t.Errorf("expected NotificationExecutor to be called for notification job")
	}
	if turnCalled {
		t.Errorf("TurnExecutor should NOT be called for notification job")
	}

	// 2. Task job (AI Agent)
	notificationCalled = false
	turnCalled = false

	agentTask := &ScheduledTask{
		ID:       "task-ai",
		Name:     "Summarize",
		JobType:  "task",
		Prompt:   "Summarize PRs",
		Schedule: "in 1 minute",
		Enabled:  true,
	}
	_ = d.executeTaskSync(context.Background(), agentTask, time.Now())
	if !turnCalled {
		t.Errorf("expected TurnExecutor to be called for task job")
	}
	if notificationCalled {
		t.Errorf("NotificationExecutor should NOT be called for task job")
	}
}
