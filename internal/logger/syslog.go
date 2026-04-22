package logger

import (
	"log"
	"os"
	"path/filepath"
)

var sysLogger *log.Logger

func InitLogger() {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		homeDir = "."
	}
	logPath := filepath.Join(homeDir, ".kendaliai", "system.log")

	f, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
	if err != nil {
		log.Println("Warning: Failed to open system.log")
		sysLogger = log.New(os.Stdout, "", log.LstdFlags)
		return
	}

	sysLogger = log.New(f, "", log.LstdFlags)
}

func Info(component, msg string) {
	if sysLogger == nil {
		InitLogger()
	}
	sysLogger.Printf("[%s] %s", component, msg)
}

func Warn(component, msg string) {
	if sysLogger == nil {
		InitLogger()
	}
	sysLogger.Printf("⚠️ [%s] %s", component, msg)
}

func Error(component, msg string) {
	if sysLogger == nil {
		InitLogger()
	}
	sysLogger.Printf("❌ [%s] %s", component, msg)
}
