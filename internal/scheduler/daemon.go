package scheduler

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/kendaliai/app/internal/messaging"
)

// ScheduledTask represents a cron job or routine automation task.
type ScheduledTask struct {
	ID              string     `json:"id"`
	Name            string     `json:"name"`
	Schedule        string     `json:"schedule"` // e.g. "0 1 * * *", "every 1 am", "in 30 minutes"
	Prompt          string     `json:"prompt"`   // reminder notification message or agent instruction
	TargetType      string     `json:"targetType,omitempty"` // "agent" or "group"
	TargetID        string     `json:"targetId,omitempty"`
	SessionID       string     `json:"sessionId,omitempty"`
	DeliverTelegram bool       `json:"deliverTelegram,omitempty"`
	Channel         string     `json:"channel,omitempty"` // "web", "telegram", etc.
	Enabled         bool       `json:"enabled"`
	CreatedAt       time.Time  `json:"createdAt"`
	NextRun         time.Time  `json:"nextRun"`
	LastRun         *time.Time `json:"lastRun,omitempty"`
	RunCount        int        `json:"runCount"`
	LastOutput      string     `json:"lastOutput,omitempty"`
}

// TurnExecutor is invoked when a routine triggers in a conversation
var TurnExecutor func(ctx context.Context, sessionID, agentID, prompt, channel string, deliverTelegram bool) error

// Daemon manages scheduled reminders, routines, and cron jobs.
type Daemon struct {
	mu       sync.RWMutex
	storeDir string
	tasks    map[string]*ScheduledTask
	bus      *messaging.EventBus
	stopCh   chan struct{}
}

var DefaultDaemon *Daemon

// NewDaemon initializes the scheduler daemon.
func NewDaemon(bus *messaging.EventBus) *Daemon {
	home, _ := os.UserHomeDir()
	storeDir := filepath.Join(home, ".kendaliai", "scheduler")
	_ = os.MkdirAll(storeDir, 0755)

	d := &Daemon{
		storeDir: storeDir,
		tasks:    make(map[string]*ScheduledTask),
		bus:      bus,
		stopCh:   make(chan struct{}),
	}

	d.loadTasks()
	DefaultDaemon = d
	return d
}

// Start begins the scheduler tick loop.
func (d *Daemon) Start(ctx context.Context) {
	log.Println("⏰ Routine Daemon started (evaluating persistent automations and cron jobs)")
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-d.stopCh:
			return
		case <-ticker.C:
			d.tick(ctx)
		}
	}
}

// Stop terminates the scheduler daemon.
func (d *Daemon) Stop() {
	close(d.stopCh)
}

func (d *Daemon) tick(ctx context.Context) {
	d.mu.Lock()
	now := time.Now()
	var dueTasks []*ScheduledTask

	for _, task := range d.tasks {
		if task.Enabled && !task.NextRun.IsZero() && now.After(task.NextRun) {
			dueTasks = append(dueTasks, task)
		}
	}
	d.mu.Unlock()

	for _, task := range dueTasks {
		d.executeTask(ctx, task, now)
	}
}

func (d *Daemon) executeTask(ctx context.Context, task *ScheduledTask, fireTime time.Time) {
	log.Printf("🔔 Triggering routine automation: [%s] %s (Prompt: %s)", task.ID, task.Name, task.Prompt)

	// Publish reminder triggered event on event bus
	if d.bus != nil {
		d.bus.Publish(messaging.Event{
			Type:      "reminder.triggered",
			SessionID: task.SessionID,
			Channel:   task.Channel,
			Payload: map[string]interface{}{
				"taskId":          task.ID,
				"name":            task.Name,
				"prompt":          task.Prompt,
				"schedule":        task.Schedule,
				"targetType":      task.TargetType,
				"targetId":        task.TargetID,
				"deliverTelegram": task.DeliverTelegram,
				"timestamp":       fireTime.UnixMilli(),
			},
		})
	}

	// Route into conversation system via TurnExecutor
	if TurnExecutor != nil && task.SessionID != "" {
		targetAgent := task.TargetID
		if targetAgent == "" {
			targetAgent = "personal-assistant"
		}
		go func(sid, aid, pmt string, delTg bool) {
			tCtx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
			defer cancel()
			_ = TurnExecutor(tCtx, sid, aid, "[Routine: "+task.Name+"] "+pmt, "routine", delTg)
		}(task.SessionID, targetAgent, task.Prompt, task.DeliverTelegram)
	}

	d.mu.Lock()
	task.LastRun = &fireTime
	task.RunCount++
	task.LastOutput = fmt.Sprintf("Fired at %s", fireTime.Format("2006-01-02 15:04:05"))

	// Determine next run time
	next := CalculateNextRun(task.Schedule, fireTime)
	if next.IsZero() || next.Equal(task.NextRun) {
		// One-shot reminder finished
		task.Enabled = false
	} else {
		task.NextRun = next
	}
	d.saveTaskLocked(task)
	d.mu.Unlock()
}

// AddTask registers a new scheduled reminder or cron task.
func (d *Daemon) AddTask(name, schedule, prompt, sessionID, channel string) (*ScheduledTask, error) {
	return d.AddRoutineTask(ScheduledTask{
		Name:      name,
		Schedule:  schedule,
		Prompt:    prompt,
		SessionID: sessionID,
		Channel:   channel,
	})
}

// AddRoutineTask registers a routine task with target and delivery options.
func (d *Daemon) AddRoutineTask(t ScheduledTask) (*ScheduledTask, error) {
	if strings.TrimSpace(t.Name) == "" {
		return nil, fmt.Errorf("task name is required")
	}
	if strings.TrimSpace(t.Schedule) == "" {
		return nil, fmt.Errorf("schedule is required")
	}

	now := time.Now()
	next := CalculateNextRun(t.Schedule, now)
	if next.IsZero() {
		return nil, fmt.Errorf("invalid schedule expression: %s", t.Schedule)
	}

	id := t.ID
	if id == "" {
		id = "routine_" + uuid.New().String()[:8]
	}

	task := &ScheduledTask{
		ID:              id,
		Name:            t.Name,
		Schedule:        t.Schedule,
		Prompt:          t.Prompt,
		TargetType:      t.TargetType,
		TargetID:        t.TargetID,
		SessionID:       t.SessionID,
		DeliverTelegram: t.DeliverTelegram,
		Channel:         t.Channel,
		Enabled:         true,
		CreatedAt:       now,
		NextRun:         next,
		RunCount:        0,
	}

	d.mu.Lock()
	d.tasks[id] = task
	d.saveTaskLocked(task)
	d.mu.Unlock()

	return task, nil
}

// CancelTask deletes a scheduled task.
func (d *Daemon) CancelTask(id string) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	if _, ok := d.tasks[id]; !ok {
		return fmt.Errorf("scheduled task not found: %s", id)
	}

	delete(d.tasks, id)
	taskPath := filepath.Join(d.storeDir, id+".json")
	_ = os.Remove(taskPath)

	return nil
}

// ToggleTask pauses or resumes a scheduled task.
func (d *Daemon) ToggleTask(id string, enabled bool) (*ScheduledTask, error) {
	d.mu.Lock()
	defer d.mu.Unlock()

	task, ok := d.tasks[id]
	if !ok {
		return nil, fmt.Errorf("scheduled task not found: %s", id)
	}

	task.Enabled = enabled
	if enabled {
		task.NextRun = CalculateNextRun(task.Schedule, time.Now())
	}
	d.saveTaskLocked(task)
	return task, nil
}

// RunNow triggers a task immediately.
func (d *Daemon) RunNow(ctx context.Context, id string) error {
	d.mu.RLock()
	task, ok := d.tasks[id]
	d.mu.RUnlock()

	if !ok {
		return fmt.Errorf("scheduled task not found: %s", id)
	}

	d.executeTask(ctx, task, time.Now())
	return nil
}

// ListTasks returns all scheduled tasks.
func (d *Daemon) ListTasks() []*ScheduledTask {
	d.mu.RLock()
	defer d.mu.RUnlock()

	list := make([]*ScheduledTask, 0, len(d.tasks))
	for _, t := range d.tasks {
		cp := *t
		list = append(list, &cp)
	}
	return list
}

func (d *Daemon) saveTaskLocked(task *ScheduledTask) {
	path := filepath.Join(d.storeDir, task.ID+".json")
	data, err := json.MarshalIndent(task, "", "  ")
	if err == nil {
		_ = os.WriteFile(path, data, 0644)
	}
}

func (d *Daemon) loadTasks() {
	d.mu.Lock()
	defer d.mu.Unlock()

	entries, err := os.ReadDir(d.storeDir)
	if err != nil {
		return
	}

	for _, e := range entries {
		if !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		data, err := os.ReadFile(filepath.Join(d.storeDir, e.Name()))
		if err != nil {
			continue
		}

		var task ScheduledTask
		if json.Unmarshal(data, &task) == nil && task.ID != "" {
			d.tasks[task.ID] = &task
		}
	}
}

// CalculateNextRun parses natural language or standard cron syntax and determines the next occurrence.
func CalculateNextRun(expr string, refTime time.Time) time.Time {
	clean := strings.ToLower(strings.TrimSpace(expr))

	// 1. Natural language "every 1 am" or "every day at 1 am" or "1 am"
	reAmPm := regexp.MustCompile(`(?:every\s+(?:day\s+)?at\s+|every\s+|at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)`)
	if m := reAmPm.FindStringSubmatch(clean); len(m) > 0 {
		hour, _ := strconv.Atoi(m[1])
		minute := 0
		if m[2] != "" {
			minute, _ = strconv.Atoi(m[2])
		}
		if m[3] == "pm" && hour < 12 {
			hour += 12
		} else if m[3] == "am" && hour == 12 {
			hour = 0
		}

		next := time.Date(refTime.Year(), refTime.Month(), refTime.Day(), hour, minute, 0, 0, refTime.Location())
		if !next.After(refTime) {
			next = next.AddDate(0, 0, 1)
		}
		return next
	}

	// 2. Relative times: "in X minutes", "in X hours", "in X seconds"
	reIn := regexp.MustCompile(`^in\s+(\d+)\s*(m|min|minute|minutes|h|hr|hour|hours|s|sec|second|seconds)`)
	if m := reIn.FindStringSubmatch(clean); len(m) > 0 {
		num, _ := strconv.Atoi(m[1])
		unit := m[2]
		switch {
		case strings.HasPrefix(unit, "s"):
			return refTime.Add(time.Duration(num) * time.Second)
		case strings.HasPrefix(unit, "m"):
			return refTime.Add(time.Duration(num) * time.Minute)
		case strings.HasPrefix(unit, "h"):
			return refTime.Add(time.Duration(num) * time.Hour)
		}
	}

	// 3. Keywords
	switch clean {
	case "every minute", "* * * * *":
		return refTime.Truncate(time.Minute).Add(time.Minute)
	case "hourly", "every hour", "0 * * * *":
		return refTime.Truncate(time.Hour).Add(time.Hour)
	case "daily", "every day", "0 0 * * *":
		return time.Date(refTime.Year(), refTime.Month(), refTime.Day()+1, 0, 0, 0, 0, refTime.Location())
	case "every weekday":
		next := refTime.AddDate(0, 0, 1)
		for next.Weekday() == time.Saturday || next.Weekday() == time.Sunday {
			next = next.AddDate(0, 0, 1)
		}
		return time.Date(next.Year(), next.Month(), next.Day(), 9, 0, 0, 0, refTime.Location())
	case "weekly", "every week":
		days := (7 - int(refTime.Weekday())) % 7
		if days == 0 {
			days = 7
		}
		return time.Date(refTime.Year(), refTime.Month(), refTime.Day()+days, 0, 0, 0, 0, refTime.Location())
	}

	// 4. Standard 5-field cron: minute hour dom month dow
	fields := strings.Fields(expr)
	if len(fields) == 5 {
		return parseCron5(fields, refTime)
	}

	// Fallback: 1 hour in the future
	return refTime.Add(1 * time.Hour)
}

func parseCron5(fields []string, refTime time.Time) time.Time {
	// Simple forward-stepping evaluator (evaluates minute-by-minute up to 31 days)
	testTime := refTime.Truncate(time.Minute).Add(1 * time.Minute)
	limit := refTime.Add(31 * 24 * time.Hour)

	for testTime.Before(limit) {
		if matchCronField(fields[0], testTime.Minute(), 0, 59) &&
			matchCronField(fields[1], testTime.Hour(), 0, 23) &&
			matchCronField(fields[2], testTime.Day(), 1, 31) &&
			matchCronField(fields[3], int(testTime.Month()), 1, 12) &&
			matchCronField(fields[4], int(testTime.Weekday()), 0, 6) {
			return testTime
		}
		testTime = testTime.Add(1 * time.Minute)
	}

	return refTime.Add(1 * time.Hour)
}

func matchCronField(field string, val int, min, max int) bool {
	if field == "*" {
		return true
	}

	// Step e.g. */5
	if strings.HasPrefix(field, "*/") {
		step, err := strconv.Atoi(strings.TrimPrefix(field, "*/"))
		if err == nil && step > 0 {
			return val%step == 0
		}
	}

	// List e.g. 1,3,5
	if strings.Contains(field, ",") {
		parts := strings.Split(field, ",")
		for _, p := range parts {
			if matchCronField(p, val, min, max) {
				return true
			}
		}
		return false
	}

	// Range e.g. 1-5
	if strings.Contains(field, "-") {
		parts := strings.Split(field, "-")
		if len(parts) == 2 {
			start, _ := strconv.Atoi(parts[0])
			end, _ := strconv.Atoi(parts[1])
			return val >= start && val <= end
		}
	}

	// Single number
	num, err := strconv.Atoi(field)
	return err == nil && num == val
}
