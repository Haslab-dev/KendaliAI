package channels

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"

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
				finalResp, err := loop.Run(context.Background(), upd.Message.Text)

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
