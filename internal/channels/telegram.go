package channels

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"os"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
	"github.com/kendaliai/app/internal/agent"
	"github.com/kendaliai/app/internal/config"
	"github.com/kendaliai/app/internal/logger"
	"github.com/kendaliai/app/internal/providers"
)

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
	db     *sql.DB
	config *config.Config
}

func NewTelegramManager(db *sql.DB, cfg *config.Config) *TelegramManager {
	return &TelegramManager{db: db, config: cfg}
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

	// Determine AI Provider mapped to env for now for simplicity
	p := getFallbackProvider()

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
				loop := agent.NewCognitionLoop(p, 25, tm.config)
				finalResp, err := loop.Run(context.Background(), upd.Message.Text)

				replyText := ""
				if err != nil {
					log.Printf("AI error: %v", err)
					replyText = fmt.Sprintf("Sorry, I ran into an error: %v", err)
				} else {
					replyText = finalResp
				}

				editMsg := tgbotapi.NewEditMessageText(upd.Message.Chat.ID, tMsg.MessageID, replyText)
				// Markdown optionally
				// editMsg.ParseMode = "markdown"

				if _, err := bot.Send(editMsg); err != nil {
					log.Printf("Error editing telegram message: %v", err)
				}
			}(update, thinkingMsg)
		}
	}
}

type agentProvider interface {
	ChatCompletion(ctx context.Context, msgs []agent.Message) (*agent.Response, error)
}

func getFallbackProvider() agentProvider {
	deepKey := os.Getenv("DEEPSEEK_API_KEY")
	if deepKey != "" {
		return providers.NewDeepSeekProvider(deepKey, "deepseek-chat")
	}

	zaiKey := os.Getenv("ZAI_API_KEY")
	if zaiKey != "" {
		return providers.NewZAIProvider(zaiKey, "zai-1") // Maybe model should be 'glm-4.6' or 'gpt-4o' eventually
	}

	log.Printf("Warning: No AI Keys found for bot polling!")
	return nil
}
