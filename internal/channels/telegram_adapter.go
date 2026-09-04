package channels

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
	"github.com/google/uuid"
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

type RawTelegramUpdate struct {
	UpdateID int                 `json:"update_id"`
	Message  *RawTelegramMessage `json:"message,omitempty"`
}

type TelegramAdapter struct {
	mu            sync.RWMutex
	runners       map[string]*BotRunner
	store         *gateway.Store
	runtime       *gateway.Runtime
	bus           *messaging.EventBus
	activeChats   map[string]string      // key: "botID:chatID" or "botID:chatID:threadID" -> sessionID
	sessionTarget map[string]*ChatTarget // key: sessionID -> ChatTarget
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
		// Only sync to Telegram if the event was NOT originated by Telegram itself!
		if ev.Channel == "telegram" {
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
			// If a user sent a message from Web in this session, mirror it to Telegram
			if msgPayload, ok := ev.Payload.(gateway.SessionMessage); ok && msgPayload.Role == "user" {
				notice := fmt.Sprintf("💻 *[Web User]:*\n%s", msgPayload.Content)
				_, _ = a.sendTelegramMessage(runner.Bot, target.ChatID, target.MessageThreadID, notice, "Markdown")
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
		}
	}
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
			return 0, err
		}
	}

	var sent struct {
		MessageID int `json:"message_id"`
	}
	_ = json.Unmarshal(resp.Result, &sent)
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

func (a *TelegramAdapter) sendTelegramChunks(bot *tgbotapi.BotAPI, chatID int64, threadID int, text string) {
	const maxLen = 4000
	for len(text) > 0 {
		if len(text) <= maxLen {
			_, _ = a.sendTelegramMessage(bot, chatID, threadID, text, "")
			break
		}
		chunk := text[:maxLen]
		lastIdx := strings.LastIndexAny(chunk, "\n ")
		if lastIdx > 2000 {
			chunk = text[:lastIdx]
			text = text[lastIdx+1:]
		} else {
			text = text[maxLen:]
		}
		_, _ = a.sendTelegramMessage(bot, chatID, threadID, chunk, "")
	}
}

func pickDefaultAgentForTopic(topicName string, fallback string) string {
	lower := strings.ToLower(topicName)
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

		for _, update := range rawUpdates {
			if update.UpdateID >= offset {
				offset = update.UpdateID + 1
			}
			if update.Message != nil {
				go a.handleRawTelegramMessage(runner, update.Message)
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

	// 2. Handle /new or /reset command
	if cleanText == "/new" || cleanText == "/newchat" || cleanText == "/reset" {
		var newSessionID string
		if threadID != 0 {
			newSessionID = fmt.Sprintf("tg-%s-%d-topic-%d-%d", runner.Config.ID, chatID, threadID, time.Now().Unix())
		} else {
			newSessionID = fmt.Sprintf("tg-%s-%d-%d", runner.Config.ID, chatID, time.Now().Unix())
		}

		targetAgent := runner.Config.AgentID
		if oldSess, _ := a.store.GetSession(defaultSessionID); oldSess != nil && oldSess.AgentID != "" {
			targetAgent = oldSess.AgentID
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
	targetAgent := runner.Config.AgentID
	if strings.HasPrefix(cleanText, "/coding ") {
		targetAgent = "coding-agent"
		cleanText = strings.TrimPrefix(cleanText, "/coding ")
	} else if strings.HasPrefix(cleanText, "/research ") {
		targetAgent = "research-agent"
		cleanText = strings.TrimPrefix(cleanText, "/research ")
	} else if strings.HasPrefix(cleanText, "/knowledge ") {
		targetAgent = "knowledge-agent"
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
		sess.ChannelID = "telegram"
		sess.Metadata = string(metaJSON)
		if targetAgent != runner.Config.AgentID && sess.AgentID != targetAgent {
			sess.AgentID = targetAgent
		}
		_ = a.store.SaveSession(*sess)
		targetAgent = sess.AgentID
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
					if len(content) <= 4000 {
						err := a.editTelegramMessage(runner.Bot, chatID, sentMsgID, content, "")
						if err != nil {
							_, _ = a.sendTelegramMessage(runner.Bot, chatID, threadID, content, "")
						}
					} else {
						_ = a.deleteTelegramMessage(runner.Bot, chatID, sentMsgID)
						a.sendTelegramChunks(runner.Bot, chatID, threadID, content)
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

	// 9. Execute turn
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()

	_, err := a.runtime.ExecuteTurnWithModel(ctx, sessionID, targetAgent, cleanText, "telegram", runner.Config.Model)
	if err != nil {
		log.Printf("❌ Telegram turn error: %v", err)
	}
}
