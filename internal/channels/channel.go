package channels

import (
	"context"
	"fmt"
)

type GatewayChannel interface {
	Receive(ctx context.Context) (string, error)
	Reply(ctx context.Context, text string) error
	Edit(ctx context.Context, messageID string, text string) error
	Typing(ctx context.Context) error
	RequestApproval(ctx context.Context, details string) (bool, error)
}

type TelegramChannelAdapter struct {
	token  string
	chatID string
}

func NewTelegramChannelAdapter(token, chatID string) *TelegramChannelAdapter {
	return &TelegramChannelAdapter{
		token:  token,
		chatID: chatID,
	}
}

func (tc *TelegramChannelAdapter) Receive(ctx context.Context) (string, error) {
	return "Simulated user message from Telegram", nil
}

func (tc *TelegramChannelAdapter) Reply(ctx context.Context, text string) error {
	fmt.Printf("[Telegram Adapter] Sending reply: %s\n", text)
	return nil
}

func (tc *TelegramChannelAdapter) Edit(ctx context.Context, messageID string, text string) error {
	fmt.Printf("[Telegram Adapter] Editing message ID %s: %s\n", messageID, text)
	return nil
}

func (tc *TelegramChannelAdapter) Typing(ctx context.Context) error {
	fmt.Println("[Telegram Adapter] User indicator: typing...")
	return nil
}

func (tc *TelegramChannelAdapter) RequestApproval(ctx context.Context, details string) (bool, error) {
	fmt.Printf("[Telegram Adapter] User Approval Prompt: %s\n", details)
	return true, nil
}
