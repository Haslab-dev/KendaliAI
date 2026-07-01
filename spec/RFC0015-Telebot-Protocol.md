# RFC-0015: Telebot Protocol

**Status:** Draft
**Version:** 0.3.4

## Problem

Telegram currently directly calls cognition. This means:
- No real-time progress updates
- No structured responses
- No way to interrupt or modify plans
- Poor UX for long-running tasks

## Solution

Implement a proper protocol:

```
Telegram
    │
    ▼
Gateway Service
    │
    ▼
Session API
    │
    ▼
Planner
    │
    ▼
Queue
    │
    ▼
Executor
    │
    ▼
Event Bus
    │
    ▼
Telegram Update
```

## Protocol Flow

**User:** "Halo, buat Landing Page."

**Bot Response:**
```
✅ Session created: sess_abc123
🎯 Goal: Create landing page

Planning...
```

**After planning:**
```
📋 Plan ready (8 tasks)

1. 📁 Analyze repository
2. 📖 Read design specs
3. 🎨 Generate components
4. 🔧 Setup routing
5. 📦 Install dependencies
6. 🏗️ Run build
7. ✅ Run tests
8. 📝 Commit

⏳ Starting execution...
```

**During execution:**
```
📊 Progress: 3/8 tasks

✓ Task 1: Repository analyzed (12 files)
✓ Task 2: Design specs loaded
✓ Task 3: Components generated (5 files)
⏳ Task 4: Setting up routing...
```

**On failure:**
```
⚠️ Task 4 failed: Build error

Error: Cannot find module 'react-router'

Retrying (attempt 2/3)...
```

**On completion:**
```
✅ Completed!

📊 Summary:
• 18 files changed
• 4 new files
• 1 deleted
• 0 build errors

🔗 Preview: http://localhost:3000

📦 Artifacts:
• [Code] LandingPage.tsx
• [Report] build-report.md
• [Patch] landing-page.patch

Commit: c42ab12
Branch: task_landing_page
```

## Message Types

| Type | Format | Description |
|------|--------|-------------|
| `session_created` | Card | Session info with ID |
| `plan_preview` | List | Task list with estimates |
| `progress` | Inline keyboard | Current progress |
| `task_update` | Message edit | Task status change |
| `error` | Alert | Failure notification |
| `retry` | Status | Retry attempt |
| `completion` | Summary card | Final report |
| `artifact_list` | File cards | Generated artifacts |

## Inline Keyboard

```json
{
  "inline_keyboard": [
    [
      { "text": "⏸ Pause", "callback_data": "pause_sess_abc123" },
      { "text": "⏹ Cancel", "callback_data": "cancel_sess_abc123" }
    ],
    [
      { "text": "📎 View Artifacts", "callback_data": "artifacts_sess_abc123" },
      { "text": "📋 View Plan", "callback_data": "plan_sess_abc123" }
    ]
  ]
}
```
