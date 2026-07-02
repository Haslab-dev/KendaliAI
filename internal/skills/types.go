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
	DisplayName string   `yaml:"displayName,omitempty" json:"displayName,omitempty"`
	Version     string   `yaml:"version" json:"version"`
	Description string   `yaml:"description" json:"description"`
	Author      string   `yaml:"author,omitempty" json:"author,omitempty"`
	License     string   `yaml:"license,omitempty" json:"license,omitempty"`
	Homepage    string   `yaml:"homepage,omitempty" json:"homepage,omitempty"`
	Repository  string   `yaml:"repository,omitempty" json:"repository,omitempty"`
	Category    string   `yaml:"category,omitempty" json:"category,omitempty"`
	Categories  []string `yaml:"categories,omitempty" json:"categories,omitempty"`
	Keywords    []string `yaml:"keywords,omitempty" json:"keywords,omitempty"`

	Routing struct {
		Keywords   []string `yaml:"keywords" json:"keywords"`
		Threshold  float64  `yaml:"threshold" json:"threshold"`
		Confidence float64  `yaml:"confidence,omitempty" json:"confidence,omitempty"`
	} `yaml:"routing" json:"routing"`

	Entrypoints struct {
		Prompt   string `yaml:"prompt,omitempty" json:"prompt,omitempty"`
		Examples string `yaml:"examples,omitempty" json:"examples,omitempty"`
	} `yaml:"entrypoints,omitempty" json:"entrypoints,omitempty"`

	MinimumVersion string `yaml:"minimumVersion,omitempty" json:"minimumVersion,omitempty"`

	Dependencies struct {
		Node    map[string]string `yaml:"node,omitempty" json:"node,omitempty"`
		Bun     map[string]string `yaml:"bun,omitempty" json:"bun,omitempty"`
		Go      map[string]string `yaml:"go,omitempty" json:"go,omitempty"`
		Docker  bool              `yaml:"docker,omitempty" json:"docker,omitempty"`
		Packages struct {
			NPM  []string `yaml:"npm,omitempty" json:"npm,omitempty"`
			Apt  []string `yaml:"apt,omitempty" json:"apt,omitempty"`
			Brew []string `yaml:"brew,omitempty" json:"brew,omitempty"`
		} `yaml:"packages,omitempty" json:"packages,omitempty"`
	} `yaml:"dependencies,omitempty" json:"dependencies,omitempty"`

	Capabilities struct {
		Filesystem struct {
			Read  []string `yaml:"read,omitempty" json:"read,omitempty"`
			Write []string `yaml:"write,omitempty" json:"write,omitempty"`
		} `yaml:"filesystem,omitempty" json:"filesystem,omitempty"`
		Shell struct {
			Commands []string `yaml:"commands,omitempty" json:"commands,omitempty"`
		} `yaml:"shell,omitempty" json:"shell,omitempty"`
		Network struct {
			Domains []string `yaml:"domains,omitempty" json:"domains,omitempty"`
		} `yaml:"network,omitempty" json:"network,omitempty"`
		Environment []string `yaml:"environment,omitempty" json:"environment,omitempty"`
	} `yaml:"capabilities,omitempty" json:"capabilities,omitempty"`

	Tools struct {
		Allowed []string          `yaml:"allowed" json:"allowed"`
		Denied  []string          `yaml:"denied" json:"denied"`
		Defs    map[string]string `yaml:"defs,omitempty" json:"defs,omitempty"`
	} `yaml:"tools" json:"tools"`

	Hooks struct {
		Install struct {
			Pre  string `yaml:"pre,omitempty" json:"pre,omitempty"`
			Post string `yaml:"post,omitempty" json:"post,omitempty"`
		} `yaml:"install,omitempty" json:"install,omitempty"`
		Execution struct {
			Pre  string `yaml:"pre,omitempty" json:"pre,omitempty"`
			Post string `yaml:"post,omitempty" json:"post,omitempty"`
		} `yaml:"execution,omitempty" json:"execution,omitempty"`
	} `yaml:"hooks,omitempty" json:"hooks,omitempty"`

	Resources struct {
		Templates []string `yaml:"templates,omitempty" json:"templates,omitempty"`
		Snippets  []string `yaml:"snippets,omitempty" json:"snippets,omitempty"`
		Assets    []string `yaml:"assets,omitempty" json:"assets,omitempty"`
		Docs      []string `yaml:"docs,omitempty" json:"docs,omitempty"`
	} `yaml:"resources,omitempty" json:"resources,omitempty"`

	Constraints []string   `yaml:"constraints,omitempty" json:"constraints,omitempty"`
	Memory      struct {
		Enabled bool `yaml:"enabled" json:"enabled"`
	} `yaml:"memory" json:"memory"`
	Examples struct {
		Enabled bool `yaml:"enabled" json:"enabled"`
	} `yaml:"examples" json:"examples"`
	Lifecycle  Lifecycle `yaml:"lifecycle,omitempty" json:"lifecycle,omitempty"`
	PromptFile string    `yaml:"prompt,omitempty" json:"prompt,omitempty"`

	Origin       string `yaml:"source,omitempty" json:"source,omitempty"`
	SourceCommit string `yaml:"sourceCommit,omitempty" json:"sourceCommit,omitempty"`
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
