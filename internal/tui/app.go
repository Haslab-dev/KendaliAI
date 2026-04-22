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
	"github.com/kendaliai/app/internal/providers"
)

var (
	titleStyle = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#FAFAFA")).Background(lipgloss.Color("#7D56F4")).Padding(0, 1).MarginBottom(1)
	inputStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("#FF79C6"))

	userStyle  = lipgloss.NewStyle().Foreground(lipgloss.Color("#FAFAFA")).Bold(true) // White
	toolStyle  = lipgloss.NewStyle().Foreground(lipgloss.Color("#FFA500"))             // Orange
	agentStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("#8BE9FD"))             // Cyan/Blue
	errorStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("#FF5555"))             // Red
)

type model struct {
	db       *sql.DB
	ti       textinput.Model
	vp       viewport.Model
	logs     []string
	quitting bool
}

func initialModel(db *sql.DB) model {
	ti := textinput.New()
	ti.Placeholder = "Ask KendaliAI native agent..."
	ti.Focus()
	ti.CharLimit = 156
	ti.Width = 60

	vp := viewport.New(80, 20)
	vp.SetContent("KendaliAI OS Ready. Awaiting commands...")

	return model{
		db:   db,
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
type errMsg error

func runAgentTask(cmd string, p *tea.Program) tea.Cmd {
	return func() tea.Msg {
		var pr agent.Provider
		if d := os.Getenv("DEEPSEEK_API_KEY"); d != "" {
			pr = providers.NewDeepSeekProvider(d, "deepseek-chat")
		} else if z := os.Getenv("ZAI_API_KEY"); z != "" {
			pr = providers.NewZAIProvider(z, "zai-1")
		} else {
			return errMsg(fmt.Errorf("No DEEPSEEK_API_KEY or ZAI_API_KEY exported in environment"))
		}

		loop := agent.NewCognitionLoop(pr, 25)
		loop.OnTool = func(n string, args map[string]interface{}) {
			if p != nil {
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
				}
				p.Send(agentStepMsg(fmt.Sprintf("%s (%s)", n, argStr)))
			}
		}

		res, err := loop.Run(context.Background(), cmd)
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
			m.ti.SetValue("")
			
			m.vp.SetContent(strings.Join(m.logs, "\n\n"))
			m.vp.GotoBottom()
			
			return m, runAgentTask(val, globalProgram)
		}
	case tea.WindowSizeMsg:
		m.vp.Width = msg.Width
		m.vp.Height = msg.Height - 8 // Reserve room for title and input area
		m.vp.SetContent(strings.Join(m.logs, "\n\n"))
		m.vp.GotoBottom()
		return m, nil
	case agentStepMsg:
		m.logs = append(m.logs, toolStyle.Render(fmt.Sprintf("-> %s", string(msg))))
		m.vp.SetContent(strings.Join(m.logs, "\n\n"))
		m.vp.GotoBottom()
		return m, nil
	case responseMsg:
		m.logs = append(m.logs, agentStyle.Render(fmt.Sprintf("> KendaliAI: %s", string(msg))))
		m.vp.SetContent(strings.Join(m.logs, "\n\n"))
		m.vp.GotoBottom()
		return m, nil
	case errMsg:
		m.logs = append(m.logs, errorStyle.Render(fmt.Sprintf("> KendaliAI-Error: %v", msg)))
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
	if m.quitting { return "" }
	var b strings.Builder
	b.WriteString(titleStyle.Render("KendaliAI Dashboard Workspace"))
	b.WriteString("\n\n")

	b.WriteString(m.vp.View())

	b.WriteString("\n\n" + inputStyle.Render(m.ti.View()) + "\n")
	return b.String()
}

func StartDynamicTUI(db *sql.DB) error {
	p := tea.NewProgram(initialModel(db), tea.WithAltScreen(), tea.WithMouseCellMotion())
	globalProgram = p
	if _, err := p.Run(); err != nil {
		return err
	}
	return nil
}
