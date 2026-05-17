package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sky-gen/internal/sky"
	"strconv"
	"strings"
)

type generateRequest struct {
	Width  int     `json:"width"`
	Height int     `json:"height"`
	Seed   int64   `json:"seed"`
	Mode   string  `json:"mode"`
	Scale  float64 `json:"scale"`
}

func handleGenerate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req generateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	// sensible defaults
	if req.Width <= 0 || req.Width > 300 {
		req.Width = 80
	}
	if req.Height <= 0 || req.Height > 100 {
		req.Height = 24
	}
	if req.Scale <= 0 {
		req.Scale = 4.0
	}

	cfg := sky.SkyConfig{
		Width:  req.Width,
		Height: req.Height,
		Seed:   req.Seed,
		Mode:   sky.Mode(req.Mode),
		Scale:  req.Scale,
	}

	frame := sky.Generate(cfg)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(frame)
}

// handleConvertImage accepts a multipart image upload and returns ASCII
func handleConvertImage(w http.ResponseWriter, r *http.Request) {
	r.ParseMultipartForm(20 << 20) // 20MB
	file, _, err := r.FormFile("image")
	if err != nil {
		http.Error(w, "missing image field", http.StatusBadRequest)
		return
	}
	defer file.Close()

	cols, _ := strconv.Atoi(r.FormValue("cols"))
	rows, _ := strconv.Atoi(r.FormValue("rows"))
	if cols <= 0 { cols = 120 }
	if rows <= 0 { rows = 40 }

	ascii, err := sky.ImageToASCII(file, cols, rows)
	if err != nil {
		http.Error(w, "failed to convert image: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"ascii": ascii})
}

// handleConvertVideo extracts frames via ffmpeg and returns ASCII frames
func handleConvertVideo(w http.ResponseWriter, r *http.Request) {
	r.ParseMultipartForm(200 << 20) // 200MB
	file, hdr, err := r.FormFile("video")
	if err != nil {
		http.Error(w, "missing video field", http.StatusBadRequest)
		return
	}
	defer file.Close()

	cols, _ := strconv.Atoi(r.FormValue("cols"))
	rows, _ := strconv.Atoi(r.FormValue("rows"))
	fps, _  := strconv.Atoi(r.FormValue("fps"))
	if cols <= 0 { cols = 80 }
	if rows <= 0 { rows = 24 }
	if fps <= 0  { fps = 8 }

	// write upload to temp file
	tmp, err := os.CreateTemp("", "skygen-*"+filepath.Ext(hdr.Filename))
	if err != nil {
		http.Error(w, "temp file error", http.StatusInternalServerError)
		return
	}
	defer os.Remove(tmp.Name())

	buf := new(bytes.Buffer)
	buf.ReadFrom(file)
	tmp.Write(buf.Bytes())
	tmp.Close()

	// extract frames as PNG via ffmpeg
	frameDir, err := os.MkdirTemp("", "skygen-frames-*")
	if err != nil {
		http.Error(w, "temp dir error", http.StatusInternalServerError)
		return
	}
	defer os.RemoveAll(frameDir)

	ffmpegPath, err := exec.LookPath("ffmpeg")
	if err != nil {
		http.Error(w, "ffmpeg not found — install ffmpeg to enable video support", http.StatusNotImplemented)
		return
	}

	cmd := exec.Command(ffmpegPath,
		"-i", tmp.Name(),
		"-vf", fmt.Sprintf("fps=%d,scale=320:-1", fps),
		"-frames:v", "120", // max 120 frames
		filepath.Join(frameDir, "frame%04d.png"),
	)
	if out, err := cmd.CombinedOutput(); err != nil {
		http.Error(w, "ffmpeg error: "+string(out), http.StatusInternalServerError)
		return
	}

	// convert each frame to ASCII
	entries, _ := os.ReadDir(frameDir)
	frames := make([]string, 0, len(entries))
	for _, e := range entries {
		if !strings.HasSuffix(e.Name(), ".png") { continue }
		f, err := os.Open(filepath.Join(frameDir, e.Name()))
		if err != nil { continue }
		ascii, err := sky.ImageToASCII(f, cols, rows)
		f.Close()
		if err != nil { continue }
		frames = append(frames, ascii)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"frames": frames,
		"fps":    fps,
		"cols":   cols,
		"rows":   rows,
	})
}

// suppress unused import warnings — used via image decode side-effects
var _ = image.Point{}
var _ = base64.StdEncoding

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	mux := http.NewServeMux()

	// API routes
	mux.HandleFunc("/api/sky", handleGenerate)
	mux.HandleFunc("/api/convert/image", handleConvertImage)
	mux.HandleFunc("/api/convert/video", handleConvertVideo)

	// Health check
	mux.HandleFunc("/api/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok", "port": strconv.Itoa(8080)})
	})

	// Serve React build (web/dist) in production — registered last so API routes win
	webDir := "./web/dist"
	if _, err := os.Stat(webDir); err == nil {
		fs := http.FileServer(http.Dir(webDir))
		mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			if len(r.URL.Path) >= 4 && r.URL.Path[:4] == "/api" {
				http.NotFound(w, r)
				return
			}
			fs.ServeHTTP(w, r)
		})
		log.Printf("Serving React build from %s", webDir)
	} else {
		mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			w.Write([]byte("Sky Gen API running. Start the React dev server with: cd web && npm run dev\n"))
		})
	}

	handler := corsMiddleware(mux)

	log.Printf("🌤  Sky Gen server listening on :%s", port)
	if err := http.ListenAndServe(":"+port, handler); err != nil {
		log.Fatal(err)
	}
}