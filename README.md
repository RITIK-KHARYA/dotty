# Sky//Gen

ASCII sky generator — Go backend + React frontend monorepo.

## Structure

```
sky-gen/
├── cmd/
│   └── main.go          # HTTP server + API handler
├── internal/
│   └── sky/
│       └── engine.go    # ASCII sky engine (noise + palette + renderer)
├── web/
│   ├── src/
│   │   ├── main.jsx
│   │   └── App.jsx      # React UI
│   ├── index.html
│   ├── vite.config.ts   # proxies /api → :8080
│   └── package.json
├── go.mod
├── Makefile
└── package.json
```

## Quick Start

```bash
# 1. Install frontend deps
make install

# 2. Run both servers (Go :8080 + Vite :3000)
make dev

# Open http://localhost:3000
```

## Production Build

```bash
make build   # builds React → web/dist, then Go binary
./sky-gen    # serves everything on :8080
```

## API

`POST /api/sky`

```json
{
  "width": 90,
  "height": 28,
  "seed": 0,
  "mode": "day",
  "scale": 4.0
}
```

Response:
```json
{
  "ascii": "...",
  "seed": 123456,
  "mode": "day"
}
```

Modes: `day` · `dusk` · `night`

## How the engine works

1. **Noise layer** — stacked octave noise (5 octaves, 0.5 persistence) produces cloud-like density values per character cell
2. **Sky gradient** — vertical bias adjusts density by mode (stars dense at zenith for night, bright band near horizon for dusk)
3. **ASCII renderer** — density value mapped to a char palette per mode (sparse space → dense symbols)
