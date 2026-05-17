.PHONY: dev build run install clean

# Install frontend deps
install:
	cd web && npm install

# Dev mode: run Go + Vite concurrently
dev:
	@echo "🌤  Starting Sky Gen dev servers..."
	@trap 'kill 0' SIGINT; \
	go run ./cmd/main.go & \
	cd web && npm run dev & \
	wait

# Build production (React → web/dist, then Go binary serves it)
build:
	@echo "📦 Building React..."
	cd web && npm run build
	@echo "🔨 Building Go binary..."
	go build -o sky-gen ./cmd/main.go
	@echo "✅ Done. Run: ./sky-gen"

# Run the production binary (after build)
run:
	./sky-gen

# Go only (no frontend)
dev-api:
	go run ./cmd/main.go

# Tidy Go deps
tidy:
	go mod tidy

clean:
	rm -f sky-gen
	rm -rf web/dist
