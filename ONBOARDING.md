# KendaliAI: Quickstart & Gateway Onboarding Guide

Follow this guide to set up the KendaliAI microkernel and connect communication channels from scratch.

---

## 1. Prerequisites
Ensure you have the following installed on your machine:
- **Go** (version 1.20+)
- **SQLite3**
- **Docker** (optional, required if you deploy with Sandbox isolation)

---

## 2. Configuration Setup (`config.json`)

KendaliAI reads its profile settings from a local configuration file. 
Create a file named `config.json` in the root folder (or default to `~/.kendaliai/config.json` path):

```json
{
  "database": {
    "path": "./build/kendaliai.db"
  },
  "defaultProvider": "deepseek",
  "chatProviders": [
    {
      "type": "deepseek",
      "apiKey": "your-deepseek-api-key-here",
      "endpoint": "https://api.deepseek.com/v1",
      "model": "deepseek-chat"
    },
    {
      "type": "openai",
      "apiKey": "your-openai-api-key-here",
      "endpoint": "https://api.openai.com/v1",
      "model": "gpt-4o"
    }
  ],
  "embedding": {
    "apiKey": "your-openai-api-key-here",
    "endpoint": "https://api.openai.com/v1",
    "model": "text-embedding-3-small"
  },
  "channels": [
    {
      "id": "telegram-main",
      "channelName": "telegram",
      "channelType": "telegram",
      "token": "your-telegram-bot-token-here"
    }
  ]
}
```

---

## 3. Setting Up Telegram Gateway Bot (From 0)

1. **Create the Telegram Bot**:
   - Open Telegram and search for [@BotFather](https://t.me/BotFather).
   - Send the command `/newbot`.
   - Choose a name and a username for your bot.
   - Copy the generated **HTTP API Token** (this maps to `"token"` in `config.json`).

2. **Retrieve your Chat ID**:
   - Start a conversation with your newly created bot and send a message.
   - Run the following curl request in your terminal to fetch the incoming message log:
     ```bash
     curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates"
     ```
   - Locate the `"chat"` block in the JSON response and copy the `"id"` number. This Chat ID restricts access to authorized owners.

---

## 4. Building & Running the Daemon

To build the microkernel binary and start the daemon process:

```bash
# 1. Create build output directory
mkdir -p build

# 2. Run the integration test suite to verify services
go run ./tests/test_mak_run.go

# 3. Compile the main application binary
go build -o build/kendaliai ./cmd/kendaliai/main.go

# 4. Start the daemon listener
./build/kendaliai --config ./config.json
```

---

## 5. Verifying Operations

Once running, the microkernel starts:
- The **Supervisor** monitoring process loops.
- The **Gateway Channels** polling for incoming Telegram prompts.
- The **Resource Manager** watching token quotas.

Interact with your Telegram bot. Sending `/goal Create an auth middleware` will trigger intent resolution, planner task decomposition, sandbox workspace provisioning, and execution.
