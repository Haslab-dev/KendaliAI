package telemetry

import (
	"sync"
)

type Span struct {
	TraceID      string `json:"traceId"`
	SpanID       string `json:"spanId"`
	ParentSpanID string `json:"parentSpanId,omitempty"`
	Name         string `json:"name"`
	TaskID       string `json:"taskId,omitempty"`
}

type TelemetryService struct {
	mu           sync.Mutex
	tokenUsage   map[string]int
	spendSummary map[string]float64
	spans        map[string]Span
}

func NewTelemetryService() *TelemetryService {
	return &TelemetryService{
		tokenUsage:   make(map[string]int),
		spendSummary: make(map[string]float64),
		spans:        make(map[string]Span),
	}
}

func (ts *TelemetryService) RecordTokens(goalID string, tokens int) {
	ts.mu.Lock()
	defer ts.mu.Unlock()
	ts.tokenUsage[goalID] += tokens
}

func (ts *TelemetryService) RecordCost(goalID string, cost float64) {
	ts.mu.Lock()
	defer ts.mu.Unlock()
	ts.spendSummary[goalID] += cost
}

func (ts *TelemetryService) StartSpan(traceID, spanID, parentSpanID, name string) Span {
	ts.mu.Lock()
	defer ts.mu.Unlock()

	s := Span{
		TraceID:      traceID,
		SpanID:       spanID,
		ParentSpanID: parentSpanID,
		Name:         name,
	}
	ts.spans[spanID] = s
	return s
}

func (ts *TelemetryService) GetMetrics(goalID string) (int, float64) {
	ts.mu.Lock()
	defer ts.mu.Unlock()
	return ts.tokenUsage[goalID], ts.spendSummary[goalID]
}

func (ts *TelemetryService) GetSpan(spanID string) (Span, bool) {
	ts.mu.Lock()
	defer ts.mu.Unlock()
	s, ok := ts.spans[spanID]
	return s, ok
}
