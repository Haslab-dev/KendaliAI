package reflection

import "time"

type ActivityType string

const (
	ActivityProjectWork    ActivityType = "project.work"
	ActivityTaskCompleted  ActivityType = "task.completed"
	ActivityTaskStarted    ActivityType = "task.started"
	ActivitySkillCreated   ActivityType = "skill.created"
	ActivitySkillUsed      ActivityType = "skill.used"
	ActivityConversation   ActivityType = "conversation"
	ActivityFileCreated    ActivityType = "file.created"
	ActivityFileModified   ActivityType = "file.modified"
	ActivityResearch       ActivityType = "research"
	ActivityQuestion       ActivityType = "question"
	ActivityLearning       ActivityType = "learning"
)

type ActivityEvent struct {
	ID        string    `json:"id"`
	Timestamp time.Time `json:"timestamp"`
	Type      ActivityType `json:"type"`
	Project   string    `json:"project,omitempty"`
	Summary   string    `json:"summary"`
	Artifacts []string  `json:"artifacts,omitempty"`
	Tags      []string  `json:"tags"`
	SkillID   string    `json:"skillId,omitempty"`
	Author    string    `json:"author,omitempty"`
}

type DailySummary struct {
	Date       string          `json:"date"`
	Summary    string          `json:"summary"`
	Activities []string        `json:"activities"`
	People     []string        `json:"people,omitempty"`
	Projects   []string        `json:"projects"`
	SkillsCreated []string     `json:"skillsCreated,omitempty"`
	SkillsUsed    []string     `json:"skillsUsed,omitempty"`
	Tags       []string        `json:"tags"`
	TopTopics  []TopicCount    `json:"topTopics,omitempty"`
}

type TopicCount struct {
	Topic string `json:"topic"`
	Count int    `json:"count"`
}

type SkillCandidate struct {
	Name        string   `json:"name"`
	Keywords    []string `json:"keywords"`
	Confidence  float64  `json:"confidence"`
	SourceDays  int      `json:"sourceDays"`
	SampleTopics []string `json:"sampleTopics"`
}

type WeeklySummary struct {
	Week       string   `json:"week"`
	Year       int      `json:"year"`
	Summary    string   `json:"summary"`
	TopTopics  []TopicCount `json:"topTopics"`
	NewInterests []string `json:"newInterests,omitempty"`
	Productivity string  `json:"productivity,omitempty"`
}

type ReflectionConfig struct {
	Enabled  bool   `json:"enabled" yaml:"enabled"`
	Schedule string `json:"schedule" yaml:"schedule"`
	Timezone string `json:"timezone" yaml:"timezone"`
}
