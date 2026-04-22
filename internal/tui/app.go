package tui

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"strings"

	"github.com/charmbracelet/bubbles/textinput"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/kendaliai/app/internal/agent"
	"github.com/kendaliai/app/internal/config"
	"github.com/kendaliai/app/internal/providers"
)

var (
	titleStyle = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#FFFFFF")).Background(lipgloss.Color("#1A1A1A")).Padding(0, 1).MarginBottom(1)
	inputStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("#00FF00"))

	userStyle       = lipgloss.NewStyle().Foreground(lipgloss.Color("#FAFAFA")).Bold(true)
	thoughtStyle    = lipgloss.NewStyle().Foreground(lipgloss.Color("#CCCCCC"))
	toolNameStyle   = lipgloss.NewStyle().Foreground(lipgloss.Color("#FFA500")).Bold(true)
	toolDetailStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("#FFA500"))
	agentStyle      = lipgloss.NewStyle().Foreground(lipgloss.Color("#8BE9FD"))
	errorStyle      = lipgloss.NewStyle().Foreground(lipgloss.Color("#FF5555"))
	footerStyle     = lipgloss.NewStyle().Foreground(lipgloss.Color("#555555")).Italic(true)
	processingStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("#8BE9FD")).Bold(true)
)

type model struct {
	db           *sql.DB
	cfg          *config.Config
	ti           textinput.Model
	vp           viewport.Model
	logs         []string
	quitting     bool
	totalInput   int
	totalOutput  int
	isProcessing bool
}

func initialModel(db *sql.DB, cfg *config.Config) model {
	ti := textinput.New()
	ti.Prompt = "" // Remove default > to avoid double arrows
	ti.Placeholder = "Ask KendaliAI native agent..."
	ti.Focus()
	ti.CharLimit = 156
	ti.Width = 60

	vp := viewport.New(80, 20)
	vp.SetContent("KendaliAI OS Ready. Awaiting commands...")

	return model{
		db:   db,
		cfg:  cfg,
		ti:   ti,
		vp:   vp,
		logs: []string{},
	}
}

func (m model) Init() tea.Cmd {
	return textinput.Blink
}

type agentStepMsg string
type responseMsg string
type thoughtMsg string
type errMsg error
type statsMsg struct{ In, Out int }
type progressMsg bool

func runAgentTask(cmd string, p *tea.Program, m model) tea.Cmd {
	return func() tea.Msg {
		var pr agent.Provider
		if d := os.Getenv("DEEPSEEK_API_KEY"); d != "" {
			pr = providers.NewDeepSeekProvider(d, "deepseek-chat")
		} else if z := os.Getenv("ZAI_API_KEY"); z != "" {
			pr = providers.NewZAIProvider(z, "zai-1")
		} else {
			return errMsg(fmt.Errorf("No DEEPSEEK_API_KEY or ZAI_API_KEY exported in environment"))
		}

		loop := agent.NewCognitionLoop(pr, 25, m.cfg)
		loop.OnTool = func(n string, cat string, args map[string]interface{}) {
			if p != nil {
				label := cat
				argStr := ""
				
				if n == "list_files" {
					argStr = fmt.Sprintf("%v", args["path"])
				} else if n == "read_file" {
					if off, ok := args["offset"]; ok {
						argStr = fmt.Sprintf("%v offset:%v lim:%v", args["path"], off, args["limit"])
					} else {
						argStr = fmt.Sprintf("%v", args["path"])
					}
				} else if n == "apply_patch" {
					argStr = fmt.Sprintf("%v", args["path"])
				} else if n == "replace_range" {
					argStr = fmt.Sprintf("%v lines %v-%v", args["path"], args["start"], args["end"])
				} else if n == "exec" {
					argStr = fmt.Sprintf("%v", args["command"])
				} else if n == "search_files" {
					argStr = fmt.Sprintf("in %v for '%v'", args["path"], args["query"])
				} else if strings.HasPrefix(n, "git_") {
					argStr = "" // Git cmds natively hold context in name
				} else if n == "run_tests" || n == "validate_syntax" {
					argStr = fmt.Sprintf("%v", args["path"])
					if n == "validate_syntax" { argStr = fmt.Sprintf("%v", args["file"]) }
				} else if n == "fetch_url" {
					argStr = fmt.Sprintf("%v", args["url"])
				} else if n == "run_skill" {
					argStr = fmt.Sprintf("%v %v", args["skill_name"], args["args"])
				} else if n == "mcp_call" {
					srv := args["server"]
					if srv == nil { srv = args["server_name"] }
					if srv == nil { srv = args["server_url"] }
					if srv == nil { srv = args["server_cmd"] }
					
					tool := args["tool_name"]
					if tool == nil { tool = args["tool"] }
					
					argStr = fmt.Sprintf("srv:%v tool:%v ...", srv, tool)
				} else {
					argStr = fmt.Sprintf("%v", args)
				}
				p.Send(agentStepMsg(fmt.Sprintf("%s (%s %s)", label, n, argStr)))
			}
		}
		loop.OnStats = func(in, out int) {
			if p != nil {
				p.Send(statsMsg{In: in, Out: out})
			}
		}
		loop.OnResponse = func(content string) {
			if p != nil {
				// Extract thoughts (text before any tool: calls)
				thought := content
				if idx := strings.Index(content, "tool:"); idx != -1 {
					thought = content[:idx]
				}
				thought = strings.TrimSpace(thought)
				if thought != "" {
					if len(thought) > 200 {
						thought = thought[:200] + "..."
					}
					p.Send(thoughtMsg(thought))
				}
			}
		}

		p.Send(progressMsg(true))
		res, err := loop.Run(context.Background(), cmd)
		p.Send(progressMsg(false))
		if err != nil {
			return errMsg(err)
		}
		return responseMsg(res)
	}
}

// Global program reference for async injection
var globalProgram *tea.Program

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmds []tea.Cmd
	var cmd tea.Cmd

	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.Type {
		case tea.KeyCtrlC, tea.KeyEsc:
			m.quitting = true
			return m, tea.Quit
		case tea.KeyEnter:
			val := m.ti.Value()
			if val == "" { return m, nil }
			m.logs = append(m.logs, userStyle.Render(fmt.Sprintf("> You: %s", val)))
			m.logs = append(m.logs, processingStyle.Render("Start Thinking..."))
			m.ti.SetValue("")
			
			m.vp.SetContent(strings.Join(m.logs, "\n\n"))
			m.vp.GotoBottom()
			
			return m, runAgentTask(val, globalProgram, m)
		}
	case thoughtMsg:
		m.logs = append(m.logs, thoughtStyle.Render(fmt.Sprintf("● %s", string(msg))))
		m.vp.SetContent(strings.Join(m.logs, "\n\n"))
		m.vp.GotoBottom()
		return m, nil
	case statsMsg:
		m.totalInput = msg.In
		m.totalOutput = msg.Out
		return m, nil
	case progressMsg:
		m.isProcessing = bool(msg)
		return m, nil
	case tea.WindowSizeMsg:
		m.vp.Width = msg.Width
		h := msg.Height - 8 // Reserve room for title and input area
		if h < 0 {
			h = 0
		}
		m.vp.Height = h
		m.vp.SetContent(strings.Join(m.logs, "\n\n"))
		m.vp.GotoBottom()
		return m, nil
	case agentStepMsg:
		m.logs = append(m.logs, toolNameStyle.Render("└ ") + toolDetailStyle.Render(string(msg)))
		m.vp.SetContent(strings.Join(m.logs, "\n\n"))
		m.vp.GotoBottom()
		return m, nil
	case responseMsg:
		m.logs = append(m.logs, userStyle.Render("> KendaliAI: ") + agentStyle.Render(string(msg)))
		m.vp.SetContent(strings.Join(m.logs, "\n\n"))
		m.vp.GotoBottom()
		return m, nil
	case errMsg:
		m.logs = append(m.logs, errorStyle.Render(fmt.Sprintf("❌ Error: %v", msg)))
		m.vp.SetContent(strings.Join(m.logs, "\n\n"))
		m.vp.GotoBottom()
		return m, nil
	}

	m.ti, cmd = m.ti.Update(msg)
	cmds = append(cmds, cmd)

	m.vp, cmd = m.vp.Update(msg)
	cmds = append(cmds, cmd)

	return m, tea.Batch(cmds...)
}

func (m model) View() string {
	if m.quitting {
		return "Exiting KendaliAI..."
	}

	processing := ""
	if m.isProcessing {
		processing = processingStyle.Render(" ⚡ Thinking...")
	}

	footer := footerStyle.Render(fmt.Sprintf(" Tokens: In %d | Out %d", m.totalInput, m.totalOutput))

	return fmt.Sprintf(
		"%s\n%s\n\n%s\n\n%s%s\n%s",
		titleStyle.Render("KendaliAI Dashboard Workspace"),
		m.vp.View(),
		userStyle.Render("> ") + m.ti.View(),
		processing,
		footer,
		footerStyle.Render(" [Esc/Ctrl+C to quit | ? for shortcuts]"),
	)
}

func StartDynamicTUI(db *sql.DB, cfg *config.Config) error {
	p := tea.NewProgram(initialModel(db, cfg), tea.WithAltScreen())
	globalProgram = p
	if _, err := p.Run(); err != nil {
		return err
	}
	return nil
}
