BINARY    := kendaliai
CMD       := ./cmd/kendaliai
BUILD_DIR := ./build
VERSION   := 0.2.0

.PHONY: dev dev-tui dev-gateway dev-onboard dev-logs build build-prod install run clean tidy lint

build:
	mkdir -p $(BUILD_DIR)
	go build -o $(BUILD_DIR)/$(BINARY) $(CMD)

build-prod:
	mkdir -p $(BUILD_DIR)
	CGO_ENABLED=1 go build -ldflags="-s -w -X main.version=$(VERSION)" -o $(BUILD_DIR)/$(BINARY) $(CMD)

install: build-prod
	cp $(BUILD_DIR)/$(BINARY) /usr/local/bin/
	mkdir -p ~/.kendaliai
	@if [ ! -f ~/.kendaliai/config.json ]; then \
		echo "Copying config.json to ~/.kendaliai/config.json"; \
		cp config.json ~/.kendaliai/config.json; \
	fi

dev:
	go run $(CMD)

dev-tui:
	go run $(CMD) tui

dev-gateway:
	go run $(CMD) gateway

dev-onboard:
	go run $(CMD) onboard

dev-logs:
	go run $(CMD) logs

run: build
	$(BUILD_DIR)/$(BINARY)

clean:
	rm -rf $(BUILD_DIR)

tidy:
	go mod tidy

lint:
	go vet ./internal/... ./cmd/...
