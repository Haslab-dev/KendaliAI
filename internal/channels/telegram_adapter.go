package channels

import (
	"context"
	"encoding/json"
	"fmt"
	"html"
	"log"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
	"github.com/google/uuid"
	"github.com/kendaliai/app/internal/agent"
	"github.com/kendaliai/app/internal/gateway"
	"github.com/kendaliai/app/internal/messaging"
)

type BotRunner struct {
	Config gateway.TelegramBotConfig
	Bot    *tgbotapi.BotAPI
	cancel context.CancelFunc
}

type ChatTarget struct {
	BotID           string `json:"botId"`
	ChatID          int64  `json:"chatId"`
	MessageThreadID int    `json:"messageThreadId,omitempty"`
	BotName         string `json:"botName"`
	UserName        string `json:"userName"`
	GroupName       string `json:"groupName,omitempty"`
	TopicName       string `json:"topicName,omitempty"`
}

type RawTelegramMessage struct {
	MessageID       int    `json:"message_id"`
	MessageThreadID int    `json:"message_thread_id,omitempty"`
	IsTopicMessage  bool   `json:"is_topic_message,omitempty"`
	Date            int    `json:"date"`
	Text            string `json:"text"`
	Chat            struct {
		ID       int64  `json:"id"`
		Type     string `json:"type"` // "private", "group", "supergroup", "channel"
		Title    string `json:"title,omitempty"`
		UserName string `json:"username,omitempty"`
	} `json:"chat"`
	From struct {
		ID        int64  `json:"id"`
		UserName  string `json:"username,omitempty"`
		FirstName string `json:"first_name,omitempty"`
		LastName  string `json:"last_name,omitempty"`
	} `json:"from"`
	ReplyToMessage *struct {
		MessageID int `json:"message_id"`
		From      struct {
			ID int64 `json:"id"`
		} `json:"from"`
	} `json:"reply_to_message,omitempty"`
	ForumTopicCreated *struct {
		Name string `json:"name"`
	} `json:"forum_topic_created,omitempty"`
}

type RawTelegramCallbackQuery struct {
	ID      string `json:"id"`
	From    struct {
		ID        int64  `json:"id"`
		UserName  string `json:"username,omitempty"`
		FirstName string `json:"first_name,omitempty"`
		LastName  string `json:"last_name,omitempty"`
	} `json:"from"`
	Message *RawTelegramMessage `json:"message,omitempty"`
	Data    string              `json:"data"`
}

type RawTelegramUpdate struct {
	UpdateID      int                       `json:"update_id"`
	Message       *RawTelegramMessage       `json:"message,omitempty"`
	CallbackQuery *RawTelegramCallbackQuery `json:"callback_query,omitempty"`
}

type TelegramAdapter struct {
	mu            sync.RWMutex
	runners       map[string]*BotRunner
	store         *gateway.Store
	runtime       *gateway.Runtime
	bus           *messaging.EventBus
	activeChats   map[string]string      // key: "botID:chatID" or "botID:chatID:threadID" -> sessionID
	sessionTarget map[string]*ChatTarget // key: sessionID -> ChatTarget
	lastMsgID     map[string]int         // key: sessionID -> last Telegram messageID
}

var DefaultAdapter *TelegramAdapter

func InitTelegramAdapter(store *gateway.Store, rt *gateway.Runtime, bus *messaging.EventBus) *TelegramAdapter {
	DefaultAdapter = &TelegramAdapter{
		runners:       make(map[string]*BotRunner),
		store:         store,
		runtime:       rt,
		bus:           bus,
		activeChats:   make(map[string]string),
		sessionTarget: make(map[string]*ChatTarget),
		lastMsgID:     make(map[string]int),
	}
	go DefaultAdapter.listenGlobalEvents()
	return DefaultAdapter
}

func (a *TelegramAdapter) SyncAndStart() error {
	bots, err := a.store.ListTelegramBots()
	if err != nil {
		return err
	}

	for _, b := range bots {
		if b.Enabled && b.Token != "" {
			if err := a.StartBot(b.ID); err != nil {
				log.Printf("⚠️ Failed to start Telegram bot %s: %v", b.Name, err)
			}
		}
	}
	return nil
}

func (a *TelegramAdapter) StartBot(botID string) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	if _, running := a.runners[botID]; running {
		return nil
	}

	botCfg, err := a.store.GetTelegramBot(botID)
	if err != nil || botCfg == nil {
		return fmt.Errorf("bot not found: %s", botID)
	}

	bot, err := tgbotapi.NewBotAPI(botCfg.Token)
	if err != nil {
		_ = a.store.UpdateTelegramBotStatus(botID, "error")
		return fmt.Errorf("failed to init Telegram bot: %w", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	runner := &BotRunner{
		Config: *botCfg,
		Bot:    bot,
		cancel: cancel,
	}
	a.runners[botID] = runner
	_ = a.store.UpdateTelegramBotStatus(botID, "running")

	go a.pollBot(ctx, runner)
	log.Printf("📱 [Telegram Adapter] Started bot '%s' (Agent: %s, Username: @%s)", botCfg.Name, botCfg.AgentID, bot.Self.UserName)
	return nil
}

func (a *TelegramAdapter) StopBot(botID string) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	runner, running := a.runners[botID]
	if !running {
		return nil
	}

	runner.cancel()
	delete(a.runners, botID)
	_ = a.store.UpdateTelegramBotStatus(botID, "stopped")
	log.Printf("📱 [Telegram Adapter] Stopped bot '%s'", runner.Config.Name)
	return nil
}

func (a *TelegramAdapter) IsRunning(botID string) bool {
	a.mu.RLock()
	defer a.mu.RUnlock()
	_, running := a.runners[botID]
	return running
}

func (a *TelegramAdapter) GetBotUsername(botID string) string {
	a.mu.RLock()
	defer a.mu.RUnlock()
	if runner, ok := a.runners[botID]; ok && runner.Bot != nil {
		return runner.Bot.Self.UserName
	}
	return ""
}

func (a *TelegramAdapter) TestToken(token string) (bool, string, error) {
	bot, err := tgbotapi.NewBotAPI(token)
	if err != nil {
		return false, "", err
	}
	return true, bot.Self.UserName, nil
}

func (a *TelegramAdapter) resolveChatTarget(sessionID string) *ChatTarget {
	a.mu.RLock()
	target, exists := a.sessionTarget[sessionID]
	a.mu.RUnlock()
	if exists && target != nil {
		return target
	}

	// Try reading from store
	sess, err := a.store.GetSession(sessionID)
	if err != nil || sess == nil {
		return nil
	}

	if sess.ChannelID != "telegram" && !strings.HasPrefix(sess.ID, "tg-") {
		return nil
	}

	// Try reading metadata
	if sess.Metadata != "" {
		var meta ChatTarget
		if err := json.Unmarshal([]byte(sess.Metadata), &meta); err == nil && meta.ChatID != 0 {
			a.mu.Lock()
			a.sessionTarget[sessionID] = &meta
			a.mu.Unlock()
			return &meta
		}
	}

	// Fallback parsing: tg-<botID>-<chatID> or tg-<botID>-<chatID>-topic-<threadID>
	trimmed := strings.TrimPrefix(sess.ID, "tg-")
	threadID := 0
	if strings.Contains(trimmed, "-topic-") {
		topicParts := strings.Split(trimmed, "-topic-")
		trimmed = topicParts[0]
		if len(topicParts) > 1 {
			tParts := strings.Split(topicParts[1], "-")
			threadID, _ = strconv.Atoi(tParts[0])
		}
	}

	lastHyphen := strings.LastIndex(trimmed, "-")
	if lastHyphen > 0 {
		secondLast := strings.LastIndex(trimmed[:lastHyphen], "-")
		var botID string
		var chatIDStr string
		if secondLast > 0 && trimmed[secondLast:secondLast+2] == "--" {
			botID = trimmed[:secondLast]
			chatIDStr = trimmed[secondLast+1:]
		} else {
			botID = trimmed[:lastHyphen]
			chatIDStr = trimmed[lastHyphen+1:]
		}
		chatID, err := strconv.ParseInt(chatIDStr, 10, 64)
		if err == nil && chatID != 0 {
			target = &ChatTarget{
				BotID:           botID,
				ChatID:          chatID,
				MessageThreadID: threadID,
				BotName:         botID,
				UserName:        sess.UserID,
			}
			a.mu.Lock()
			a.sessionTarget[sessionID] = target
			a.mu.Unlock()
			return target
		}
	}

	return nil
}

// listenGlobalEvents subscribes to the event bus and forwards Web messages & agent replies to Telegram (bi-directional sync)
func (a *TelegramAdapter) listenGlobalEvents() {
	sub := a.bus.Subscribe("*")
	for ev := range sub.Ch {
		// Only sync to Telegram if the event was from human web chat, NOT telegram, routine, or system events!
		if ev.Channel == "telegram" || ev.Channel == "routine" || ev.Channel == "system" {
			continue
		}

		target := a.resolveChatTarget(ev.SessionID)
		if target == nil {
			continue
		}

		a.mu.RLock()
		runner, running := a.runners[target.BotID]
		a.mu.RUnlock()
		if !running || runner == nil || runner.Bot == nil {
			continue
		}

		switch ev.Type {
		case messaging.EventMessageCreated:
			// If a human user sent a message from Web in this session, mirror it to Telegram
			if msgPayload, ok := ev.Payload.(gateway.SessionMessage); ok && msgPayload.Role == "user" {
				// Do not mirror internal routine notifications or bracketed system turns
				content := strings.TrimSpace(msgPayload.Content)
				if strings.HasPrefix(content, "[Routine") || strings.HasPrefix(content, "[SYSTEM") {
					continue
				}
				notice := fmt.Sprintf("💻 <b>[Web User]:</b>\n%s", FormatMarkdownForTelegram(msgPayload.Content))
				_, _ = a.sendTelegramMessage(runner.Bot, target.ChatID, target.MessageThreadID, notice, "HTML")
			}

		case messaging.EventAgentCompleted:
			// If an assistant response was completed (e.g. triggered by Web message), mirror reply to Telegram
			if msgPayload, ok := ev.Payload.(gateway.SessionMessage); ok && msgPayload.Role == "assistant" {
				content := msgPayload.Content
				if content == "" {
					continue
				}
				a.sendTelegramChunks(runner.Bot, target.ChatID, target.MessageThreadID, content)
			}

		case messaging.EventMessageReaction:
			if reactPayload, ok := ev.Payload.(messaging.MessageReactionPayload); ok {
				mid, err := strconv.Atoi(reactPayload.MessageID)
				if err != nil || mid <= 0 {
					a.mu.RLock()
					mid = a.lastMsgID[ev.SessionID]
					a.mu.RUnlock()
				}
				if mid > 0 {
					_ = a.SetMessageReaction(runner.Bot, target.ChatID, mid, reactPayload.Emoji)
				}
			}
		}
	}
}

func (a *TelegramAdapter) NotifyUserApproved(chatID int64, botID string) {
	a.mu.RLock()
	defer a.mu.RUnlock()

	var runner *BotRunner
	if botID != "" {
		runner = a.runners[botID]
	}
	if runner == nil {
		for _, r := range a.runners {
			runner = r
			break
		}
	}
	if runner != nil && runner.Bot != nil {
		msg := "🎉 *Access Approved by Administrator!*\n\nYour Telegram account has been authorized to use KendaliAI. Send any message to start chatting with your agents!"
		_, _ = a.sendTelegramMessage(runner.Bot, chatID, 0, msg, "Markdown")
	}
}

// SendRoutineNotification delivers an automation or routine reminder message to Telegram.
// It resolves the target user/chat from sessionID, falling back to any active chat in the store.
func (a *TelegramAdapter) SendRoutineNotification(sessionID, agentID, text string) error {
	a.mu.RLock()
	var runners []*BotRunner
	for _, r := range a.runners {
		if r.Bot != nil {
			runners = append(runners, r)
		}
	}
	a.mu.RUnlock()

	if len(runners) == 0 {
		return fmt.Errorf("no active Telegram bot available")
	}

	var target *ChatTarget
	var targetRunner *BotRunner

	// 1. Resolve from specific sessionID if provided
	if sessionID != "" {
		target = a.resolveChatTarget(sessionID)
		if target != nil {
			a.mu.RLock()
			if r, ok := a.runners[target.BotID]; ok && r.Bot != nil {
				targetRunner = r
			}
			a.mu.RUnlock()
		}
	}

	// 2. If targetRunner not yet set, match by agentID
	if targetRunner == nil && agentID != "" {
		for _, r := range runners {
			if r.Config.AgentID == agentID {
				targetRunner = r
				break
			}
		}
	}

	// 3. Fallback to first available runner
	if targetRunner == nil {
		targetRunner = runners[0]
	}

	// 4. If target not found yet, check in-memory sessionTarget
	if target == nil {
		a.mu.RLock()
		for _, t := range a.sessionTarget {
			if t.BotID == targetRunner.Config.ID && t.ChatID != 0 {
				target = t
				break
			}
		}
		a.mu.RUnlock()
	}

	// 5. If still nil, load from DB sessions table
	if target == nil && a.store != nil {
		sessions, err := a.store.ListSessions()
		if err == nil {
			for _, s := range sessions {
				if s.ChannelID == "telegram" || strings.HasPrefix(s.ID, "tg-") {
					resolved := a.resolveChatTarget(s.ID)
					if resolved != nil && resolved.ChatID != 0 {
						if resolved.BotID == targetRunner.Config.ID {
							target = resolved
							break
						}
						if target == nil {
							target = resolved
						}
					}
				}
			}
		}
	}

	if target == nil {
		return fmt.Errorf("no user chat registered for bot %s yet", targetRunner.Config.Name)
	}

	// Switch runner to match target.BotID if that runner is active
	a.mu.RLock()
	if r, ok := a.runners[target.BotID]; ok && r.Bot != nil {
		targetRunner = r
	}
	a.mu.RUnlock()

	formatted := FormatMarkdownForTelegram(text)
	if len(formatted) > 4000 {
		a.sendTelegramChunks(targetRunner.Bot, target.ChatID, target.MessageThreadID, text)
		log.Printf("📱 [Telegram Adapter] Delivered routine chunks to chat %d via bot %s", target.ChatID, targetRunner.Config.Name)
		return nil
	}

	_, err := a.sendTelegramMessage(targetRunner.Bot, target.ChatID, target.MessageThreadID, formatted, "HTML")
	if err != nil {
		// Fallback to plain text if HTML parsing encounters entity issues
		_, err = a.sendTelegramMessage(targetRunner.Bot, target.ChatID, target.MessageThreadID, text, "")
	}

	if err == nil {
		log.Printf("📱 [Telegram Adapter] Delivered routine notification to chat %d via bot %s", target.ChatID, targetRunner.Config.Name)
	} else {
		log.Printf("⚠️ [Telegram Adapter] Failed to deliver routine message: %v", err)
	}
	return err
}

func (a *TelegramAdapter) SendAgentNotification(agentID string, text string) error {
	return a.SendRoutineNotification("", agentID, text)
}

func normalizeTelegramEmoji(emoji string) string {
	switch emoji {
	case "😂":
		return "🤣"
	case "🚀":
		return "🔥"
	case "🚨":
		return "⚡"
	case "🤖":
		return "👨‍💻"
	case "✨":
		return "🎉"
	default:
		return emoji
	}
}

func previewTelegramLog(s string, maxLen int) string {
	s = strings.ReplaceAll(s, "\n", " ")
	s = strings.TrimSpace(s)
	if len(s) > maxLen {
		return s[:maxLen] + "..."
	}
	return s
}

func makeStopButtonMarkup(sessionID string) string {
	stopMarkup := map[string]interface{}{
		"inline_keyboard": [][]map[string]string{
			{
				{"text": "⏹️ Stop Diskusi", "callback_data": "stop_discussion:" + sessionID},
			},
		},
	}
	b, _ := json.Marshal(stopMarkup)
	return string(b)
}

func (a *TelegramAdapter) sendTelegramMessage(bot *tgbotapi.BotAPI, chatID int64, threadID int, text string, parseMode string) (int, error) {
	params := tgbotapi.Params{
		"chat_id": strconv.FormatInt(chatID, 10),
		"text":    text,
	}
	if threadID != 0 {
		params["message_thread_id"] = strconv.Itoa(threadID)
	}
	if parseMode != "" {
		params["parse_mode"] = parseMode
	}

	resp, err := bot.MakeRequest("sendMessage", params)
	if err != nil {
		if parseMode != "" {
			delete(params, "parse_mode")
			resp, err = bot.MakeRequest("sendMessage", params)
		}
		if err != nil {
			log.Printf("⚠️ [Telegram OUT FAILED] Bot: @%s | Chat: %d | Error: %v", bot.Self.UserName, chatID, err)
			return 0, err
		}
	}

	var sent struct {
		MessageID int `json:"message_id"`
	}
	_ = json.Unmarshal(resp.Result, &sent)
	log.Printf("📤 [Telegram OUT] Bot: @%s | Chat: %d | Topic: %d | MsgID: %d | %q",
		bot.Self.UserName, chatID, threadID, sent.MessageID, previewTelegramLog(text, 60))
	return sent.MessageID, nil
}

func (a *TelegramAdapter) sendTelegramMessageWithStopButton(bot *tgbotapi.BotAPI, chatID int64, threadID int, text string, parseMode string, sessionID string) (int, error) {
	params := tgbotapi.Params{
		"chat_id":      strconv.FormatInt(chatID, 10),
		"text":         text,
		"reply_markup": makeStopButtonMarkup(sessionID),
	}
	if threadID != 0 {
		params["message_thread_id"] = strconv.Itoa(threadID)
	}
	if parseMode != "" {
		params["parse_mode"] = parseMode
	}

	resp, err := bot.MakeRequest("sendMessage", params)
	if err != nil {
		if parseMode != "" {
			delete(params, "parse_mode")
			resp, err = bot.MakeRequest("sendMessage", params)
		}
		if err != nil {
			log.Printf("⚠️ [Telegram OUT FAILED] Bot: @%s | Chat: %d | Error: %v", bot.Self.UserName, chatID, err)
			return 0, err
		}
	}

	var sent struct {
		MessageID int `json:"message_id"`
	}
	_ = json.Unmarshal(resp.Result, &sent)
	log.Printf("📤 [Telegram OUT + StopButton] Bot: @%s | Chat: %d | Topic: %d | MsgID: %d | %q",
		bot.Self.UserName, chatID, threadID, sent.MessageID, previewTelegramLog(text, 60))
	return sent.MessageID, nil
}

func (a *TelegramAdapter) editTelegramMessage(bot *tgbotapi.BotAPI, chatID int64, messageID int, text string, parseMode string) error {
	params := tgbotapi.Params{
		"chat_id":    strconv.FormatInt(chatID, 10),
		"message_id": strconv.Itoa(messageID),
		"text":       text,
	}
	if parseMode != "" {
		params["parse_mode"] = parseMode
	}

	_, err := bot.MakeRequest("editMessageText", params)
	if err != nil && parseMode != "" {
		delete(params, "parse_mode")
		_, err = bot.MakeRequest("editMessageText", params)
	}
	if err == nil {
		log.Printf("✏️ [Telegram EDIT] Bot: @%s | Chat: %d | MsgID: %d | %q",
			bot.Self.UserName, chatID, messageID, previewTelegramLog(text, 60))
	}
	return err
}

func (a *TelegramAdapter) editTelegramMessageWithStopButton(bot *tgbotapi.BotAPI, chatID int64, messageID int, text string, parseMode string, sessionID string) error {
	params := tgbotapi.Params{
		"chat_id":      strconv.FormatInt(chatID, 10),
		"message_id":   strconv.Itoa(messageID),
		"text":         text,
		"reply_markup": makeStopButtonMarkup(sessionID),
	}
	if parseMode != "" {
		params["parse_mode"] = parseMode
	}

	_, err := bot.MakeRequest("editMessageText", params)
	if err != nil && parseMode != "" {
		delete(params, "parse_mode")
		_, err = bot.MakeRequest("editMessageText", params)
	}
	if err == nil {
		log.Printf("✏️ [Telegram EDIT + StopButton] Bot: @%s | Chat: %d | MsgID: %d | %q",
			bot.Self.UserName, chatID, messageID, previewTelegramLog(text, 60))
	}
	return err
}

func (a *TelegramAdapter) deleteTelegramMessage(bot *tgbotapi.BotAPI, chatID int64, messageID int) error {
	params := tgbotapi.Params{
		"chat_id":    strconv.FormatInt(chatID, 10),
		"message_id": strconv.Itoa(messageID),
	}
	_, err := bot.MakeRequest("deleteMessage", params)
	return err
}

// SetMessageReaction reacts to a Telegram message with an emoji (e.g. 🤣, 👍, 🔥, ❤️, 🤔, 🫡, ⚡, 🎉)
func (a *TelegramAdapter) SetMessageReaction(bot *tgbotapi.BotAPI, chatID int64, messageID int, emoji string) error {
	if bot == nil || chatID == 0 || messageID == 0 || emoji == "" {
		return nil
	}
	emoji = normalizeTelegramEmoji(emoji)
	reactionJSON, _ := json.Marshal([]map[string]string{
		{"type": "emoji", "emoji": emoji},
	})
	params := tgbotapi.Params{
		"chat_id":    strconv.FormatInt(chatID, 10),
		"message_id": strconv.Itoa(messageID),
		"reaction":   string(reactionJSON),
	}
	_, err := bot.MakeRequest("setMessageReaction", params)
	if err != nil {
		log.Printf("⚠️ [Telegram Reaction FAILED] Bot: @%s | Chat: %d | MsgID: %d | Emoji: %s | Error: %v",
			bot.Self.UserName, chatID, messageID, emoji, err)
	} else {
		log.Printf("👍 [Telegram Reaction OK] Bot: @%s | Chat: %d | MsgID: %d | Emoji: %s",
			bot.Self.UserName, chatID, messageID, emoji)
	}
	return err
}

// ReactToSessionMessage reacts with an emoji on the latest Telegram message in a session.
func (a *TelegramAdapter) ReactToSessionMessage(sessionID string, emoji string) error {
	a.mu.RLock()
	target := a.sessionTarget[sessionID]
	lastID := a.lastMsgID[sessionID]
	var runner *BotRunner
	if target != nil {
		runner = a.runners[target.BotID]
	}
	a.mu.RUnlock()

	if target == nil || runner == nil || runner.Bot == nil || lastID == 0 {
		return nil
	}
	return a.SetMessageReaction(runner.Bot, target.ChatID, lastID, emoji)
}

func (a *TelegramAdapter) handleCallbackQuery(runner *BotRunner, cb *RawTelegramCallbackQuery) {
	if cb == nil || runner == nil || runner.Bot == nil {
		return
	}

	userName := cb.From.UserName
	if userName == "" {
		userName = strings.TrimSpace(cb.From.FirstName + " " + cb.From.LastName)
	}
	if userName == "" {
		userName = "Telegram User"
	}

	chatID := int64(0)
	threadID := 0
	if cb.Message != nil {
		chatID = cb.Message.Chat.ID
		threadID = cb.Message.MessageThreadID
	}

	log.Printf("🔘 [Telegram Callback IN] Bot: @%s | Chat: %d | User: @%s (ID: %d) | Data: %q",
		runner.Bot.Self.UserName, chatID, userName, cb.From.ID, cb.Data)

	if strings.HasPrefix(cb.Data, "stop_discussion:") {
		sessionID := strings.TrimPrefix(cb.Data, "stop_discussion:")
		a.runtime.StopDiscussion(sessionID)

		// Answer callback query so button spinner finishes
		answerParams := tgbotapi.Params{
			"callback_query_id": cb.ID,
			"text":              "⏹️ Diskusi multi-agent dihentikan!",
			"show_alert":        "false",
		}
		_, _ = runner.Bot.MakeRequest("answerCallbackQuery", answerParams)

		if chatID != 0 {
			stopNotice := fmt.Sprintf("⏹️ <b>Diskusi dihentikan oleh @%s</b>\nSemua agen telah dipause. Kirim pesan baru jika ingin memulai lagi.", userName)
			_, _ = a.sendTelegramMessage(runner.Bot, chatID, threadID, stopNotice, "HTML")
		}
		log.Printf("⏹️ [Telegram] Discussion stopped via inline button for session %s by @%s", sessionID, userName)
		return
	}

	// Default acknowledge
	answerParams := tgbotapi.Params{
		"callback_query_id": cb.ID,
		"text":              "OK",
	}
	_, _ = runner.Bot.MakeRequest("answerCallbackQuery", answerParams)
}

var (
	reDSMLSentence = regexp.MustCompile(`<｜(?:begin|end) of sentence｜>`)
	reDSMLThought  = regexp.MustCompile(`(?s)<｜thought｜>.*?<\/｜thought｜>`)
	reDSMLUnclosed = regexp.MustCompile(`(?s)<｜thought｜>.*`)
	reDSMLTags     = regexp.MustCompile(`<｜DSML.*?｜>`)
	reToolCalls    = regexp.MustCompile(`(?s)<tool_call>.*?<\/tool_call>`)

	reCodeBlock = regexp.MustCompile("(?s)```(\\w*)\\n?(.*?)```")
	reInlineCode = regexp.MustCompile("`([^`\\n]+)`")
	reHeadings   = regexp.MustCompile(`(?m)^#{1,6}\s+(.+)$`)
	reBold       = regexp.MustCompile(`\*\*(.+?)\*\*`)
	reStrike     = regexp.MustCompile(`~~(.+?)~~`)
	reLink       = regexp.MustCompile(`\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)`)
	reBullet     = regexp.MustCompile(`(?m)^[\*\-]\s+`)
)

// SanitizeModelArtifacts strips internal model tokens, DSML thinking blocks, and raw XML tool_calls.
func SanitizeModelArtifacts(raw string) string {
	cleaned := reDSMLSentence.ReplaceAllString(raw, "")
	cleaned = reDSMLThought.ReplaceAllString(cleaned, "")
	cleaned = reDSMLUnclosed.ReplaceAllString(cleaned, "")
	cleaned = reDSMLTags.ReplaceAllString(cleaned, "")
	cleaned = reToolCalls.ReplaceAllString(cleaned, "")
	cleaned = agent.StripToolCallMarkup(cleaned)
	return strings.TrimSpace(cleaned)
}

// FormatMarkdownForTelegram transforms standard Markdown into Telegram-compatible HTML tags (<b>, <i>, <code>, <pre>).
func FormatMarkdownForTelegram(raw string) string {
	cleaned := SanitizeModelArtifacts(raw)
	if cleaned == "" {
		return ""
	}

	// Auto-close any trailing unclosed code fences to prevent raw unformatted dumps
	fenceCount := strings.Count(cleaned, "```")
	if fenceCount%2 != 0 {
		cleaned += "\n```"
	}

	// 1. Extract code blocks first to protect code from escaping and markdown formatting
	var codeBlocks []string
	cleaned = reCodeBlock.ReplaceAllStringFunc(cleaned, func(match string) string {
		sub := reCodeBlock.FindStringSubmatch(match)
		code := ""
		if len(sub) > 2 {
			code = sub[2]
		}
		escapedCode := html.EscapeString(code)
		block := fmt.Sprintf("<pre><code>%s</code></pre>", escapedCode)
		idx := len(codeBlocks)
		codeBlocks = append(codeBlocks, block)
		return fmt.Sprintf("\x00CB_%d\x00", idx)
	})

	// 2. Extract inline code
	var inlineCodes []string
	cleaned = reInlineCode.ReplaceAllStringFunc(cleaned, func(match string) string {
		sub := reInlineCode.FindStringSubmatch(match)
		code := ""
		if len(sub) > 1 {
			code = sub[1]
		}
		escapedCode := html.EscapeString(code)
		inline := fmt.Sprintf("<code>%s</code>", escapedCode)
		idx := len(inlineCodes)
		inlineCodes = append(inlineCodes, inline)
		return fmt.Sprintf("\x00IC_%d\x00", idx)
	})

	// 3. HTML-escape all text outside code blocks
	cleaned = html.EscapeString(cleaned)

	// 4. Convert markdown headings -> <b>Title</b>
	cleaned = reHeadings.ReplaceAllString(cleaned, "<b>$1</b>")

	// 5. Convert bold **text** -> <b>text</b>
	cleaned = reBold.ReplaceAllString(cleaned, "<b>$1</b>")

	// 6. Convert bullet lists -> • item
	cleaned = reBullet.ReplaceAllString(cleaned, "• ")

	// 7. Convert strikethrough ~~text~~ -> <s>text</s>
	cleaned = reStrike.ReplaceAllString(cleaned, "<s>$1</s>")

	// 8. Convert links [title](url) -> <a href="url">title</a>
	cleaned = reLink.ReplaceAllString(cleaned, `<a href="$2">$1</a>`)

	// 9. Restore inline code
	for idx, inline := range inlineCodes {
		placeholder := fmt.Sprintf("\x00IC_%d\x00", idx)
		cleaned = strings.ReplaceAll(cleaned, placeholder, inline)
	}

	// 10. Restore code blocks
	for idx, block := range codeBlocks {
		placeholder := fmt.Sprintf("\x00CB_%d\x00", idx)
		cleaned = strings.ReplaceAll(cleaned, placeholder, block)
	}

	return cleaned
}

func escapeMarkdown(s string) string {
	replacer := strings.NewReplacer(
		"_", "\\_",
		"*", "\\*",
		"[", "\\[",
		"`", "\\`",
	)
	return replacer.Replace(s)
}

func (a *TelegramAdapter) sendTelegramChunks(bot *tgbotapi.BotAPI, chatID int64, threadID int, text string) {
	formatted := FormatMarkdownForTelegram(text)
	const maxLen = 4000
	for len(formatted) > 0 {
		if len(formatted) <= maxLen {
			_, _ = a.sendTelegramMessage(bot, chatID, threadID, formatted, "HTML")
			break
		}
		chunk := formatted[:maxLen]
		lastIdx := strings.LastIndexAny(chunk, "\n ")
		if lastIdx > 2000 {
			chunk = formatted[:lastIdx]
			formatted = formatted[lastIdx+1:]
		} else {
			formatted = formatted[maxLen:]
		}
		_, _ = a.sendTelegramMessage(bot, chatID, threadID, chunk, "HTML")
	}
}

func pickDefaultAgentForTopic(topicName string, fallback string) string {
	lower := strings.ToLower(topicName)
	if strings.Contains(lower, "front") || strings.Contains(lower, "ui") || strings.Contains(lower, "react") {
		return "lead-frontend"
	}
	if strings.Contains(lower, "back") || strings.Contains(lower, "api") || strings.Contains(lower, "server") {
		return "lead-backend"
	}
	if strings.Contains(lower, "arch") || strings.Contains(lower, "system") || strings.Contains(lower, "rfc") {
		return "lead-architecture"
	}
	if strings.Contains(lower, "legal") || strings.Contains(lower, "law") || strings.Contains(lower, "compliance") || strings.Contains(lower, "license") {
		return "legal-counsel"
	}
	if strings.Contains(lower, "sec") || strings.Contains(lower, "audit") || strings.Contains(lower, "vuln") {
		return "chief-security"
	}
	if strings.Contains(lower, "devops") || strings.Contains(lower, "infra") || strings.Contains(lower, "deploy") || strings.Contains(lower, "docker") {
		return "devops-lead"
	}
	if strings.Contains(lower, "sre") || strings.Contains(lower, "incident") || strings.Contains(lower, "outage") || strings.Contains(lower, "monitor") || strings.Contains(lower, "alert") {
		return "sre-agent"
	}
	if strings.Contains(lower, "code") || strings.Contains(lower, "dev") || strings.Contains(lower, "program") || strings.Contains(lower, "tech") {
		return "coding-agent"
	}
	if strings.Contains(lower, "research") || strings.Contains(lower, "investigat") || strings.Contains(lower, "analys") || strings.Contains(lower, "search") {
		return "research-agent"
	}
	if strings.Contains(lower, "knowledge") || strings.Contains(lower, "note") || strings.Contains(lower, "brain") || strings.Contains(lower, "doc") {
		return "knowledge-agent"
	}
	if fallback != "" {
		return fallback
	}
	return "personal-assistant"
}

func (a *TelegramAdapter) pollBot(ctx context.Context, runner *BotRunner) {
	offset := 0
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		params := tgbotapi.Params{
			"offset":  strconv.Itoa(offset),
			"timeout": "25",
		}
		resp, err := runner.Bot.MakeRequest("getUpdates", params)
		if err != nil {
			log.Printf("⚠️ [Telegram Poller] Polling error for @%s: %v", runner.Bot.Self.UserName, err)
			select {
			case <-ctx.Done():
				return
			case <-time.After(2 * time.Second):
			}
			continue
		}

		var rawUpdates []RawTelegramUpdate
		if err := json.Unmarshal(resp.Result, &rawUpdates); err != nil {
			continue
		}

		if len(rawUpdates) > 0 {
			log.Printf("📥 [Telegram Poller] Bot: @%s received %d update(s)", runner.Bot.Self.UserName, len(rawUpdates))
		}

		for _, update := range rawUpdates {
			if update.UpdateID >= offset {
				offset = update.UpdateID + 1
			}
			if update.Message != nil {
				go a.handleRawTelegramMessage(runner, update.Message)
			}
			if update.CallbackQuery != nil {
				go a.handleCallbackQuery(runner, update.CallbackQuery)
			}
		}
	}
}

func (a *TelegramAdapter) handleRawTelegramMessage(runner *BotRunner, msg *RawTelegramMessage) {
	chatID := msg.Chat.ID
	threadID := msg.MessageThreadID
	userName := msg.From.UserName
	if userName == "" {
		userName = strings.TrimSpace(msg.From.FirstName + " " + msg.From.LastName)
	}
	if userName == "" {
		userName = "Telegram User"
	}
	senderID := msg.From.ID
	if senderID == 0 {
		senderID = msg.Chat.ID
	}

	isGroupChat := msg.Chat.Type == "group" || msg.Chat.Type == "supergroup" || msg.Chat.Title != "" || threadID != 0
	sessType := "direct"
	if isGroupChat {
		sessType = "group"
	}

	chatType := msg.Chat.Type
	if chatType == "" {
		chatType = "private"
	}
	topicInfo := "none"
	if msg.MessageThreadID != 0 {
		topicInfo = fmt.Sprintf("topic #%d", msg.MessageThreadID)
	}
	if msg.ForumTopicCreated != nil {
		topicInfo = fmt.Sprintf("NEW_TOPIC(%q)", msg.ForumTopicCreated.Name)
	}
	log.Printf("📩 [Telegram IN] Bot: @%s | Chat: %d (%s) | Group: %q | Topic: %s | User: @%s (ID: %d) | MsgID: %d | Text: %q",
		runner.Bot.Self.UserName,
		chatID,
		chatType,
		msg.Chat.Title,
		topicInfo,
		userName,
		senderID,
		msg.MessageID,
		msg.Text,
	)

	// 1. Handle new forum topic creation in supergroups
	if msg.ForumTopicCreated != nil {
		topicName := msg.ForumTopicCreated.Name
		assignedAgent := pickDefaultAgentForTopic(topicName, runner.Config.AgentID)
		chatKey := fmt.Sprintf("%s:%d:%d", runner.Config.ID, chatID, threadID)
		sessionID := fmt.Sprintf("tg-%s-%d-topic-%d", runner.Config.ID, chatID, threadID)

		meta := ChatTarget{
			BotID:           runner.Config.ID,
			ChatID:          chatID,
			MessageThreadID: threadID,
			BotName:         runner.Config.Name,
			UserName:        userName,
			GroupName:       msg.Chat.Title,
			TopicName:       topicName,
		}
		metaJSON, _ := json.Marshal(meta)
		title := fmt.Sprintf("Telegram: %s [%s]", msg.Chat.Title, topicName)

		newSess := gateway.Session{
			ID:        sessionID,
			AgentID:   assignedAgent,
			Title:     title,
			Type:      "group",
			ChannelID: "telegram",
			UserID:    userName,
			Status:    "active",
			Metadata:  string(metaJSON),
			CreatedAt: time.Now().Unix(),
			UpdatedAt: time.Now().Unix(),
		}
		_ = a.store.SaveSession(newSess)

		a.mu.Lock()
		a.activeChats[chatKey] = sessionID
		a.sessionTarget[sessionID] = &meta
		a.mu.Unlock()

		a.bus.Publish(messaging.Event{
			ID:        uuid.New().String(),
			Type:      messaging.EventSessionCreated,
			SessionID: sessionID,
			AgentID:   assignedAgent,
			Channel:   "telegram",
			Payload:   newSess,
			Timestamp: time.Now(),
		})

		welcome := fmt.Sprintf("👋 *Topic '%s' initialized!*\n🎯 Assigned Agent: *%s*\n\nSend any message to start chatting, or type `/agent <name>` to switch agents.", topicName, assignedAgent)
		_, _ = a.sendTelegramMessage(runner.Bot, chatID, threadID, welcome, "Markdown")
		return
	}

	rawText := strings.TrimSpace(msg.Text)
	if rawText == "" {
		return
	}

	botUsername := runner.Bot.Self.UserName
	cleanText := rawText
	if botUsername != "" && strings.Contains(strings.ToLower(cleanText), "@"+strings.ToLower(botUsername)) {
		re := regexp.MustCompile("(?i)@" + regexp.QuoteMeta(botUsername))
		cleanText = strings.TrimSpace(re.ReplaceAllString(cleanText, ""))
	}

	if msg.From.UserName != "" {
		userName = msg.From.UserName
	}
	firstName := msg.From.FirstName
	lastName := msg.From.LastName

	// Check if Telegram Authorization is required
	authRequired := a.store.GetTelegramAuthRequired()
	isAuth := true
	if authRequired {
		var err error
		isAuth, err = a.store.IsTelegramUserAuthorized(senderID, userName)
		if err != nil {
			log.Printf("⚠️ Error checking telegram authorization: %v", err)
			isAuth = false
		}
	}

	// Handle /whoami or /id for all users
	if cleanText == "/whoami" || cleanText == "/id" {
		status := "🔒 *Unauthorized (Pending Approval)*"
		extraHint := "\n\n👉 *Please run `/auth <code>` to authorize this bot.*"
		if isAuth {
			status = "✅ *Authorized User*"
			extraHint = ""
		}
		idInfo := fmt.Sprintf("👤 *Telegram Identity*\n\n• User ID: `%d`\n• Username: @%s\n• Name: %s %s\n• Status: %s%s\n\n_KendaliAI Agent Gateway_",
			senderID, escapeMarkdown(userName), escapeMarkdown(firstName), escapeMarkdown(lastName), status, extraHint)
		_, _ = a.sendTelegramMessage(runner.Bot, chatID, threadID, idInfo, "Markdown")
		return
	}

	// If not authorized: verify /auth or /verify OTP code, or deny and record pending request
	if authRequired && !isAuth {
		// Accept /auth <code>, /verify <code>, or /start <code>
		isAuthCmd := strings.HasPrefix(cleanText, "/auth") || strings.HasPrefix(cleanText, "/verify")
		if strings.HasPrefix(cleanText, "/start ") {
			isAuthCmd = true
		}

		if isAuthCmd {
			parts := strings.Fields(cleanText)
			if len(parts) >= 2 {
				code := strings.TrimSpace(parts[1])
				code = strings.TrimPrefix(code, "auth_")
				code = strings.TrimPrefix(code, "code_")
				valid, _ := a.store.VerifyTelegramPairingCode(code)
				if valid {
					_ = a.store.AuthorizeTelegramUser(gateway.TelegramAuthorizedUser{
						UserID:     senderID,
						Username:   userName,
						FirstName:  firstName,
						LastName:   lastName,
						AuthMethod: "otp",
						BotID:      runner.Config.ID,
						CreatedAt:  time.Now().Unix(),
					})
					_ = a.store.DeleteTelegramPendingRequest(senderID)

					displayName := firstName
					if displayName == "" {
						displayName = userName
					}
					welcome := fmt.Sprintf("🎉 *Pairing Successful!*\n\nWelcome, *%s*! Your Telegram account has been authorized for KendaliAI.\n\nYou can now send any message to chat with your agents, or use `/help` for commands.", escapeMarkdown(displayName))
					_, _ = a.sendTelegramMessage(runner.Bot, chatID, threadID, welcome, "Markdown")
					return
				} else {
					invalid := "❌ *Invalid or Expired Pairing Code*\n\nThe pairing code is invalid or has expired (codes expire after 10 minutes).\n\nPlease generate a new 6-digit code in the KendaliAI Web UI (**Channels** ➔ **Telegram** ➔ **Access Control**) and run:\n`/auth <6-digit-code>`"
					_, _ = a.sendTelegramMessage(runner.Bot, chatID, threadID, invalid, "Markdown")
					return
				}
			} else {
				needCode := "🔑 *Pairing Code Required*\n\nPlease run `/auth <code>` followed by the 6-digit pairing code generated from your KendaliAI Web UI.\n\n*Example:*\n`/auth 849201`\n\n*How to get your code:*\n1. Open KendaliAI Web UI (`http://localhost:5173`)\n2. Navigate to **Channels** ➔ **Telegram** ➔ **Access Control & Pairing (OTP)**\n3. Click **\"Generate New Code\"** and send the command here."
				_, _ = a.sendTelegramMessage(runner.Bot, chatID, threadID, needCode, "Markdown")
				return
			}
		}

		// Any other message: record pending request and send friendly authorization prompt
		_ = a.store.SaveTelegramPendingRequest(gateway.TelegramPendingRequest{
			UserID:      senderID,
			ChatID:      chatID,
			Username:    userName,
			FirstName:   firstName,
			LastName:    lastName,
			BotID:       runner.Config.ID,
			LastMessage: cleanText,
			CreatedAt:   time.Now().Unix(),
		})

		userTag := ""
		if userName != "" {
			userTag = fmt.Sprintf(" (@%s)", escapeMarkdown(userName))
		}
		denied := fmt.Sprintf("🔒 *KendaliAI Authorization Required*\n\nHi! Access to this bot is restricted to authorized users.\n\n👉 *Please run `/auth <code>` to authorize your account.*\n\n*How to get your pairing code:*\n1. Open your KendaliAI Web UI (`http://localhost:5173`)\n2. Navigate to **Channels** ➔ **Telegram** ➔ **Access Control & Pairing (OTP)**\n3. Click **\"Generate New Code\"**\n4. Copy and send the command here:\n   `/auth <6-digit-code>` (e.g. `/auth 849201`)\n\n📋 *Your Telegram Info:*\n• User ID: `%d`%s\n\n_Alternatively, your access request has been sent to the KendaliAI admin dashboard. You will be notified automatically once approved!_", senderID, userTag)
		_, _ = a.sendTelegramMessage(runner.Bot, chatID, threadID, denied, "Markdown")
		return
	}

	// If authorized and user sends /auth or /verify again
	if strings.HasPrefix(cleanText, "/auth") || strings.HasPrefix(cleanText, "/verify") {
		already := fmt.Sprintf("✅ *Already Authorized!*\n\nYour account (@%s, ID: `%d`) is already authorized to use KendaliAI. You can send any message to chat!", escapeMarkdown(userName), senderID)
		_, _ = a.sendTelegramMessage(runner.Bot, chatID, threadID, already, "Markdown")
		return
	}

	// Natural emoji reaction in Telegram chats (group chat or private)
	lowerMsg := strings.ToLower(cleanText)
	if strings.Contains(lowerMsg, "haha") || strings.Contains(lowerMsg, "wkwk") || strings.Contains(lowerMsg, "lol") || strings.Contains(lowerMsg, "lmao") || strings.Contains(lowerMsg, "rofl") || strings.Contains(lowerMsg, "hehe") || strings.Contains(lowerMsg, "xixi") || strings.Contains(lowerMsg, "lucu") || strings.Contains(lowerMsg, "joke") {
		go a.SetMessageReaction(runner.Bot, chatID, msg.MessageID, "🤣")
	} else if strings.Contains(lowerMsg, "mantap") || strings.Contains(lowerMsg, "keren") || strings.Contains(lowerMsg, "awesome") || strings.Contains(lowerMsg, "good job") || strings.Contains(lowerMsg, "congrats") || strings.Contains(lowerMsg, "sip") || strings.Contains(lowerMsg, "jos") || strings.Contains(lowerMsg, "top") || strings.Contains(lowerMsg, "oke") || strings.Contains(lowerMsg, "siap") {
		go a.SetMessageReaction(runner.Bot, chatID, msg.MessageID, "👍")
	} else if strings.Contains(lowerMsg, "deploy") || strings.Contains(lowerMsg, "launch") || strings.Contains(lowerMsg, "release") || strings.Contains(lowerMsg, "ship") || strings.Contains(lowerMsg, "gas") {
		go a.SetMessageReaction(runner.Bot, chatID, msg.MessageID, "🔥")
	} else if strings.Contains(lowerMsg, "fire") || strings.Contains(lowerMsg, "api") || strings.Contains(lowerMsg, "hot") || strings.Contains(lowerMsg, "semangat") || strings.Contains(lowerMsg, "gokil") {
		go a.SetMessageReaction(runner.Bot, chatID, msg.MessageID, "🔥")
	} else if strings.Contains(lowerMsg, "love") || strings.Contains(lowerMsg, "cinta") || strings.Contains(lowerMsg, "makasih") || strings.Contains(lowerMsg, "terima kasih") || strings.Contains(lowerMsg, "thanks") {
		go a.SetMessageReaction(runner.Bot, chatID, msg.MessageID, "❤️")
	} else if strings.Contains(lowerMsg, "bingung") || strings.Contains(lowerMsg, "hmmm") || strings.Contains(lowerMsg, "mikir") || strings.Contains(lowerMsg, "kenapa") {
		go a.SetMessageReaction(runner.Bot, chatID, msg.MessageID, "🤔")
	} else if strings.Contains(lowerMsg, "incident") || strings.Contains(lowerMsg, "outage") || strings.Contains(lowerMsg, "error 500") || strings.Contains(lowerMsg, "down") || strings.Contains(lowerMsg, "rusak") || strings.Contains(lowerMsg, "bug") {
		go a.SetMessageReaction(runner.Bot, chatID, msg.MessageID, "⚡")
	} else if strings.Contains(lowerMsg, "react") || strings.Contains(lowerMsg, "reaksi") || strings.Contains(lowerMsg, "emoji") || strings.Contains(lowerMsg, "tes emoji") || strings.Contains(lowerMsg, "test") {
		go a.SetMessageReaction(runner.Bot, chatID, msg.MessageID, "🫡")
	}

	// Unique chat key and default session ID per topic or private chat
	var chatKey string
	var defaultSessionID string
	if threadID != 0 {
		chatKey = fmt.Sprintf("%s:%d:%d", runner.Config.ID, chatID, threadID)
		defaultSessionID = fmt.Sprintf("tg-%s-%d-topic-%d", runner.Config.ID, chatID, threadID)
	} else {
		chatKey = fmt.Sprintf("%s:%d", runner.Config.ID, chatID)
		defaultSessionID = fmt.Sprintf("tg-%s-%d", runner.Config.ID, chatID)
	}

	// Stop Command Check (Intervention Mechanism for Multi-Agent Discussions)
	lowerClean := strings.ToLower(cleanText)
	isStopCmd := cleanText == "/stop" || cleanText == "/bubar" || cleanText == "/pause" || cleanText == "/cancel" ||
		lowerClean == "stop" || lowerClean == "berhenti" || lowerClean == "cukup" || lowerClean == "udah" ||
		lowerClean == "pause" || lowerClean == "bubar" || lowerClean == "cancel"

	if isStopCmd {
		a.mu.RLock()
		sessID, _ := a.activeChats[chatKey]
		a.mu.RUnlock()
		if sessID == "" {
			sessID = defaultSessionID
		}
		a.runtime.StopDiscussion(sessID)
		go a.SetMessageReaction(runner.Bot, chatID, msg.MessageID, "🫡")
		stopMsg := fmt.Sprintf("⏹️ <b>Diskusi multi-agent dihentikan oleh @%s</b>\nSemua agent telah dipause. Kirim pesan baru untuk memulai kembali.", userName)
		_, _ = a.sendTelegramMessage(runner.Bot, chatID, threadID, stopMsg, "HTML")
		log.Printf("⏹️ [Telegram] Discussion stopped via command %q by user @%s in session %s", cleanText, userName, sessID)
		return
	}

	// 2. Handle /new or /reset command
	if cleanText == "/new" || cleanText == "/newchat" || cleanText == "/reset" {
		var newSessionID string
		if threadID != 0 {
			newSessionID = fmt.Sprintf("tg-%s-%d-topic-%d-%d", runner.Config.ID, chatID, threadID, time.Now().Unix())
		} else {
			newSessionID = fmt.Sprintf("tg-%s-%d-%d", runner.Config.ID, chatID, time.Now().Unix())
		}

		targetAgent := runner.Config.AgentID
		if targetAgent == "" {
			if oldSess, _ := a.store.GetSession(defaultSessionID); oldSess != nil && oldSess.AgentID != "" {
				targetAgent = oldSess.AgentID
			}
		}

		meta := ChatTarget{
			BotID:           runner.Config.ID,
			ChatID:          chatID,
			MessageThreadID: threadID,
			BotName:         runner.Config.Name,
			UserName:        userName,
			GroupName:       msg.Chat.Title,
		}
		metaJSON, _ := json.Marshal(meta)

		var title string
		if msg.Chat.Title != "" {
			if threadID != 0 {
				title = fmt.Sprintf("Telegram: %s [Topic #%d]", msg.Chat.Title, threadID)
			} else {
				title = fmt.Sprintf("Telegram: %s", msg.Chat.Title)
			}
		} else {
			title = fmt.Sprintf("Telegram: %s (@%s)", runner.Config.Name, userName)
		}

		newSess := gateway.Session{
			ID:        newSessionID,
			AgentID:   targetAgent,
			Title:     title,
			Type:      sessType,
			ChannelID: "telegram",
			UserID:    userName,
			Status:    "active",
			Metadata:  string(metaJSON),
			CreatedAt: time.Now().Unix(),
			UpdatedAt: time.Now().Unix(),
		}
		_ = a.store.SaveSession(newSess)

		a.mu.Lock()
		a.activeChats[chatKey] = newSessionID
		a.sessionTarget[newSessionID] = &meta
		a.mu.Unlock()

		a.bus.Publish(messaging.Event{
			ID:        uuid.New().String(),
			Type:      messaging.EventSessionCreated,
			SessionID: newSessionID,
			AgentID:   targetAgent,
			Channel:   "telegram",
			Payload:   newSess,
			Timestamp: time.Now(),
		})

		_, _ = a.sendTelegramMessage(runner.Bot, chatID, threadID, "✨ *Started a new conversation session!*\nAll messages are synced live with your KendaliAI Web UI.", "Markdown")
		return
	}

	// 3. Handle /start command
	if cleanText == "/start" {
		welcome := fmt.Sprintf("👋 *Welcome to KendaliAI!*\n\n🤖 Bot: *%s*\n🎯 Assigned Agent: *%s*\n\n"+
			"• Send any message to chat with your agent.\n"+
			"• Use `/new` to start a fresh conversation session.\n"+
			"• Use `/agent <name>` to switch personas (`coding-agent`, `research-agent`, `personal-assistant`, `knowledge-agent`).\n\n"+
			"💡 *For Group Topics*: Add the bot to your group, disable Group Privacy in @BotFather (`/setprivacy` -> Disable) or make the bot an admin, and create topics like *Coding*, *Research*, etc.",
			runner.Config.Name, runner.Config.AgentID)
		_, _ = a.sendTelegramMessage(runner.Bot, chatID, threadID, welcome, "Markdown")
		return
	}

	// 4. Handle /agent or /switch command
	if strings.HasPrefix(cleanText, "/agent") || strings.HasPrefix(cleanText, "/switch") {
		parts := strings.Fields(cleanText)
		if len(parts) < 2 {
			agentsHelp := "🤖 *Available Agent Personas:*\n" +
				"• `/agent personal-assistant` — Daily coordinator & executive tasks\n" +
				"• `/agent coding-agent` — Senior engineer for architecture & coding\n" +
				"• `/agent research-agent` — In-depth investigation & web synthesis\n" +
				"• `/agent knowledge-agent` — Second brain, notes & concept retrieval\n\n" +
				"Example: `/agent coding-agent`"
			_, _ = a.sendTelegramMessage(runner.Bot, chatID, threadID, agentsHelp, "Markdown")
			return
		}

		targetAgent := strings.TrimSpace(parts[1])
		if targetAgent == "coder" || targetAgent == "coding" {
			targetAgent = "coding-agent"
		} else if targetAgent == "research" {
			targetAgent = "research-agent"
		} else if targetAgent == "knowledge" {
			targetAgent = "knowledge-agent"
		} else if targetAgent == "assistant" || targetAgent == "personal" {
			targetAgent = "personal-assistant"
		}

		a.mu.Lock()
		activeSessID, ok := a.activeChats[chatKey]
		if !ok {
			activeSessID = defaultSessionID
			a.activeChats[chatKey] = activeSessID
		}
		a.mu.Unlock()

		sess, _ := a.store.GetSession(activeSessID)
		if sess != nil {
			sess.AgentID = targetAgent
			_ = a.store.SaveSession(*sess)
		}

		confirm := fmt.Sprintf("✅ Switched agent persona for this thread to *%s*!", targetAgent)
		_, _ = a.sendTelegramMessage(runner.Bot, chatID, threadID, confirm, "Markdown")
		return
	}

	// 5. Shortcut agent prefixes
	explicitAgentOverride := false
	targetAgent := runner.Config.AgentID
	if strings.HasPrefix(cleanText, "/coding ") {
		targetAgent = "coding-agent"
		explicitAgentOverride = true
		cleanText = strings.TrimPrefix(cleanText, "/coding ")
	} else if strings.HasPrefix(cleanText, "/research ") {
		targetAgent = "research-agent"
		explicitAgentOverride = true
		cleanText = strings.TrimPrefix(cleanText, "/research ")
	} else if strings.HasPrefix(cleanText, "/knowledge ") {
		targetAgent = "knowledge-agent"
		explicitAgentOverride = true
		cleanText = strings.TrimPrefix(cleanText, "/knowledge ")
	}

	// 6. Resolve active session
	a.mu.Lock()
	sessionID, hasActive := a.activeChats[chatKey]
	if !hasActive {
		sessionID = defaultSessionID
		a.activeChats[chatKey] = sessionID
	}
	target := &ChatTarget{
		BotID:           runner.Config.ID,
		ChatID:          chatID,
		MessageThreadID: threadID,
		BotName:         runner.Config.Name,
		UserName:        userName,
		GroupName:       msg.Chat.Title,
	}
	a.sessionTarget[sessionID] = target
	a.lastMsgID[sessionID] = msg.MessageID
	a.mu.Unlock()

	// Ensure session in store
	sess, _ := a.store.GetSession(sessionID)
	metaJSON, _ := json.Marshal(target)
	if sess == nil {
		var title string
		if msg.Chat.Title != "" {
			if threadID != 0 {
				title = fmt.Sprintf("Telegram: %s [Topic #%d]", msg.Chat.Title, threadID)
			} else {
				title = fmt.Sprintf("Telegram: %s", msg.Chat.Title)
			}
		} else {
			title = fmt.Sprintf("Telegram: %s (@%s)", runner.Config.Name, userName)
		}

		newSess := gateway.Session{
			ID:        sessionID,
			AgentID:   targetAgent,
			Title:     title,
			Type:      sessType,
			ChannelID: "telegram",
			UserID:    userName,
			Status:    "active",
			Metadata:  string(metaJSON),
			CreatedAt: time.Now().Unix(),
			UpdatedAt: time.Now().Unix(),
		}
		_ = a.store.SaveSession(newSess)

		a.bus.Publish(messaging.Event{
			ID:        uuid.New().String(),
			Type:      messaging.EventSessionCreated,
			SessionID: sessionID,
			AgentID:   targetAgent,
			Channel:   "telegram",
			Payload:   newSess,
			Timestamp: time.Now(),
		})
	} else {
		sess.Type = sessType
		sess.ChannelID = "telegram"
		sess.Metadata = string(metaJSON)
		sess.UpdatedAt = time.Now().Unix()
		if explicitAgentOverride {
			sess.AgentID = targetAgent
		} else if runner.Config.AgentID != "" {
			// Always sync to the bot's configured Agent Person
			sess.AgentID = runner.Config.AgentID
			targetAgent = runner.Config.AgentID
		} else if sess.AgentID != "" {
			targetAgent = sess.AgentID
		}
		_ = a.store.SaveSession(*sess)
		targetAgent = sess.AgentID

		a.bus.Publish(messaging.Event{
			ID:        uuid.New().String(),
			Type:      messaging.EventSessionUpdated,
			SessionID: sessionID,
			AgentID:   targetAgent,
			Channel:   "telegram",
			Payload:   sess,
			Timestamp: time.Now(),
		})
	}

	// 7. Send initial status message into topic
	sentMsgID, _ := a.sendTelegramMessage(runner.Bot, chatID, threadID, "🤔 Thinking...", "")

	// 8. Subscribe to bus events for progress updates
	sub := a.bus.Subscribe(sessionID)
	defer a.bus.Unsubscribe(sub.ID)

	go func() {
		for ev := range sub.Ch {
			if sentMsgID == 0 {
				continue
			}
			switch ev.Type {
			case messaging.EventAgentToolCall:
				if payload, ok := ev.Payload.(messaging.ToolCallPayload); ok {
					_ = a.editTelegramMessage(runner.Bot, chatID, sentMsgID, fmt.Sprintf("⚙️ Running `%s`...", payload.Tool), "Markdown")
				}
			case messaging.EventAgentCompleted:
				if payload, ok := ev.Payload.(gateway.SessionMessage); ok {
					content := payload.Content
					formatted := FormatMarkdownForTelegram(content)
					if len(formatted) <= 4000 {
						if isGroupChat {
							_ = a.editTelegramMessageWithStopButton(runner.Bot, chatID, sentMsgID, formatted, "HTML", sessionID)
						} else {
							err := a.editTelegramMessage(runner.Bot, chatID, sentMsgID, formatted, "HTML")
							if err != nil {
								_, _ = a.sendTelegramMessage(runner.Bot, chatID, threadID, formatted, "HTML")
							}
						}
					} else {
						_ = a.deleteTelegramMessage(runner.Bot, chatID, sentMsgID)
						a.sendTelegramChunks(runner.Bot, chatID, threadID, content)
						if isGroupChat {
							_, _ = a.sendTelegramMessageWithStopButton(runner.Bot, chatID, threadID, "💬 <i>Diskusi sedang berlangsung. Klik di bawah untuk menghentikan:</i>", "HTML", sessionID)
						}
					}
				}
			case messaging.EventAgentFailed:
				errMsg := "❌ An error occurred while processing your request."
				if str, ok := ev.Payload.(string); ok {
					errMsg = fmt.Sprintf("❌ Error: %s", str)
				}
				_ = a.editTelegramMessage(runner.Bot, chatID, sentMsgID, errMsg, "")
			}
		}
	}()

	// 9. Execute turn (auto-fallback to default model if runner model is not configured)
	modelToUse := strings.TrimSpace(runner.Config.Model)
	if modelToUse == "" || strings.EqualFold(modelToUse, "default") {
		defaultMdl, _ := a.runtime.ResolveDefaultModel()
		modelToUse = defaultMdl
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()

	log.Printf("🤖 [Telegram Dispatch] Dispatching to Agent %q (Session: %s, Model: %s)", targetAgent, sessionID, modelToUse)
	_, err := a.runtime.ExecuteTurnWithModel(ctx, sessionID, targetAgent, cleanText, "telegram", modelToUse)
	if err != nil {
		log.Printf("❌ [Telegram Turn] Error executing turn: %v", err)
	} else {
		log.Printf("✅ [Telegram Turn] Successfully completed turn for session %s", sessionID)
	}
}
