package sky

import (
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"math"
	"math/rand"
	"strings"
)

// ASCII chars from darkest to brightest
var asciiRamp = []rune(" .`-_':,;^=+/\"|)\\<>)(iv%&?#X80$W@M")

// ImageToASCII converts an image reader to an ASCII string
func ImageToASCII(r io.Reader, width, height int) (string, error) {
	img, _, err := image.Decode(r)
	if err != nil {
		return "", err
	}
	return renderASCII(img, width, height), nil
}

func renderASCII(img image.Image, cols, rows int) string {
	bounds := img.Bounds()
	imgW := bounds.Max.X
	imgH := bounds.Max.Y

	cellW := float64(imgW) / float64(cols)
	cellH := float64(imgH) / float64(rows)

	var sb strings.Builder
	for row := 0; row < rows; row++ {
		for col := 0; col < cols; col++ {
			// sample center of each cell
			px := int(float64(col)*cellW + cellW/2)
			py := int(float64(row)*cellH + cellH/2)
			if px >= imgW { px = imgW - 1 }
			if py >= imgH { py = imgH - 1 }

			r32, g32, b32, _ := img.At(px, py).RGBA()
			// luminance (0-255)
			lum := (0.299*float64(r32) + 0.587*float64(g32) + 0.114*float64(b32)) / 65535.0
			idx := int(lum * float64(len(asciiRamp)-1))
			sb.WriteRune(asciiRamp[idx])
		}
		sb.WriteRune('\n')
	}
	return sb.String()
}

type Mode string

const (
	ModeDay   Mode = "day"
	ModeDusk  Mode = "dusk"
	ModeNight Mode = "night"
)

// SkyConfig holds generation parameters
type SkyConfig struct {
	Width  int
	Height int
	Seed   int64
	Mode   Mode
	Scale  float64 // cloud scale / zoom
}

// SkyFrame is the generated result
type SkyFrame struct {
	ASCII string `json:"ascii"`
	Seed  int64  `json:"seed"`
	Mode  string `json:"mode"`
}

// palette maps mode → char sets from sparse to dense
var palette = map[Mode][]rune{
	ModeDay:   {' ', ' ', ' ', '.', '.', '\'', '`', '-', '~', ':', ';', '=', 'o', 'O', '#'},
	ModeDusk:  {' ', ' ', '.', '\'', '*', '+', 'x', 'X', '%', '&', '@', '#', '█'},
	ModeNight: {' ', ' ', ' ', '.', '+', '*', '✦', '✧', '☆', '★', '·', 'o', '°', '✶'},
}

// fade returns a smooth S-curve (smoothstep)
func fade(t float64) float64 {
	return t * t * t * (t*(t*6-15) + 10)
}

func lerp(a, b, t float64) float64 {
	return a + t*(b-a)
}

// grad2D produces a gradient dot product for Perlin-like noise
func grad2D(hash int, x, y float64) float64 {
	switch hash & 3 {
	case 0:
		return x + y
	case 1:
		return -x + y
	case 2:
		return x - y
	default:
		return -x - y
	}
}

// noise2D is a simple seeded 2D value noise
func noise2D(rng *rand.Rand, x, y float64) float64 {
	xi := int(math.Floor(x)) & 255
	yi := int(math.Floor(y)) & 255
	xf := x - math.Floor(x)
	yf := y - math.Floor(y)

	u := fade(xf)
	v := fade(yf)

	// four corner hashes
	aa := (rng.Perm(256)[xi] + yi) & 255
	ab := (rng.Perm(256)[xi] + yi + 1) & 255
	ba := (rng.Perm(256)[(xi+1)&255] + yi) & 255
	bb := (rng.Perm(256)[(xi+1)&255] + yi + 1) & 255

	p := rng.Perm(256)
	return lerp(
		lerp(grad2D(p[aa], xf, yf), grad2D(p[ba], xf-1, yf), u),
		lerp(grad2D(p[ab], xf, yf-1), grad2D(p[bb], xf-1, yf-1), u),
		v,
	)
}

// octaveNoise stacks multiple noise layers for cloud-like texture
func octaveNoise(rng *rand.Rand, x, y float64, octaves int, persistence float64) float64 {
	total := 0.0
	frequency := 1.0
	amplitude := 1.0
	maxVal := 0.0

	for i := 0; i < octaves; i++ {
		total += noise2D(rng, x*frequency, y*frequency) * amplitude
		maxVal += amplitude
		amplitude *= persistence
		frequency *= 2.0
	}
	return total / maxVal
}

// skyGradient adds a vertical bias so sky is clearer at top, denser below
func skyGradient(y, height int, mode Mode) float64 {
	t := float64(y) / float64(height)
	switch mode {
	case ModeNight:
		// denser stars at zenith
		return 1.0 - (t * 0.4)
	case ModeDusk:
		// bright band near horizon
		return 0.5 + math.Sin(t*math.Pi)*0.5
	default:
		// clouds drift mid-sky
		return 0.3 + math.Sin(t*math.Pi)*0.7
	}
}

// Generate builds an ASCII sky frame
func Generate(cfg SkyConfig) SkyFrame {
	if cfg.Seed == 0 {
		cfg.Seed = rand.Int63()
	}
	if cfg.Scale == 0 {
		cfg.Scale = 4.0
	}

	rng := rand.New(rand.NewSource(cfg.Seed))
	chars := palette[cfg.Mode]
	if chars == nil {
		chars = palette[ModeDay]
	}

	var sb strings.Builder

	for y := 0; y < cfg.Height; y++ {
		for x := 0; x < cfg.Width; x++ {
			nx := float64(x) / float64(cfg.Width) * cfg.Scale
			ny := float64(y) / float64(cfg.Height) * cfg.Scale

			n := octaveNoise(rng, nx, ny, 5, 0.5)
			// normalize -1..1 → 0..1
			n = (n + 1.0) / 2.0
			// apply vertical gradient
			n *= skyGradient(y, cfg.Height, cfg.Mode)
			// clamp
			if n < 0 {
				n = 0
			}
			if n > 1 {
				n = 1
			}

			idx := int(n * float64(len(chars)-1))
			sb.WriteRune(chars[idx])
		}
		sb.WriteRune('\n')
	}

	return SkyFrame{
		ASCII: sb.String(),
		Seed:  cfg.Seed,
		Mode:  string(cfg.Mode),
	}
}