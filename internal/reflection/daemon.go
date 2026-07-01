package reflection

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/kendaliai/app/internal/logger"
	"github.com/kendaliai/app/internal/skills"
)

type Daemon struct {
	db           *sql.DB
	timeline     *TimelineStore
	config       ReflectionConfig
	skillManager *skills.Manager
}

func NewDaemon(db *sql.DB, config ReflectionConfig) *Daemon {
	homeDir, _ := os.UserHomeDir()
	basePath := filepath.Join(homeDir, ".kendaliai", "data")

	return &Daemon{
		db:       db,
		timeline: NewTimelineStore(basePath),
		config:   config,
	}
}

func (d *Daemon) Start(ctx context.Context) {
	if !d.config.Enabled {
		logger.Info("Reflection", "daemon disabled via config")
		return
	}

	if d.config.Timezone == "" {
		d.config.Timezone = "Asia/Jakarta"
	}
	loc, err := time.LoadLocation(d.config.Timezone)
	if err != nil {
		loc = time.Local
	}

	logger.Info("Reflection", fmt.Sprintf("daemon started, next reflection at 00:00 %s", d.config.Timezone))

	go func() {
		for {
			now := time.Now().In(loc)
			next := time.Date(now.Year(), now.Month(), now.Day()+1, 0, 0, 0, 0, loc)
			wait := next.Sub(now)

			logger.Info("Reflection", fmt.Sprintf("next reflection in %s", wait.Truncate(time.Second)))

			select {
			case <-ctx.Done():
				return
			case <-time.After(wait):
			}

			if err := d.runReflection(ctx); err != nil {
				log.Printf("Reflection error: %v", err)
			}
		}
	}()
}

func (d *Daemon) runReflection(ctx context.Context) error {
	yesterday := time.Now().AddDate(0, 0, -1)
	dateStr := yesterday.Format("2006-01-02")

	logger.Info("Reflection", fmt.Sprintf("running daily reflection for %s", dateStr))

	messages, err := d.loadMessages(ctx, yesterday)
	if err != nil {
		return fmt.Errorf("load messages: %w", err)
	}

	if len(messages) == 0 {
		logger.Info("Reflection", fmt.Sprintf("no messages for %s, skipping", dateStr))
		return nil
	}

	logger.Info("Reflection", fmt.Sprintf("loaded %d messages for %s", len(messages), dateStr))

	events := ExtractActivities(messages)
	logger.Info("Reflection", fmt.Sprintf("extracted %d activity events", len(events)))

	summary := GenerateDailySummary(dateStr, events)

	if err := d.timeline.SaveDaily(summary); err != nil {
		return fmt.Errorf("save timeline: %w", err)
	}
	logger.Info("Reflection", fmt.Sprintf("saved timeline for %s: %s", dateStr, summary.Summary))

	candidates := d.detectSkillCandidates(dateStr, events)
	if len(candidates) > 0 {
		for _, c := range candidates {
			logger.Info("Reflection", fmt.Sprintf("skill candidate: %s (%.2f)", c.Name, c.Confidence))
			if c.Confidence >= 0.7 {
				d.autoGenerateSkill(c)
			}
		}
	}

	if yesterday.Weekday() == time.Sunday {
		d.runWeeklyReflection(ctx)
	}

	return nil
}

func (d *Daemon) loadMessages(ctx context.Context, date time.Time) ([]MessageRow, error) {
	start := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, time.UTC).UnixMilli()
	end := start + 86400000

	rows, err := d.db.Query(`
		SELECT role, content, COALESCE(sender_id,''), COALESCE(sender_name,''), created_at
		FROM messages
		WHERE created_at >= ? AND created_at < ?
		ORDER BY created_at ASC`, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []MessageRow
	for rows.Next() {
		var m MessageRow
		if err := rows.Scan(&m.Role, &m.Content, &m.SenderID, &m.SenderName, &m.CreatedAt); err != nil {
			continue
		}
		if m.Content == "" || len(m.Content) < 10 {
			continue
		}
		messages = append(messages, m)
	}
	return messages, nil
}

func (d *Daemon) detectSkillCandidates(dateStr string, events []ActivityEvent) []SkillCandidate {
	days := 7
	start := time.Now().AddDate(0, 0, -days)
	summaries, _ := d.timeline.ListDaysAfter(start)
	summaries = append(summaries, DailySummary{Date: dateStr})

	tagFrequency := map[string]int{}
	categoryMap := map[string][]string{}

	for _, s := range summaries {
		for _, t := range s.Tags {
			tagFrequency[t]++
		}
		for _, tt := range s.TopTopics {
			if tt.Count >= 2 {
				categoryMap[tt.Topic] = append(categoryMap[tt.Topic], s.Date)
			}
		}
	}

	skillCategories := map[string]struct{}{
		"golang": {}, "python": {}, "javascript": {}, "typescript": {},
		"docker": {}, "kubernetes": {}, "r2": {}, "s3": {}, "storage": {},
		"api": {}, "telegram": {}, "bot": {}, "agent": {}, "mcp": {},
		"testing": {}, "database": {}, "sql": {},
		"frontend": {}, "backend": {}, "design": {},
	}

	var candidates []SkillCandidate
	for tag, count := range tagFrequency {
		if _, ok := skillCategories[tag]; !ok || count < 3 {
			continue
		}
		confidence := float64(count) / float64(days)
		if confidence > 1.0 {
			confidence = 1.0
		}
		candidates = append(candidates, SkillCandidate{
			Name:        capitalizeTag(tag),
			Keywords:    []string{tag},
			Confidence:  confidence,
			SourceDays:  count,
			SampleTopics: categoryMap[tag],
		})
	}

	sort.Slice(candidates, func(i, j int) bool {
		return candidates[i].Confidence > candidates[j].Confidence
	})

	return candidates
}

func (d *Daemon) autoGenerateSkill(candidate SkillCandidate) {
	if d.skillManager == nil {
		return
	}

	id := strings.ToLower(candidate.Name)
	id = strings.ReplaceAll(id, " ", "-")

	if d.skillManager.Exists(id) {
		return
	}

	pkg := skills.SkillPackage{}
	pkg.Spec.ID = id
	pkg.Spec.Name = candidate.Name
	pkg.Spec.Version = "1.0.0"
	pkg.Spec.Description = fmt.Sprintf("Auto-generated skill for %s based on repeated user activity", candidate.Name)
	pkg.Spec.Author = "Reflection Daemon"
	pkg.Spec.Routing.Keywords = candidate.Keywords
	pkg.Spec.Routing.Threshold = 0.65
	pkg.Spec.Tools.Allowed = []string{"memory", "filesystem:read", "exa-search"}
	pkg.Spec.Memory.Enabled = true
	pkg.Spec.PromptFile = "prompt.md"

	pkg.Prompt = fmt.Sprintf(`You are an expert in %s.

This skill was auto-generated from repeated user activity patterns.

Topics detected:
%s

Provide accurate, helpful information about %s.
Reference past conversations and knowledge when relevant.
`, candidate.Name, strings.Join(candidate.SampleTopics, ", "), candidate.Name)

	if err := d.skillManager.Create(pkg); err != nil {
		log.Printf("Auto-skill creation failed for %s: %v", candidate.Name, err)
		return
	}

	logger.Info("Reflection", fmt.Sprintf("auto-generated skill: %s", candidate.Name))
}

func (d *Daemon) runWeeklyReflection(ctx context.Context) {
	start := time.Now().AddDate(0, 0, -7)
	summaries, err := d.timeline.ListDaysAfter(start)
	if err != nil || len(summaries) == 0 {
		return
	}

	year, week := time.Now().ISOWeek()
	ws := WeeklySummary{
		Week:     fmt.Sprintf("W%02d", week),
		Year:     year,
		Summary:  fmt.Sprintf("Weekly reflection covering %d days of activity", len(summaries)),
	}

	tagCount := map[string]int{}
	for _, s := range summaries {
		for _, t := range s.Tags {
			tagCount[t]++
		}
	}

	var topics []TopicCount
	for t, c := range tagCount {
		if c >= 3 {
			topics = append(topics, TopicCount{Topic: t, Count: c})
		}
	}
	sort.Slice(topics, func(i, j int) bool {
		return topics[i].Count > topics[j].Count
	})
	ws.TopTopics = topics

	if len(topics) > 0 {
		ws.Productivity = "High"
	} else {
		ws.Productivity = "Low"
	}

	logger.Info("Reflection", fmt.Sprintf("weekly reflection: %d days, %d topics, %s productivity",
		len(summaries), len(topics), ws.Productivity))
}

func capitalizeTag(tag string) string {
	if len(tag) <= 2 {
		return strings.ToUpper(tag)
	}
	return strings.ToUpper(tag[:1]) + tag[1:]
}

func QueryTimeline(dateStr string) (*DailySummary, error) {
	homeDir, _ := os.UserHomeDir()
	store := NewTimelineStore(filepath.Join(homeDir, ".kendaliai", "data"))

	date, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		var t time.Time
		switch strings.ToLower(dateStr) {
		case "yesterday":
			t = time.Now().AddDate(0, 0, -1)
		case "today":
			t = time.Now()
		case "last week":
			t = time.Now().AddDate(0, 0, -7)
		default:
			return nil, fmt.Errorf("unknown date: %s", dateStr)
		}
		date = t
	}

	return store.GetDaily(date)
}
