package gateways

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/kendaliai/app/internal/config"
	"github.com/kendaliai/app/internal/security"
)

func HandleOnboard(db *sql.DB) {
	c := config.Cfg
	p := c.DefaultChatProvider()
	fmt.Print("🚀 KendaliAI Onboarding\n\n")

	if p == nil || p.APIKey == "" {
		fmt.Println("❌ Error: chatProvider.apiKey is required in config.json")
		return
	}

	encryptedKey, err := security.Encrypt(p.APIKey)
	if err != nil {
		fmt.Printf("❌ Failed to encrypt API Key: %v\n", err)
		return
	}

	fmt.Printf("🔧 Creating gateway with provider: %s, model: %s\n", p.Type, p.Model)

	now := time.Now().UnixMilli()

	var existingId string
	err = db.QueryRow("SELECT id FROM gateways WHERE name = 'default'").Scan(&existingId)
	if err == nil && existingId != "" {
		_, err := db.Exec(`
			UPDATE gateways SET
				provider = ?, default_model = ?, updated_at = ?, api_key_encrypted = ?
			WHERE id = ?`, p.Type, p.Model, now, encryptedKey, existingId)
		if err != nil {
			fmt.Printf("❌ Failed to update gateway: %v\n", err)
			return
		}
		fmt.Println("✅ Gateway updated!")
	} else {
		gatewayId := "gw_" + uuid.New().String()[:8]
		_, err = db.Exec(`
			INSERT INTO gateways (
				id, name, provider, default_model, api_key_encrypted,
				require_pairing, allow_public_bind, workspace_only, status,
				created_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			gatewayId, "default", p.Type, p.Model, encryptedKey,
			1, 0, 1, "stopped", now, now)
		if err != nil {
			fmt.Printf("❌ Failed to create gateway: %v\n", err)
			return
		}
		fmt.Println("✅ Gateway created!")
	}

	if len(c.Channels) > 0 {
		for _, ch := range c.Channels {
			bindChannel(db, ch)
		}
	} else {
		fmt.Print("\nℹ️  No channels configured. You can still use TUI mode.\n")
		fmt.Print("   To enable Telegram, add to config.json:\n\n")
		fmt.Print(`   "channels": [
     {
       "id": "telegram-main",
       "channelName": "My Bot",
       "channelType": "telegram",
       "token": "your-bot-token"
     }
   ]
`)
		fmt.Print("\n   Then run: make dev-onboard\n")
	}
}

func bindChannel(db *sql.DB, ch config.ChannelConfig) {
	configJson := fmt.Sprintf(`{"botToken": "%s"}`, ch.Token)
	name := ch.ChannelName
	if name == "" {
		name = ch.ChannelType + "_bot"
	}

	var existingId string
	_ = db.QueryRow("SELECT id FROM channels WHERE id = ?", ch.ID).Scan(&existingId)

	if existingId != "" {
		_, err := db.Exec(`UPDATE channels SET name = ?, type = ?, config = ?, enabled = 1, status = 'stopped', updated_at = ? WHERE id = ?`,
			name, ch.ChannelType, configJson, time.Now().UnixMilli(), existingId)
		if err != nil {
			fmt.Printf("❌ Failed to update channel '%s': %v\n", ch.ID, err)
			return
		}
		fmt.Printf("✅ Channel '%s' (%s) updated!\n", ch.ID, ch.ChannelName)
	} else {
		_, err := db.Exec(`
			INSERT INTO channels (id, type, name, config, enabled, status, created_at, updated_at)
			VALUES (?, ?, ?, ?, 1, 'stopped', ?, ?)`,
			ch.ID, ch.ChannelType, name, configJson,
			time.Now().UnixMilli(), time.Now().UnixMilli())
		if err != nil {
			fmt.Printf("❌ Failed to bind channel '%s': %v\n", ch.ID, err)
			return
		}
		fmt.Printf("✅ Channel '%s' (%s / %s) bound!\n", ch.ID, ch.ChannelName, ch.ChannelType)
	}
}

func HandleStatus(db *sql.DB) {
	rows, err := db.Query("SELECT name, provider, status FROM gateways")
	if err != nil {
		fmt.Printf("Error fetching statuses: %v\n", err)
		return
	}
	defer rows.Close()

	fmt.Println("System Status:")
	for rows.Next() {
		var name, provider, status string
		if err := rows.Scan(&name, &provider, &status); err != nil {
			fmt.Printf("Error scanning row: %v\n", err)
			continue
		}
		fmt.Printf("- Gateway '%s' (Provider: %s) -> Status: %s\n", name, provider, status)
	}
}
