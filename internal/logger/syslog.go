package logger

import (
	"log"
)

// Info logs an informational message through the standard log package.
// When the gateway runs, log output is directed to both stdout and the log file
// via the MultiWriter configured in start.go.
func Info(component, msg string) {
	log.Printf("[%s] %s", component, msg)
}

func Warn(component, msg string) {
	log.Printf("⚠️ [%s] %s", component, msg)
}

func Error(component, msg string) {
	log.Printf("❌ [%s] %s", component, msg)
}
