package skills

import "time"

type Lifecycle struct {
	OnInstall string `yaml:"onInstall,omitempty" json:"onInstall,omitempty"`
	OnUpdate  string `yaml:"onUpdate,omitempty" json:"onUpdate,omitempty"`
	OnDelete  string `yaml:"onDelete,omitempty" json:"onDelete,omitempty"`
}

type SkillSpec struct {
	ID          string   `yaml:"id" json:"id"`
	Name        string   `yaml:"name" json:"name"`
	Version     string   `yaml:"version" json:"version"`
	Description string   `yaml:"description" json:"description"`
	Author      string   `yaml:"author,omitempty" json:"author,omitempty"`
	Category    string   `yaml:"category,omitempty" json:"category,omitempty"`
	Routing     struct {
		Keywords   []string `yaml:"keywords" json:"keywords"`
		Threshold  float64  `yaml:"threshold" json:"threshold"`
		Confidence float64  `yaml:"confidence,omitempty" json:"confidence,omitempty"`
	} `yaml:"routing" json:"routing"`
	Tools struct {
		Allowed []string `yaml:"allowed" json:"allowed"`
		Denied  []string `yaml:"denied" json:"denied"`
	} `yaml:"tools" json:"tools"`
	Constraints []string   `yaml:"constraints,omitempty" json:"constraints,omitempty"`
	Memory      struct {
		Enabled bool `yaml:"enabled" json:"enabled"`
	} `yaml:"memory" json:"memory"`
	Examples struct {
		Enabled bool `yaml:"enabled" json:"enabled"`
	} `yaml:"examples" json:"examples"`
	Lifecycle  Lifecycle `yaml:"lifecycle,omitempty" json:"lifecycle,omitempty"`
	PromptFile string    `yaml:"prompt,omitempty" json:"prompt,omitempty"`
}

type SkillPackage struct {
	Spec     SkillSpec `json:"spec"`
	Prompt   string    `json:"prompt"`
	Examples string    `json:"examples,omitempty"`
}

type Metadata struct {
	GeneratedBy string    `json:"generated_by"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
	Sources     []string  `json:"sources"`
	Version     int       `json:"version"`
}
