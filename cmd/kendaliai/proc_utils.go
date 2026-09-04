package main

import (
	"fmt"
	"net"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"syscall"
	"time"
)

// stopAndClearPort checks if any process is listening on the specified port
// or recorded in pidFile. It terminates the process (SIGTERM then SIGKILL),
// removes the PID file, and waits until the port is confirmed free.
// Returns true if an existing process was stopped, false if already free.
func stopAndClearPort(port string, pidFile string) bool {
	stoppedAny := false
	myPid := os.Getpid()

	// 1. Check PID file
	if pidData, err := os.ReadFile(pidFile); err == nil {
		var pid int
		if _, err := fmt.Sscanf(string(pidData), "%d", &pid); err == nil && pid > 0 && pid != myPid {
			if isProcessAlive(pid) {
				terminateProcess(pid)
				stoppedAny = true
			}
		}
		_ = os.Remove(pidFile)
	}

	// 2. Check if port is in use using lsof
	pids := findPIDsOnPort(port)
	for _, pid := range pids {
		if pid > 0 && pid != myPid {
			if isProcessAlive(pid) {
				terminateProcess(pid)
				stoppedAny = true
			}
		}
	}

	// 3. Wait up to 3 seconds for port to become free
	waitUntilPortFree(port, 3*time.Second)

	return stoppedAny
}

func isProcessAlive(pid int) bool {
	p, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	return p.Signal(syscall.Signal(0)) == nil
}

func terminateProcess(pid int) {
	p, err := os.FindProcess(pid)
	if err != nil {
		return
	}

	// Try graceful SIGTERM first
	_ = p.Signal(syscall.SIGTERM)

	// Wait up to 1 second
	deadline := time.Now().Add(1 * time.Second)
	for time.Now().Before(deadline) {
		if !isProcessAlive(pid) {
			return
		}
		time.Sleep(50 * time.Millisecond)
	}

	// Force kill if still running
	if isProcessAlive(pid) {
		_ = p.Signal(syscall.SIGKILL)
		time.Sleep(50 * time.Millisecond)
	}
}

func findPIDsOnPort(port string) []int {
	var result []int
	out, err := exec.Command("lsof", "-ti", ":"+port).Output()
	if err != nil {
		return result
	}

	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if pid, err := strconv.Atoi(line); err == nil && pid > 0 {
			result = append(result, pid)
		}
	}
	return result
}

func isPortFree(port string) bool {
	ln, err := net.Listen("tcp", ":"+port)
	if err != nil {
		return false
	}
	_ = ln.Close()
	return true
}

func waitUntilPortFree(port string, timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if isPortFree(port) {
			return true
		}
		time.Sleep(100 * time.Millisecond)
	}
	return isPortFree(port)
}
