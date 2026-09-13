package server

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"

	"github.com/creack/pty"
	"github.com/gorilla/websocket"
)

type TerminalResizeMsg struct {
	Type string `json:"type"` // "resize"
	Cols uint16 `json:"cols"`
	Rows uint16 `json:"rows"`
}

// handleTerminalWS spawns a true pseudo-terminal (PTY) shell process and bridges it with a WebSocket.
func (s *Server) handleTerminalWS() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		conn, err := s.upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Printf("❌ Terminal WebSocket upgrade error: %v", err)
			return
		}
		defer conn.Close()

		// Resolve working directory
		home, _ := os.UserHomeDir()
		reqCwd := r.URL.Query().Get("cwd")
		targetCwd := home
		if reqCwd != "" && reqCwd != "~" {
			if strings.HasPrefix(reqCwd, "~/") {
				targetCwd = filepath.Join(home, strings.TrimPrefix(reqCwd, "~/"))
			} else if filepath.IsAbs(reqCwd) {
				targetCwd = reqCwd
			}
		}
		targetCwd = filepath.Clean(targetCwd)
		if info, err := os.Stat(targetCwd); err != nil || !info.IsDir() {
			targetCwd = home
		}

		// Initial window size
		rows := uint16(24)
		cols := uint16(80)
		if rRows, err := strconv.Atoi(r.URL.Query().Get("rows")); err == nil && rRows > 0 && rRows < 500 {
			rows = uint16(rRows)
		}
		if rCols, err := strconv.Atoi(r.URL.Query().Get("cols")); err == nil && rCols > 0 && rCols < 1000 {
			cols = uint16(rCols)
		}

		// Resolve shell executable: prefer $SHELL, then /bin/zsh, then /bin/bash, then /bin/sh
		shellPath := os.Getenv("SHELL")
		if shellPath == "" {
			if _, err := os.Stat("/bin/zsh"); err == nil {
				shellPath = "/bin/zsh"
			} else if _, err := os.Stat("/bin/bash"); err == nil {
				shellPath = "/bin/bash"
			} else {
				shellPath = "/bin/sh"
			}
		}

		cmd := exec.Command(shellPath, "-l")
		cmd.Dir = targetCwd
		cmd.Env = append(os.Environ(),
			"TERM=xterm-256color",
			"COLORTERM=truecolor",
			"LANG=en_US.UTF-8",
			"LC_ALL=en_US.UTF-8",
		)

		ptmx, err := pty.StartWithSize(cmd, &pty.Winsize{Rows: rows, Cols: cols})
		if err != nil {
			log.Printf("❌ Failed to start PTY session: %v", err)
			_ = conn.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf("\r\n\x1b[31mFailed to start terminal shell: %v\x1b[0m\r\n", err)))
			return
		}
		defer func() {
			_ = ptmx.Close()
			if cmd.Process != nil {
				_ = cmd.Process.Kill()
				_, _ = cmd.Process.Wait()
			}
		}()

		var writeMu sync.Mutex
		safeWriteWS := func(messageType int, data []byte) error {
			writeMu.Lock()
			defer writeMu.Unlock()
			return conn.WriteMessage(messageType, data)
		}

		// PTY Output -> WebSocket
		go func() {
			buf := make([]byte, 4096)
			for {
				n, err := ptmx.Read(buf)
				if n > 0 {
					if err := safeWriteWS(websocket.BinaryMessage, buf[:n]); err != nil {
						return
					}
				}
				if err != nil {
					if err != io.EOF {
						log.Printf("PTY read error: %v", err)
					}
					_ = safeWriteWS(websocket.TextMessage, []byte("\r\n\x1b[33m[Process exited]\x1b[0m\r\n"))
					_ = conn.Close()
					return
				}
			}
		}()

		// WebSocket -> PTY Input
		for {
			msgType, payload, err := conn.ReadMessage()
			if err != nil {
				break
			}

			// Handle JSON resize messages
			if msgType == websocket.TextMessage && len(payload) > 0 && payload[0] == '{' {
				var ctrl TerminalResizeMsg
				if err := json.Unmarshal(payload, &ctrl); err == nil && ctrl.Type == "resize" {
					if ctrl.Cols > 0 && ctrl.Rows > 0 {
						_ = pty.Setsize(ptmx, &pty.Winsize{
							Rows: ctrl.Rows,
							Cols: ctrl.Cols,
						})
					}
					continue
				}
			}

			// Raw terminal input bytes (keys, arrows, control characters) -> PTY
			if len(payload) > 0 {
				if _, err := ptmx.Write(payload); err != nil {
					break
				}
			}
		}
	}
}
