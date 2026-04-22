package agent

import (
	"fmt"
	"sync"
	"time"

	"github.com/kendaliai/app/internal/logger"
)

type ExecutionMetric struct {
	ToolName  string
	Success   bool
	Latency   time.Duration
}

// TelemetryTracker stores dynamic tool tracking (Rule 9)
var TelemetryTracker = struct {
	Metrics []ExecutionMetric
	mu      sync.Mutex
}{}

func RecordTelemetry(name string, success bool, latency time.Duration) {
	TelemetryTracker.mu.Lock()
	defer TelemetryTracker.mu.Unlock()
	TelemetryTracker.Metrics = append(TelemetryTracker.Metrics, ExecutionMetric{
		ToolName: name, 
		Success: success, 
		Latency: latency,
	})
	
	prefix := "✅"
	if !success { prefix = "❌" }
	logger.Info("Telemetry", fmt.Sprintf("%s Agent metrics -> Engine resolved tool '%s' dynamically in %v", prefix, name, latency))
}
