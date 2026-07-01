package reflection

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
)

type TimelineStore struct {
	basePath string
}

func NewTimelineStore(basePath string) *TimelineStore {
	return &TimelineStore{basePath: basePath}
}

func (t *TimelineStore) datePath(date time.Time) string {
	return filepath.Join(t.basePath, "timeline",
		fmt.Sprintf("%d", date.Year()),
		fmt.Sprintf("%02d", date.Month()),
		fmt.Sprintf("%02d.json", date.Day()))
}

func (t *TimelineStore) SaveDaily(summary DailySummary) error {
	date, _ := time.Parse("2006-01-02", summary.Date)
	path := t.datePath(date)
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return fmt.Errorf("mkdir timeline: %w", err)
	}
	data, _ := json.MarshalIndent(summary, "", "  ")
	return os.WriteFile(path, data, 0644)
}

func (t *TimelineStore) GetDaily(date time.Time) (*DailySummary, error) {
	path := t.datePath(date)
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var summary DailySummary
	if err := json.Unmarshal(data, &summary); err != nil {
		return nil, fmt.Errorf("parse timeline: %w", err)
	}
	return &summary, nil
}

func (t *TimelineStore) ListDaysAfter(start time.Time) ([]DailySummary, error) {
	year := start.Year()
	month := start.Month()
	day := start.Day()

	var results []DailySummary
	current := time.Date(year, month, day, 0, 0, 0, 0, time.UTC)
	end := time.Now()

	for !current.After(end) {
		summary, err := t.GetDaily(current)
		if err == nil {
			results = append(results, *summary)
		}
		current = current.AddDate(0, 0, 1)
	}

	return results, nil
}

func ExtractActivities(messages []MessageRow) []ActivityEvent {
	var events []ActivityEvent
	projectMap := make(map[string]int)
	tagMap := make(map[string]int)

	for _, msg := range messages {
		lower := strings.ToLower(msg.Content)
		author := msg.SenderName
		if author == "" {
			author = msg.Role
		}

		event := ActivityEvent{
			ID:        "evt_" + uuid.New().String()[:8],
			Timestamp: time.UnixMilli(msg.CreatedAt),
			Author:    author,
		}

		tags := extractTags(msg.Content)
		event.Tags = tags
		for _, t := range tags {
			tagMap[t]++
		}

		if msg.Role == "assistant" || msg.Role == "system" {
			if strings.Contains(lower, "created_file") || strings.Contains(lower, "created ") {
				event.Type = ActivityFileCreated
				event.Summary = summarizeLine(msg.Content, 100)
			} else if strings.Contains(lower, "upload") {
				event.Type = ActivityTaskCompleted
				event.Summary = "Uploaded file to storage"
			} else {
				event.Type = ActivityConversation
				event.Summary = summarizeLine(msg.Content, 120)
			}
		} else {
			event.Type = ActivityQuestion
			event.Summary = summarizeLine(msg.Content, 120)
		}

		if strings.Contains(lower, "create") && (strings.Contains(lower, "skill") || strings.Contains(lower, "deck") || strings.Contains(lower, "project")) {
			event.Type = ActivityProjectWork
		}
		if strings.Contains(lower, "skill") && (strings.Contains(lower, "create") || strings.Contains(lower, "generate") || strings.Contains(lower, "make")) {
			event.Type = ActivitySkillCreated
		}
		if strings.Contains(lower, "test") || strings.Contains(lower, "build") || strings.Contains(lower, "fix") {
			event.Type = ActivityProjectWork
		}

		project := detectProject(msg.Content)
		if project != "" {
			event.Project = project
			projectMap[project]++
		}

		if event.Summary != "" {
			events = append(events, event)
		}
	}

	for i := range events {
		e := &events[i]
		seen := map[string]bool{}
		var uniqueTags []string
		for _, t := range e.Tags {
			if !seen[t] && tagMap[t] >= 2 {
				seen[t] = true
				uniqueTags = append(uniqueTags, t)
			}
		}
		e.Tags = uniqueTags
	}

	return events
}

func GenerateDailySummary(date string, events []ActivityEvent) DailySummary {
	summary := DailySummary{
		Date: date,
	}

	tagCount := map[string]int{}
	projectSet := map[string]bool{}
	skillCreated := map[string]bool{}
	skillUsed := map[string]bool{}

	for _, ev := range events {
		summary.Activities = append(summary.Activities, ev.Summary)

		if ev.Project != "" {
			projectSet[ev.Project] = true
		}
		for _, t := range ev.Tags {
			tagCount[t]++
		}

		switch ev.Type {
		case ActivitySkillCreated:
			skillCreated[ev.SkillID] = true
			if ev.SkillID == "" {
				skillCreated[ev.Summary] = true
			}
		case ActivitySkillUsed:
			skillUsed[ev.SkillID] = true
		}
	}

	for p := range projectSet {
		summary.Projects = append(summary.Projects, p)
	}

	var topics []TopicCount
	for tag, count := range tagCount {
		if count >= 2 {
			topics = append(topics, TopicCount{Topic: tag, Count: count})
		}
	}
	sort.Slice(topics, func(i, j int) bool {
		return topics[i].Count > topics[j].Count
	})
	summary.TopTopics = topics

	for s := range skillCreated {
		summary.SkillsCreated = append(summary.SkillsCreated, s)
	}
	for s := range skillUsed {
		summary.SkillsUsed = append(summary.SkillsUsed, s)
	}

	summary.Tags = uniqueTags(tagCount)

	if len(summary.Activities) > 0 {
		summary.Summary = fmt.Sprintf("Worked on %s (%d activities)", strings.Join(summary.Projects, ", "), len(summary.Activities))
		if len(summary.Projects) == 0 {
			summary.Summary = fmt.Sprintf("General conversation (%d activities)", len(summary.Activities))
		}
	} else {
		summary.Summary = "No significant activity"
	}

	return summary
}

type MessageRow struct {
	Role       string
	Content    string
	SenderID   string
	SenderName string
	CreatedAt  int64
}

func extractTags(content string) []string {
	keywords := []string{
		"golang", "go ", "python", "javascript", "typescript", "rust", "java",
		"docker", "kubernetes", "k8s", "aws", "gcp", "azure", "r2", "s3", "cloudflare",
		"api", "rest", "graphql", "grpc", "http",
		"telegram", "bot", "agent", "ai", "llm", "openai", "mcp",
		"skill", "memory", "storage", "upload", "download",
		"test", "testing", "build", "ci/cd", "deploy",
		"database", "sql", "sqlite", "postgres",
		"frontend", "backend", "fullstack",
		"design", "architecture", "refactor",
		"config", "yaml", "json",
	}
	lower := strings.ToLower(content)
	var found []string
	for _, kw := range keywords {
		if strings.Contains(lower, kw) {
			found = append(found, kw)
		}
	}
	return found
}

func detectProject(content string) string {
	projects := []string{
		"kendaliai", "kendali", "telegram", "r2", "storage", "skill",
		"openclaw", "agent", "mcp",
	}
	lower := strings.ToLower(content)
	for _, p := range projects {
		if strings.Contains(lower, p) {
			return p
		}
	}
	return ""
}

func summarizeLine(content string, maxLen int) string {
	lines := strings.Split(content, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if len(line) > 10 && !strings.HasPrefix(line, "[") && !strings.HasPrefix(line, "tool:") {
			if len(line) > maxLen {
				return line[:maxLen-3] + "..."
			}
			return line
		}
	}
	return ""
}

func uniqueTags(counts map[string]int) []string {
	var tags []string
	for t := range counts {
		tags = append(tags, t)
	}
	sort.Strings(tags)
	return tags
}
