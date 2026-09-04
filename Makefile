BINARY    := kendaliai
CMD       := ./cmd/kendaliai
BUILD_DIR := ./build
UI_DIR    := ./ui
VERSION   := $(shell cat VERSION 2>/dev/null || echo "0.2.0")

# Tools resolution
PM  := $(shell command -v bun 2>/dev/null || echo "npm")
AIR := $(shell command -v air 2>/dev/null || echo "$$(go env GOPATH)/bin/air")

.PHONY: all build build-go build-ui dev dev-go dev-ui start start-daemon stop restart status clean lint tidy install air-install bump-version

all: build

# ── Build Targets ──

build: build-ui build-go
	@echo "✅ KendaliAI full build complete: $(BUILD_DIR)/$(BINARY)"

build-go:
	@mkdir -p $(BUILD_DIR)
	go build -o $(BUILD_DIR)/$(BINARY) $(CMD)

build-ui:
	@echo "📦 Building React Vite UI with $(PM)..."
	@cd $(UI_DIR) && $(PM) run build

# ── Development Targets (Live Hot-Reload) ──

# Full-stack dev mode: Air (Go live-reload :8080) + Vite (UI live-reload :5173)
dev:
	@echo "🚀 Starting KendaliAI Full-Stack Dev (Air + Vite)..."
	@$(BUILD_DIR)/$(BINARY) stop >/dev/null 2>&1 || true
	@trap 'kill 0' EXIT; $(AIR) & (cd $(UI_DIR) && $(PM) run dev)

# Backend only with Air live-reload
dev-go:
	@echo "🔥 Starting Go backend with Air live-reloading..."
	@$(BUILD_DIR)/$(BINARY) stop >/dev/null 2>&1 || true
	@$(AIR)

# Frontend only with Vite hot-reload
dev-ui:
	@echo "⚡ Starting React Vite frontend..."
	@cd $(UI_DIR) && $(PM) run dev

air-install:
	go install github.com/air-verse/air@latest

# ── Production Runtime Targets ──

# Start gateway in foreground (auto-clears port 8080 and stale processes first)
start: build-go
	$(BUILD_DIR)/$(BINARY) start

# Start gateway in background as daemon
start-daemon: build-go
	$(BUILD_DIR)/$(BINARY) start -d

# Stop gateway, kill any process holding port 8080, and clear PID file
stop: build-go
	$(BUILD_DIR)/$(BINARY) stop

# Restart gateway daemon
restart: build-go
	$(BUILD_DIR)/$(BINARY) restart

# Show gateway status, uptime, PID, and port listeners
status: build-go
	$(BUILD_DIR)/$(BINARY) status

# ── Maintenance & Code Quality ──

clean:
	rm -rf $(BUILD_DIR)
	rm -rf $(UI_DIR)/dist
	rm -rf tmp/

tidy:
	go mod tidy

lint:
	go vet ./internal/... ./cmd/...

bump-version:
	@python3 -c "v='$(VERSION)'.split('.'); print('.'.join([v[0],v[1],str(int(v[2])+1)]))" > VERSION && echo "Version bumped to $$(cat VERSION)"

install: build
	@$(BUILD_DIR)/$(BINARY) install $(if $(DIR),-d $(DIR),)
