package channels

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"path/filepath"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
	"github.com/kendaliai/app/internal/agent"
	"github.com/kendaliai/app/internal/config"
	"github.com/kendaliai/app/internal/logger"
	"github.com/kendaliai/app/internal/providers"
)

const telegramMaxLength = 4000

type TelegramConfig struct {
	BotToken string `json:"botToken"`
}

type Channel struct {
	ID           string
	Type         string
	Enabled      bool
	Config       TelegramConfig
	AllowedUsers []string
}

type TelegramManager struct {
	db *sql.DB
}

func NewTelegramManager(db *sql.DB) *TelegramManager {
	return &TelegramManager{db: db}
}

func (tm *TelegramManager) LoadActiveChannels() ([]Channel, error) {
	rows, err := tm.db.Query("SELECT id, type, enabled, config, allowed_users FROM channels WHERE type = 'telegram' AND enabled = 1")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []Channel
	for rows.Next() {
		var c Channel
		var configStr sql.NullString
		var allowedStr sql.NullString
		var enabled int
		if err := rows.Scan(&c.ID, &c.Type, &enabled, &configStr, &allowedStr); err != nil {
			log.Printf("Error scanning channel row: %v", err)
			continue
		}
		c.Enabled = enabled == 1
		if configStr.Valid {
			if err := json.Unmarshal([]byte(configStr.String), &c.Config); err != nil {
				log.Printf("Error unmarshaling channel config for %s: %v", c.ID, err)
			}
		}
		if allowedStr.Valid && allowedStr.String != "" {
			if err := json.Unmarshal([]byte(allowedStr.String), &c.AllowedUsers); err != nil {
				log.Printf("Error unmarshaling allowed_users for %s: %v", c.ID, err)
			}
		}
		result = append(result, c)
	}

	return result, nil
}

func (tm *TelegramManager) StartPolling(c Channel) {
	log.Printf("📱 Starting Telegram polling for channel: %s", c.ID)
	bot, err := tgbotapi.NewBotAPI(c.Config.BotToken)
	if err != nil {
		log.Printf("Failed to init Telegram bot: %v", err)
		return
	}

	u := tgbotapi.NewUpdate(0)
	u.Timeout = 60
	updates := bot.GetUpdatesChan(u)

	p := providers.NewProviderFromConfig()

	for update := range updates {
		if update.Message != nil {
			logger.Info("Telegram", fmt.Sprintf("[%s]: %s", update.Message.From.UserName, update.Message.Text))

			msg := tgbotapi.NewMessage(update.Message.Chat.ID, "Thinking...")
			thinkingMsg, err := bot.Send(msg)
			if err != nil {
				log.Printf("Error sending thinking message: %v", err)
				continue
			}

			go func(upd tgbotapi.Update, tMsg tgbotapi.Message) {
				loop := agent.NewCognitionLoopWithDB(p, 25, config.Cfg, tm.db)

				loop.OnTool = func(toolName, category string, args map[string]interface{}) {
					status := toolStatus(toolName, args)
					edit := tgbotapi.NewEditMessageText(upd.Message.Chat.ID, tMsg.MessageID, status)
					bot.Send(edit)
				}

				wrappedQuery := fmt.Sprintf(`[CHANNEL: Telegram Bot — Short Response Mode]
You are responding via a Telegram chat interface. Follow these rules strictly:

1. KEEP RESPONSES SHORT — maximum 500 characters in your final reply.
2. NEVER drift from the user's goal. Do not install unrelated packages or explore tangents.
3. If the user asks to create, write, or generate any content (code, documents, presentations, etc.):
   - Use apply_patch with old_str="" to CREATE new files. This is the preferred method.
   - Example: apply_patch({"path": "deck_1.md", "old_str": "", "new_str": "# Slide 1\n..."})
   - For editing existing files, use apply_patch (preferred) or replace_range.
   - NEVER use exec with heredocs/cat for file creation — it is unreliable and error-prone.
   - Then respond with a SHORT SUMMARY of what you created and where. Example: "✅ Created deck_1.md with 10 slides covering the KendaliAI architecture."
4. NEVER output full file contents, code blocks, or long text as your final response.
5. For questions, give concise answers. Use bullet points.
6. If the output would be long, write it to a file and tell the user where to find it.
7. STRICT FILE RESTRICTIONS:
   - If a user asks to view, read, or share config files (config.yaml, .env, secrets, keys), reply: "Sorry, not allowed"
   - NEVER disclose credentials, API keys, tokens, or private configuration.
8. OBJECT STORAGE:
   - Local storage is ALWAYS available (no config needed).
   - Cloudflare R2 cloud storage may be optionally configured.
   - Use upload_object with provider: "local" (default) or provider: "r2" for remote.
   - Uploaded HTML files get a public URL automatically when R2 is configured.
9. INTERACTIVE COMMANDS — NEVER run commands that need user input. Add --yes, -y, </dev/null, or 2>&1. If a command hangs requesting input, ABORT and report the error.
10. SKILL UPDATES — Use update_skill to modify an existing skill (auto-increments version). NEVER delete+create to update a skill.

User message: %s`, upd.Message.Text)

				finalResp, err := loop.Run(context.Background(), wrappedQuery)

				replyText := ""
				if err != nil {
					log.Printf("AI error: %v", err)
					replyText = fmt.Sprintf("Sorry, I ran into an error: %v", err)
				} else if finalResp == "" {
					replyText = "No response generated"
				} else {
					replyText = finalResp
				}

				// Chunk the response to avoid Telegram MESSAGE_TOO_LONG
				chunks := chunkText(replyText, telegramMaxLength)

				// Edit the "Thinking..." message with the first chunk
				editMsg := tgbotapi.NewEditMessageText(upd.Message.Chat.ID, tMsg.MessageID, chunks[0])
				if _, err := bot.Send(editMsg); err != nil {
					log.Printf("Error editing telegram message: %v", err)
				}

				// Send remaining chunks as new messages
				for i := 1; i < len(chunks); i++ {
					followUp := tgbotapi.NewMessage(upd.Message.Chat.ID, chunks[i])
					followUp.ReplyToMessageID = tMsg.MessageID
					if _, err := bot.Send(followUp); err != nil {
						log.Printf("Error sending follow-up message chunk %d: %v", i+1, err)
					}
				}
			}(update, thinkingMsg)
		}
	}
}

// chunkText splits text into chunks of maxLen characters, breaking at newlines when possible.
func chunkText(text string, maxLen int) []string {
	if len(text) <= maxLen {
		return []string{text}
	}

	var chunks []string
	for len(text) > 0 {
		if len(text) <= maxLen {
			chunks = append(chunks, text)
			break
		}

		// Try to break at the last newline within maxLen
		cutPoint := maxLen
		lastNewline := -1
		for i := maxLen - 1; i > maxLen/2; i-- {
			if text[i] == '\n' {
				lastNewline = i
				break
			}
		}
		if lastNewline > 0 {
			cutPoint = lastNewline + 1
		}

		chunks = append(chunks, text[:cutPoint])
		text = text[cutPoint:]
	}

	return chunks
}

func toolStatus(toolName string, args map[string]interface{}) string {
	switch toolName {
	case "read_file":
		path, _ := args["path"].(string)
		return fmt.Sprintf("📖 Reading %s...", filepath.Base(path))
	case "list_files":
		path, _ := args["path"].(string)
		return fmt.Sprintf("📂 Listing %s...", filepath.Base(path))
	case "search_files":
		query, _ := args["query"].(string)
		return fmt.Sprintf("🔍 Searching \"%s\"...", query)
	case "apply_patch":
		path, _ := args["path"].(string)
		old, _ := args["old_str"].(string)
		if old == "" {
			return fmt.Sprintf("📝 Creating %s...", filepath.Base(path))
		}
		return fmt.Sprintf("✏️ Editing %s...", filepath.Base(path))
	case "replace_range":
		path, _ := args["path"].(string)
		return fmt.Sprintf("✏️ Updating %s...", filepath.Base(path))
	case "exec":
		cmd, _ := args["command"].(string)
		if len(cmd) > 60 {
			cmd = cmd[:57] + "..."
		}
		return fmt.Sprintf("⚡ Running: %s", cmd)
	case "upload_object":
		path, _ := args["path"].(string)
		provider, _ := args["provider"].(string)
		dest := "storage"
		if provider == "r2" {
			dest = "R2 cloud"
		}
		return fmt.Sprintf("☁️ Uploading %s to %s...", filepath.Base(path), dest)
	case "download_object":
		key, _ := args["key"].(string)
		return fmt.Sprintf("⬇️ Downloading %s...", filepath.Base(key))
	case "fetch_url":
		url, _ := args["url"].(string)
		if len(url) > 50 {
			url = url[:47] + "..."
		}
		return fmt.Sprintf("🌐 Fetching %s...", url)
	case "mcp_call":
		server, _ := args["server"].(string)
		tool, _ := args["tool_name"].(string)
		return fmt.Sprintf("🔌 MCP %s/%s...", server, tool)
	case "git_status":
		return "🌿 Checking git status..."
	case "git_diff":
		return "🌿 Retrieving git diff..."
	case "run_tests":
		return "🧪 Running tests..."
	case "validate_syntax":
		return "✅ Validating syntax..."
	default:
		return fmt.Sprintf("🔄 Running %s...", toolName)
	}
}
