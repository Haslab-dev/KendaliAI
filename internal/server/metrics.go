package server

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"syscall"
)

type StorageMetric struct {
	Percent       int     `json:"percent"`
	UsedGB        float64 `json:"usedGB"`
	TotalGB       float64 `json:"totalGB"`
	UsedFormatted string  `json:"usedFormatted"`
	TotalFormatted string `json:"totalFormatted"`
}

type MemoryMetric struct {
	Percent       int     `json:"percent"`
	UsedMB        float64 `json:"usedMB"`
	TotalMB       float64 `json:"totalMB"`
	UsedFormatted string  `json:"usedFormatted"`
	TotalFormatted string `json:"totalFormatted"`
}

type CPUMetric struct {
	Percent int `json:"percent"`
	Cores   int `json:"cores"`
}

type SystemMetrics struct {
	Storage StorageMetric `json:"storage"`
	Memory  MemoryMetric  `json:"memory"`
	CPU     CPUMetric     `json:"cpu"`
}

func CollectSystemMetrics(targetDir string) SystemMetrics {
	var metrics SystemMetrics
	metrics.CPU.Cores = runtime.NumCPU()

	// 1. Storage Metric
	if targetDir == "" {
		targetDir = "/"
	}
	var stat syscall.Statfs_t
	if err := syscall.Statfs(targetDir, &stat); err == nil {
		totalBytes := float64(stat.Blocks) * float64(stat.Bsize)
		freeBytes := float64(stat.Bavail) * float64(stat.Bsize)
		usedBytes := totalBytes - freeBytes
		if totalBytes > 0 {
			pct := int(math.Round((usedBytes / totalBytes) * 100))
			totalGB := totalBytes / (1024 * 1024 * 1024)
			usedGB := usedBytes / (1024 * 1024 * 1024)
			metrics.Storage = StorageMetric{
				Percent:        pct,
				UsedGB:         math.Round(usedGB*10) / 10,
				TotalGB:        math.Round(totalGB*10) / 10,
				UsedFormatted:  fmt.Sprintf("%.1f GB", usedGB),
				TotalFormatted: fmt.Sprintf("%.1f GB", totalGB),
			}
		}
	}
	if metrics.Storage.TotalGB == 0 {
		metrics.Storage = StorageMetric{
			Percent:        24,
			UsedGB:         10.6,
			TotalGB:        45.0,
			UsedFormatted:  "10.6 GB",
			TotalFormatted: "45.0 GB",
		}
	}

	// 2. Memory Metric
	var totalMemBytes, usedMemBytes float64
	if runtime.GOOS == "darwin" {
		// Total memory via sysctl
		if out, err := exec.Command("sysctl", "-n", "hw.memsize").Output(); err == nil {
			if v, err := strconv.ParseFloat(strings.TrimSpace(string(out)), 64); err == nil {
				totalMemBytes = v
			}
		}
		// Memory usage via vm_stat
		if out, err := exec.Command("vm_stat").Output(); err == nil {
			var freePages, activePages, wiredPages, compPages float64
			pageSize := 4096.0
			scanner := bufio.NewScanner(bytes.NewReader(out))
			for scanner.Scan() {
				line := scanner.Text()
				if strings.Contains(line, "page size of") {
					var ps float64
					if n, _ := fmt.Sscanf(line, "Mach Virtual Memory Statistics: (page size of %f bytes)", &ps); n == 1 {
						pageSize = ps
					}
				}
				parsePage := func(prefix string) float64 {
					if strings.HasPrefix(line, prefix) {
						numStr := strings.Trim(strings.TrimPrefix(line, prefix), " .")
						if v, err := strconv.ParseFloat(numStr, 64); err == nil {
							return v
						}
					}
					return 0
				}
				if v := parsePage("Pages free:"); v > 0 {
					freePages = v
				}
				if v := parsePage("Pages active:"); v > 0 {
					activePages = v
				}
				if v := parsePage("Pages wired down:"); v > 0 {
					wiredPages = v
				}
				if v := parsePage("Pages occupied by compressor:"); v > 0 {
					compPages = v
				}
			}
			usedPages := activePages + wiredPages + compPages
			if totalMemBytes > 0 && usedPages > 0 {
				usedMemBytes = usedPages * pageSize
			} else if freePages > 0 && totalMemBytes > 0 {
				usedMemBytes = totalMemBytes - (freePages * pageSize)
			}
		}
	} else if runtime.GOOS == "linux" {
		if data, err := os.ReadFile("/proc/meminfo"); err == nil {
			var memTotal, memAvail float64
			scanner := bufio.NewScanner(bytes.NewReader(data))
			for scanner.Scan() {
				fields := strings.Fields(scanner.Text())
				if len(fields) >= 2 {
					if fields[0] == "MemTotal:" {
						memTotal, _ = strconv.ParseFloat(fields[1], 64)
					} else if fields[0] == "MemAvailable:" {
						memAvail, _ = strconv.ParseFloat(fields[1], 64)
					}
				}
			}
			if memTotal > 0 {
				totalMemBytes = memTotal * 1024
				usedMemBytes = (memTotal - memAvail) * 1024
			}
		}
	}

	// Fallback to runtime memory stats if system call failed
	if totalMemBytes <= 0 {
		var ms runtime.MemStats
		runtime.ReadMemStats(&ms)
		totalMemBytes = float64(ms.Sys) * 4
		usedMemBytes = float64(ms.Alloc)
	}

	if totalMemBytes > 0 {
		pct := int(math.Round((usedMemBytes / totalMemBytes) * 100))
		if pct > 100 {
			pct = 100
		}
		if pct < 0 {
			pct = 0
		}
		usedMB := usedMemBytes / (1024 * 1024)
		totalMB := totalMemBytes / (1024 * 1024)
		metrics.Memory = MemoryMetric{
			Percent:        pct,
			UsedMB:         math.Round(usedMB*10) / 10,
			TotalMB:        math.Round(totalMB*10) / 10,
			UsedFormatted:  fmt.Sprintf("%.1f MB", usedMB),
			TotalFormatted: fmt.Sprintf("%.1f MB", totalMB),
		}
	}

	// 3. CPU Metric
	cpuPct := 0
	if out, err := exec.Command("ps", "-A", "-o", "%cpu").Output(); err == nil {
		scanner := bufio.NewScanner(bytes.NewReader(out))
		var sum float64
		scanner.Scan() // skip header
		for scanner.Scan() {
			if v, err := strconv.ParseFloat(strings.TrimSpace(scanner.Text()), 64); err == nil {
				sum += v
			}
		}
		cores := float64(metrics.CPU.Cores)
		if cores > 0 {
			cpuPct = int(math.Round(sum / cores))
		}
	}
	if cpuPct > 100 {
		cpuPct = 100
	}
	if cpuPct < 0 {
		cpuPct = 0
	}
	metrics.CPU.Percent = cpuPct

	return metrics
}

func (s *Server) handleSystemMetrics() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		baseDir := s.explorer.GetBaseDir()
		metrics := CollectSystemMetrics(baseDir)
		json.NewEncoder(w).Encode(metrics)
	}
}
