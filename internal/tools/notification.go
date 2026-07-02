package tools

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"time"
)

func (tr *ToolRegistry) NotificationTools() map[string]ToolDef {
	return map[string]ToolDef{
		"notify": {
			Name:        "notify",
			Description: "Sends notifications via multiple channels (telegram, discord, slack, email, webhook, system).",
			Signature:   `{"channel": "string", "message": "string", "title": "string", "priority": "string"}`,
			Category:    "Notification",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				channel, _ := args["channel"].(string)
				message, _ := args["message"].(string)
				title, _ := args["title"].(string)
				priority, _ := args["priority"].(string)

				if channel == "" || message == "" {
					return "error: 'channel' and 'message' are required"
				}

				if title == "" {
					title = "KendaliAI"
				}

				var err error
				switch strings.ToLower(channel) {
				case "telegram":
					_, err = sendTelegram(title, message)
				case "discord":
					_, err = sendDiscord(message, title)
				case "slack":
					_, err = sendSlack(message)
				case "email":
					_, err = sendEmail(title, message)
				case "webhook":
					_, err = sendWebhook(message)
				case "system":
					_, err = sendSystemNotification(title, message)
				default:
					return fmt.Sprintf("unknown channel: %s. Supported: telegram, discord, slack, email, webhook, system", channel)
				}

				if err != nil {
					return fmt.Sprintf("notification failed: %v", err)
				}

				notifID := fmt.Sprintf("notif-%d", time.Now().Unix())
				return fmt.Sprintf(`{"id":"%s","channel":"%s","status":"sent","priority":"%s"}`,
					notifID, channel, priority)
			},
		},

		"notify_telegram": {
			Name:        "notify_telegram",
			Description: "Sends a Telegram message. Requires TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID env vars.",
			Signature:   `{"message": "string", "title": "string"}`,
			Category:    "Notification",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				message, _ := args["message"].(string)
				title, _ := args["title"].(string)
				if message == "" {
					return "error: 'message' is required"
				}
				if title == "" {
					title = "KendaliAI"
				}
				result, err := sendTelegram(title, message)
				if err != nil {
					return fmt.Sprintf("telegram error: %v", err)
				}
				return result
			},
		},

		"notify_discord": {
			Name:        "notify_discord",
			Description: "Sends a Discord webhook message. Requires DISCORD_WEBHOOK_URL env var.",
			Signature:   `{"message": "string", "username": "string"}`,
			Category:    "Notification",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				message, _ := args["message"].(string)
				username, _ := args["username"].(string)
				if message == "" {
					return "error: 'message' is required"
				}
				if username == "" {
					username = "KendaliAI"
				}
				result, err := sendDiscord(message, username)
				if err != nil {
					return fmt.Sprintf("discord error: %v", err)
				}
				return result
			},
		},

		"notify_slack": {
			Name:        "notify_slack",
			Description: "Sends a Slack message. Requires SLACK_WEBHOOK_URL env var.",
			Signature:   `{"message": "string"}`,
			Category:    "Notification",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				message, _ := args["message"].(string)
				if message == "" {
					return "error: 'message' is required"
				}
				result, err := sendSlack(message)
				if err != nil {
					return fmt.Sprintf("slack error: %v", err)
				}
				return result
			},
		},

		"notify_email": {
			Name:        "notify_email",
			Description: "Sends an email. Requires SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS env vars.",
			Signature:   `{"to": "string", "subject": "string", "body": "string", "cc": "string"}`,
			Category:    "Notification",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				to, _ := args["to"].(string)
				subject, _ := args["subject"].(string)
				body, _ := args["body"].(string)
				cc, _ := args["cc"].(string)

				if to == "" || subject == "" || body == "" {
					return "error: 'to', 'subject', and 'body' are required"
				}

				result, err := sendEmailWithCC(to, subject, body, cc)
				if err != nil {
					return fmt.Sprintf("email error: %v", err)
				}
				return result
			},
		},

		"notify_webhook": {
			Name:        "notify_webhook",
			Description: "Sends a generic webhook POST request.",
			Signature:   `{"url": "string", "method": "string", "body": "object"}`,
			Category:    "Notification",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				webhookURL, _ := args["url"].(string)
				method, _ := args["method"].(string)
				body, _ := args["body"].(map[string]interface{})

				if webhookURL == "" {
					return "error: 'url' is required"
				}

				if method == "" {
					method = "POST"
				}

				payload, _ := json.Marshal(body)
				req, _ := http.NewRequestWithContext(ctx, method, webhookURL, bytes.NewBuffer(payload))
				req.Header.Set("Content-Type", "application/json")

				resp, err := http.DefaultClient.Do(req)
				if err != nil {
					return fmt.Sprintf("webhook error: %v", err)
				}
				defer resp.Body.Close()

				return fmt.Sprintf(`{"status":%d,"url":"%s"}`, resp.StatusCode, webhookURL)
			},
		},
	}
}

func sendTelegram(title, message string) (string, error) {
	botToken := os.Getenv("TELEGRAM_BOT_TOKEN")
	chatID := os.Getenv("TELEGRAM_CHAT_ID")

	if botToken == "" || chatID == "" {
		return "", fmt.Errorf("TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured")
	}

	text := fmt.Sprintf("*%s*\n%s", title, message)
	payload := map[string]string{
		"chat_id":    chatID,
		"text":       text,
		"parse_mode": "Markdown",
	}

	body, _ := json.Marshal(payload)
	req, _ := http.NewRequest("POST", fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", botToken), bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return "", fmt.Errorf("telegram API returned %d", resp.StatusCode)
	}

	return `{"status":"sent","channel":"telegram"}`, nil
}

func sendDiscord(message, username string) (string, error) {
	webhookURL := os.Getenv("DISCORD_WEBHOOK_URL")
	if webhookURL == "" {
		return "", fmt.Errorf("DISCORD_WEBHOOK_URL not configured")
	}

	payload := map[string]string{
		"username": username,
		"content":  message,
	}

	body, _ := json.Marshal(payload)
	req, _ := http.NewRequest("POST", webhookURL, bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 204 && resp.StatusCode != 200 {
		return "", fmt.Errorf("discord API returned %d", resp.StatusCode)
	}

	return `{"status":"sent","channel":"discord"}`, nil
}

func sendSlack(message string) (string, error) {
	webhookURL := os.Getenv("SLACK_WEBHOOK_URL")
	if webhookURL == "" {
		return "", fmt.Errorf("SLACK_WEBHOOK_URL not configured")
	}

	payload := map[string]string{"text": message}
	body, _ := json.Marshal(payload)
	req, _ := http.NewRequest("POST", webhookURL, bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return "", fmt.Errorf("slack API returned %d", resp.StatusCode)
	}

	return `{"status":"sent","channel":"slack"}`, nil
}

func sendWebhook(message string) (string, error) {
	webhookURL := os.Getenv("WEBHOOK_URL")
	if webhookURL == "" {
		return "", fmt.Errorf("WEBHOOK_URL not configured")
	}

	payload := map[string]interface{}{
		"message":   message,
		"timestamp": time.Now().Format(time.RFC3339),
		"source":    "kendaliai",
	}

	body, _ := json.Marshal(payload)
	req, _ := http.NewRequest("POST", webhookURL, bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	return fmt.Sprintf(`{"status":%d,"channel":"webhook"}`, resp.StatusCode), nil
}

func sendEmail(subject, body string) (string, error) {
	return sendEmailWithCC("", subject, body, "")
}

func sendEmailWithCC(to, subject, body, cc string) (string, error) {
	smtpHost := os.Getenv("SMTP_HOST")
	smtpPort := os.Getenv("SMTP_PORT")
	smtpUser := os.Getenv("SMTP_USER")
	smtpPass := os.Getenv("SMTP_PASS")
	smtpFrom := os.Getenv("SMTP_FROM")

	if smtpHost == "" {
		return "", fmt.Errorf("SMTP not configured (set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS)")
	}

	if to == "" {
		to = os.Getenv("EMAIL_TO")
	}

	if to == "" {
		return "", fmt.Errorf("recipient 'to' is required")
	}

	if smtpPort == "" {
		smtpPort = "587"
	}

	msg := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\n\r\n%s",
		smtpFrom, to, subject, body)

	auth := exec.Command("sendmail", "-t", "-oi")
	auth.Stdin = strings.NewReader(msg)
	auth.Env = append(os.Environ(),
		fmt.Sprintf("SMTP_USER=%s", smtpUser),
		fmt.Sprintf("SMTP_PASS=%s", smtpPass))
	out, err := auth.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("sendmail error: %v (%s)", err, string(out))
	}

	return fmt.Sprintf(`{"status":"sent","channel":"email","to":"%s"}`, to), nil
}

func sendSystemNotification(title, message string) (string, error) {
	cmd := exec.Command("osascript", "-e", fmt.Sprintf(`display notification "%s" with title "%s"`, message, title))
	out, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("osascript failed: %v (%s)", err, string(out))
	}
	return `{"status":"sent","channel":"system"}`, nil
}
