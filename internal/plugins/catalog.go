package plugins

// CatalogPlugin describes a default capability plugin that can be toggled per
// agent from the UI. Local plugins map to native Go tools that run fully
// offline; composio plugins call SaaS actions through a connected account.
type CatalogPlugin struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Category    string   `json:"category"`           // documents | visual | motion | cloud
	Engine      string   `json:"engine"`             // local | composio
	Tools       []string `json:"tools"`              // agent tool names unlocked
	Toolkit     string   `json:"toolkit,omitempty"`  // composio toolkit slug (engine=composio)
	SkillHint   string   `json:"skillHint,omitempty"`// related builtin skill for richer output
	DefaultOn   bool     `json:"defaultOn"`
}

// Catalog returns the default plugin catalog. Order defines UI display order.
func Catalog() []CatalogPlugin {
	return []CatalogPlugin{
		{
			ID:          "local-docx",
			Name:        "Word Documents (DOCX)",
			Description: "Create, read, and append to real .docx files natively — no external binaries needed. Markdown-style input (headings, bullets, bold) becomes proper Word formatting.",
			Category:    "documents",
			Engine:      "local",
			Tools:       []string{"docx_create", "docx_read", "docx_append"},
			DefaultOn:   true,
		},
		{
			ID:          "local-xlsx",
			Name:        "Excel Spreadsheets (XLSX)",
			Description: "Generate and read multi-sheet .xlsx workbooks natively. Rows accept strings and numbers; output opens cleanly in Excel, Google Sheets, and LibreOffice.",
			Category:    "documents",
			Engine:      "local",
			Tools:       []string{"xlsx_create", "xlsx_read"},
			DefaultOn:   true,
		},
		{
			ID:          "local-pptx",
			Name:        "PowerPoint Decks (PPTX)",
			Description: "Produce native .pptx presentations from a slide outline (title + bullets per slide) without PowerPoint installed.",
			Category:    "documents",
			Engine:      "local",
			Tools:       []string{"pptx_create"},
			SkillHint:   "open-design-slides",
			DefaultOn:   true,
		},
		{
			ID:          "local-image",
			Name:        "Visual / Image Generation",
			Description: "Generate vector visuals — posters, cards, and bar charts — as crisp .svg files with themed palettes. Fully offline and deterministic.",
			Category:    "visual",
			Engine:      "local",
			Tools:       []string{"image_generate"},
			DefaultOn:   true,
		},
		{
			ID:          "local-slides",
			Name:        "Visual Slides (Open Design)",
			Description: "Render a self-contained interactive .deck.html presentation following the Open Design Swiss spec (1920×1080 stage, 16-column grid, keyboard navigation).",
			Category:    "visual",
			Engine:      "local",
			Tools:       []string{"slides_create"},
			SkillHint:   "open-design-slides",
			DefaultOn:   true,
		},
		{
			ID:          "motion-remotion",
			Name:        "Motion Graphics (Remotion)",
			Description: "Scaffold a complete Remotion (React video) project with animated scenes, ready to render to MP4 via `npx remotion render`.",
			Category:    "motion",
			Engine:      "local",
			Tools:       []string{"motion_remotion"},
			DefaultOn:   false,
		},
		{
			ID:          "motion-hyperframe",
			Name:        "Motion Graphics (HyperFrames)",
			Description: "Generate a single-file HyperFrames .motion.html animation (GSAP master timeline, 1920×1080 stage) renderable to MP4 with the bundled renderer.",
			Category:    "motion",
			Engine:      "local",
			Tools:       []string{"motion_hyperframe"},
			SkillHint:   "open-design-hyperframes",
			DefaultOn:   true,
		},
		{
			ID:          "google-workspace",
			Name:        "Google Workspace",
			Description: "Create Google Docs, Sheets, Slides, Gmail, and manage Calendar directly in the connected account via Composio. Requires a Composio API key (Connections) and an authorized Google account.",
			Category:    "cloud",
			Engine:      "composio",
			Tools:       []string{"gcalendar_list_events", "gcalendar_create_event", "gcalendar_find_event", "gdocs_create", "gsheet_create", "gslides_create", "gmail_list_messages", "gmail_send_message"},
			Toolkit:     "googlesuper",
			DefaultOn:   true,
		},
		{
			ID:          "google-calendar",
			Name:        "Google Calendar",
			Description: "Inspect schedule availability, search events, and create appointments in Google Calendar via Composio.",
			Category:    "cloud",
			Engine:      "composio",
			Tools:       []string{"gcalendar_list_events", "gcalendar_create_event", "gcalendar_find_event"},
			Toolkit:     "googlecalendar",
			DefaultOn:   true,
		},
		{
			ID:          "github-cloud",
			Name:        "GitHub Integration",
			Description: "Inspect repositories, track issues, and manage repositories for the authenticated GitHub user via Composio.",
			Category:    "cloud",
			Engine:      "composio",
			Tools:       []string{"github_list_repos", "github_get_user", "github_create_issue", "github_list_issues"},
			Toolkit:     "github",
			DefaultOn:   true,
		},
	}
}

// FindCatalogPlugin returns the catalog entry with the given id.
func FindCatalogPlugin(id string) *CatalogPlugin {
	catalog := Catalog()
	for i := range catalog {
		if catalog[i].ID == id {
			return &catalog[i]
		}
	}
	return nil
}

// DefaultEnabledPlugins lists catalog ids enabled for agents that never
// customized their plugin selection (plugins == nil).
func DefaultEnabledPlugins() []string {
	ids := make([]string, 0)
	for _, p := range Catalog() {
		if p.DefaultOn {
			ids = append(ids, p.ID)
		}
	}
	return ids
}

// EffectivePlugins resolves an agent's plugin list: nil or empty list means the
// defaults; an explicit populated list is honored as-is.
func EffectivePlugins(agentPlugins []string) []string {
	if len(agentPlugins) == 0 {
		return DefaultEnabledPlugins()
	}
	return agentPlugins
}

// ToolsForPlugins maps enabled plugin ids to the set of unlocked tool names.
func ToolsForPlugins(pluginIDs []string) map[string]bool {
	enabled := make(map[string]bool, len(pluginIDs))
	for _, id := range pluginIDs {
		enabled[id] = true
	}
	tools := make(map[string]bool)
	for _, p := range Catalog() {
		if !enabled[p.ID] {
			continue
		}
		for _, t := range p.Tools {
			tools[t] = true
		}
	}
	return tools
}
