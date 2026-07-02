package tools

import (
	"context"
	"fmt"
	"net/smtp"
	"os"
	"os/exec"
	"strings"
)

func (tr *ToolRegistry) EmailTools() map[string]ToolDef {
	return map[string]ToolDef{
		"email_send": {
			Name:        "email_send",
			Description: "Sends an email with optional HTML body.",
			Signature:   `{"to": "string", "subject": "string", "body": "string", "cc": "string"}`,
			Category:    "Email",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				to, _ := args["to"].(string)
				subject, _ := args["subject"].(string)
				body, _ := args["body"].(string)
				cc, _ := args["cc"].(string)

				if to == "" || subject == "" || body == "" {
					return "error: 'to', 'subject', and 'body' are required"
				}

				smtpHost := os.Getenv("SMTP_HOST")
				smtpPort := os.Getenv("SMTP_PORT")
				smtpUser := os.Getenv("SMTP_USER")
				smtpPass := os.Getenv("SMTP_PASS")
				smtpFrom := os.Getenv("SMTP_FROM")

				if smtpHost == "" {
					return "error: SMTP not configured (set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS)"
				}

				if smtpPort == "" {
					smtpPort = "587"
				}

				msg := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\n\r\n%s",
					smtpFrom, to, subject, body)

				addr := fmt.Sprintf("%s:%s", smtpHost, smtpPort)
				auth := smtp.PlainAuth("", smtpUser, smtpPass, smtpHost)

				var recipients []string
				recipients = append(recipients, to)
				if cc != "" {
					for _, c := range strings.Split(cc, ",") {
						recipients = append(recipients, strings.TrimSpace(c))
					}
				}

				if err := smtp.SendMail(addr, auth, smtpFrom, recipients, []byte(msg)); err != nil {
					return fmt.Sprintf("send error: %v", err)
				}

				return fmt.Sprintf(`{"status":"sent","to":"%s","subject":"%s"}`, to, subject)
			},
		},

		"email_draft": {
			Name:        "email_draft",
			Description: "Opens a mailto draft in the default mail client.",
			Signature:   `{"to": "string", "subject": "string", "body": "string"}`,
			Category:    "Email",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				to, _ := args["to"].(string)
				subject, _ := args["subject"].(string)
				body, _ := args["body"].(string)

				if to == "" {
					return "error: 'to' is required"
				}

				mailto := fmt.Sprintf("mailto:%s?subject=%s&body=%s",
					to,
					urlEncode(subject),
					urlEncode(body))

				cmd := exec.Command("open", mailto)
				if err := cmd.Run(); err != nil {
					return fmt.Sprintf("error opening mail: %v", err)
				}

				return fmt.Sprintf(`{"status":"draft_opened","to":"%s"}`, to)
			},
		},

		"email_reply": {
			Name:        "email_reply",
			Description: "Creates a reply draft in the default mail client.",
			Signature:   `{"original": "string", "body": "string"}`,
			Category:    "Email",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				original, _ := args["original"].(string)
				body, _ := args["body"].(string)

				subject := "Re:"
				if original != "" {
					subject = "Re: " + original
				}

				cmd := exec.Command("open", fmt.Sprintf("mailto:?subject=%s&body=%s",
					urlEncode(subject),
					urlEncode(body)))
				if err := cmd.Run(); err != nil {
					return fmt.Sprintf("error opening mail: %v", err)
				}

				return `{"status":"reply_draft_created"}`
			},
		},
	}
}

func urlEncode(s string) string {
	var buf strings.Builder
	for _, r := range s {
		if r == ' ' {
			buf.WriteString("%20")
		} else if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			buf.WriteRune(r)
		} else {
			buf.WriteString(fmt.Sprintf("%%%02X", r))
		}
	}
	return buf.String()
}
