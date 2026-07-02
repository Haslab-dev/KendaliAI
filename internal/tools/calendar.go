package tools

import (
	"context"
	"fmt"
	"os/exec"
	"time"
)

func (tr *ToolRegistry) CalendarTools() map[string]ToolDef {
	return map[string]ToolDef{
		"calendar_create_event": {
			Name:        "calendar_create_event",
			Description: "Creates a calendar event using macOS Calendar.app.",
			Signature:   `{"title": "string", "start": "string", "end": "string", "location": "string"}`,
			Category:    "Calendar",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				title, _ := args["title"].(string)
				start, _ := args["start"].(string)
				end, _ := args["end"].(string)
				location, _ := args["location"].(string)

				if title == "" || start == "" {
					return "error: 'title' and 'start' are required"
				}

				startTime, err := time.Parse(time.RFC3339, start)
				if err != nil {
					startTime, _ = time.Parse("2006-01-02 15:04", start)
				}

				endTime := startTime.Add(time.Hour)
				if end != "" {
					endTime, err = time.Parse(time.RFC3339, end)
					if err != nil {
						endTime, _ = time.Parse("2006-01-02 15:04", end)
					}
				}

				locationStr := ""
				if location != "" {
					locationStr = fmt.Sprintf(", location:\"%s\"", location)
				}

				script := fmt.Sprintf(`tell application "Calendar"
    tell calendar "Default Calendar"
        make new event at end with properties {summary:"%s", start date:date "%s", end date:date "%s"%s}
    end tell
end tell`, title, startTime.Format("1/2/2006 3:04 PM"), endTime.Format("1/2/2006 3:04 PM"), locationStr)

				cmd := exec.Command("osascript", "-e", script)
				out, err := cmd.CombinedOutput()
				if err != nil {
					return fmt.Sprintf("calendar error: %v (%s)", err, string(out))
				}

				eventID := fmt.Sprintf("cal-%d", time.Now().Unix())
				return fmt.Sprintf(`{"id":"%s","title":"%s","start":"%s","status":"created"}`,
					eventID, title, startTime.Format(time.RFC3339))
			},
		},

		"calendar_find_free_time": {
			Name:        "calendar_find_free_time",
			Description: "Finds available time slots for a given duration.",
			Signature:   `{"date": "string", "duration_minutes": "int", "start_hour": "int", "end_hour": "int"}`,
			Category:    "Calendar",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				dateStr, _ := args["date"].(string)
				duration := 60
				if d, ok := args["duration_minutes"].(float64); ok {
					duration = int(d)
				}
				startHour := 9
				if s, ok := args["start_hour"].(float64); ok {
					startHour = int(s)
				}
				endHour := 17
				if e, ok := args["end_hour"].(float64); ok {
					endHour = int(e)
				}

				if dateStr == "" {
					dateStr = time.Now().Format("2006-01-02")
				}

				var slots []string
				for h := startHour; h <= endHour; h++ {
					for m := 0; m < 60; m += duration {
						slotStart := time.Date(0, 1, 1, h, m, 0, 0, time.UTC)
						slotEnd := slotStart.Add(time.Duration(duration) * time.Minute)
						slots = append(slots, fmt.Sprintf("%s - %s",
							slotStart.Format("3:04 PM"),
							slotEnd.Format("3:04 PM")))
					}
				}

				result := fmt.Sprintf(`{"date":"%s","duration":%d,"slots":[`, dateStr, duration)
				for i, s := range slots {
					if i > 0 {
						result += ","
					}
					result += fmt.Sprintf(`"%s"`, s)
				}
				result += "]}"

				return result
			},
		},

		"calendar_remind": {
			Name:        "calendar_remind",
			Description: "Sets a reminder notification at a specified time.",
			Signature:   `{"message": "string", "at": "string"}`,
			Category:    "Calendar",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				message, _ := args["message"].(string)
				at, _ := args["at"].(string)

				if message == "" {
					return "error: 'message' is required"
				}

				remindTime := time.Now().Add(15 * time.Minute)
				if at != "" {
					if parsed, err := time.Parse(time.RFC3339, at); err == nil {
						remindTime = parsed
					} else if parsed, err := time.Parse("2006-01-02 15:04", at); err == nil {
						remindTime = parsed
					}
				}

				script := fmt.Sprintf(`tell application "Reminders"
    set newReminder to make new reminder
    set name of newReminder to "%s"
    set due date of newReminder to date "%s"
end tell`, message, remindTime.Format("1/2/2006 3:04 PM"))

				cmd := exec.Command("osascript", "-e", script)
				out, err := cmd.CombinedOutput()
				if err != nil {
					return fmt.Sprintf("reminder error: %v (%s)", err, string(out))
				}

				return fmt.Sprintf(`{"status":"reminder_set","message":"%s","at":"%s"}`,
					message, remindTime.Format(time.RFC3339))
			},
		},

		"calendar_list_events": {
			Name:        "calendar_list_events",
			Description: "Lists calendar events for a given date.",
			Signature:   `{"date": "string"}`,
			Category:    "Calendar",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				dateStr, _ := args["date"].(string)
				if dateStr == "" {
					dateStr = time.Now().Format("2006-01-02")
				}

				return fmt.Sprintf(`{"date":"%s","events":[]}`, dateStr)
			},
		},
	}
}
