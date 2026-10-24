package agent

import (
	"fmt"
	"sort"
	"strings"
)

// ============================================================================
// Visual generation helpers — fully offline, deterministic, zero dependencies.
// ============================================================================

type visualPalette struct {
	A, B, BG, FG, MUTED string
}

var visualPalettes = map[string]visualPalette{
	"violet": {A: "#7C3AED", B: "#DB2777", BG: "#0B0713", FG: "#F5F3FF", MUTED: "#A78BFA"},
	"ocean":  {A: "#0284C7", B: "#0D9488", BG: "#04121C", FG: "#F0F9FF", MUTED: "#7DD3FC"},
	"forest": {A: "#15803D", B: "#65A30D", BG: "#071408", FG: "#F0FDF4", MUTED: "#86EFAC"},
	"sunset": {A: "#EA580C", B: "#E11D48", BG: "#170703", FG: "#FFF7ED", MUTED: "#FDBA74"},
	"mono":   {A: "#3F3F46", B: "#71717A", BG: "#09090B", FG: "#FAFAFA", MUTED: "#A1A1AA"},
}

func pickPalette(name string) visualPalette {
	if p, ok := visualPalettes[strings.ToLower(name)]; ok {
		return p
	}
	return visualPalettes["violet"]
}

func svgEscapeText(s string) string {
	r := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;")
	return r.Replace(s)
}

// wrapSVGText splits text into lines of ~maxChars and emits <tspan> rows.
func wrapSVGText(sb *strings.Builder, text string, x, y, lineHeight int, maxChars int, attrs string) {
	words := strings.Fields(text)
	if len(words) == 0 {
		return
	}
	var lines []string
	cur := ""
	for _, w := range words {
		if cur == "" {
			cur = w
		} else if len(cur)+1+len(w) <= maxChars {
			cur += " " + w
		} else {
			lines = append(lines, cur)
			cur = w
		}
	}
	if cur != "" {
		lines = append(lines, cur)
	}
	for i, l := range lines {
		fmt.Fprintf(sb, `<text x="%d" y="%d" %s>%s</text>`+"\n", x, y+i*lineHeight, attrs, svgEscapeText(l))
	}
}

// renderSVG renders poster / card / chart variants as SVG markup.
func renderSVG(variant, title, subtitle string, items []visualItem, palette string) (string, error) {
	p := pickPalette(palette)
	var sb strings.Builder
	switch strings.ToLower(variant) {
	case "poster":
		if strings.TrimSpace(title) == "" {
			return "", fmt.Errorf("'title' is required for the poster variant")
		}
		sb.WriteString(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">` + "\n")
		fmt.Fprintf(&sb, `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%%" stop-color="%s"/><stop offset="100%%" stop-color="%s"/></linearGradient></defs>`+"\n", p.A, p.B)
		fmt.Fprintf(&sb, `<rect width="1200" height="675" fill="%s"/>`+"\n", p.BG)
		fmt.Fprintf(&sb, `<rect x="24" y="24" width="1152" height="627" fill="url(#g)" opacity="0.16" stroke="%s" stroke-opacity="0.4" stroke-width="2"/>`+"\n", p.MUTED)
		fmt.Fprintf(&sb, `<circle cx="1080" cy="120" r="56" fill="url(#g)" opacity="0.85"/>`+"\n")
		sb.WriteString(`<g font-family="Inter, Segoe UI, Helvetica, Arial, sans-serif">` + "\n")
		wrapSVGText(&sb, strings.ToUpper(title), 96, 300, 84, 24, fmt.Sprintf(`font-size="76" font-weight="700" fill="%s" letter-spacing="1"`, p.FG))
		if subtitle != "" {
			wrapSVGText(&sb, subtitle, 96, 430, 44, 52, fmt.Sprintf(`font-size="30" fill="%s"`, p.MUTED))
		}
		fmt.Fprintf(&sb, `  <rect x="96" y="560" width="140" height="8" fill="url(#g)"/>`+"\n")
		sb.WriteString("</g>\n</svg>")
		return sb.String(), nil

	case "card":
		if strings.TrimSpace(title) == "" {
			return "", fmt.Errorf("'title' is required for the card variant")
		}
		sb.WriteString(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="720" viewBox="0 0 1080 720">` + "\n")
		fmt.Fprintf(&sb, `<rect width="1080" height="720" fill="%s"/>`+"\n", p.BG)
		fmt.Fprintf(&sb, `<rect x="40" y="40" width="1000" height="640" rx="24" fill="%s" opacity="0.08" stroke="%s" stroke-opacity="0.5" stroke-width="2"/>`+"\n", p.A, p.MUTED)
		sb.WriteString(`<g font-family="Inter, Segoe UI, Helvetica, Arial, sans-serif">` + "\n")
		wrapSVGText(&sb, title, 96, 160, 60, 30, fmt.Sprintf(`font-size="48" font-weight="700" fill="%s"`, p.FG))
		y := 260
		for _, it := range items {
			fmt.Fprintf(&sb, `  <circle cx="112" cy="%d" r="8" fill="%s"/>`+"\n", y-10, p.A)
			wrapSVGText(&sb, it.Label, 148, y, 36, 52, fmt.Sprintf(`font-size="26" fill="%s"`, p.FG))
			y += 76
			if y > 620 {
				break
			}
		}
		if subtitle != "" {
			wrapSVGText(&sb, subtitle, 96, 640, 36, 60, fmt.Sprintf(`font-size="22" fill="%s"`, p.MUTED))
		}
		sb.WriteString("</g>\n</svg>")
		return sb.String(), nil

	case "chart":
		if len(items) == 0 {
			return "", fmt.Errorf("'items' with at least one {label, value} is required for the chart variant")
		}
		sorted := make([]visualItem, len(items))
		copy(sorted, items)
		sort.SliceStable(sorted, func(i, j int) bool { return sorted[i].Value > sorted[j].Value })
		maxVal := sorted[0].Value
		if maxVal == 0 {
			maxVal = 1
		}

		w, h := 1080, 640
		left, top, bottom := 260, 80, 640-90
		slot := (bottom - top) / len(sorted)
		barH := slot - 18
		if barH > 56 {
			barH = 56
		}
		if barH < 12 {
			barH = 12
		}

		sb.WriteString(fmt.Sprintf(`<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d">`+"\n", w, h, w, h))
		fmt.Fprintf(&sb, `<rect width="%d" height="%d" fill="%s"/>`+"\n", w, h, p.BG)
		sb.WriteString(`<g font-family="Inter, Segoe UI, Helvetica, Arial, sans-serif">` + "\n")
		if title != "" {
			wrapSVGText(&sb, title, 48, 54, 44, 40, fmt.Sprintf(`font-size="32" font-weight="700" fill="%s"`, p.FG))
		}
		for i, it := range sorted {
			y := top + i*slot + (slot-barH)/2
			bw := int(float64(w-left-140) * it.Value / maxVal)
			if bw < 6 {
				bw = 6
			}
			fill := p.A
			if i%2 == 1 {
				fill = p.B
			}
			fmt.Fprintf(&sb, `  <text x="%d" y="%d" font-size="22" text-anchor="end" fill="%s">%s</text>`+"\n", left-20, y+barH-8, p.MUTED, svgEscapeText(it.Label))
			fmt.Fprintf(&sb, `  <rect x="%d" y="%d" width="%d" height="%d" rx="%d" fill="%s"/>`+"\n", left, y, bw, barH, barH/2, fill)
			fmt.Fprintf(&sb, `  <text x="%d" y="%d" font-size="22" font-weight="600" fill="%s">%g</text>`+"\n", left+bw+16, y+barH-8, p.FG, it.Value)
		}
		sb.WriteString("</g>\n</svg>")
		return sb.String(), nil

	default:
		return "", fmt.Errorf("unknown variant %q (use poster, card, or chart)", variant)
	}
}

// ============================================================================
// Open Design deck.html generation (Swiss International spec)
// ============================================================================

// deckSlide is one slide of a generated deck.
type deckSlide struct {
	Title   string   `json:"title"`
	Bullets []string `json:"bullets"`
}

// motionScene is one Remotion scene.
type motionScene struct {
	Text             string `json:"text"`
	DurationInFrames int    `json:"durationInFrames"`
}

// hyperScene is one HyperFrames timeline scene.
type hyperScene struct {
	Text            string  `json:"text"`
	DurationSeconds float64 `json:"durationSeconds"`
}

// buildDeckHTML renders a self-contained interactive slide deck. Layout follows
// the repo's open-design-slides skill: 1920x1080 fixed stage, 16-column grid,
// hairline borders, zero border-radius, keyboard navigation.
func buildDeckHTML(title string, slides []deckSlide) string {
	if strings.TrimSpace(title) == "" {
		title = "Presentation"
	}
	var sections strings.Builder
	for i, s := range slides {
		label := fmt.Sprintf("%02d %s", i+1, s.Title)
		var bullets strings.Builder
		for _, b := range s.Bullets {
			bullets.WriteString(fmt.Sprintf("<li>%s</li>\n", htmlEscapeText(b)))
		}
		active := ""
		if i == 0 {
			active = " active"
		}
		sections.WriteString(fmt.Sprintf(`
  <section class="slide%s" data-screen-label="%s">
    <div class="slide-inner">
      <p class="tag">%s</p>
      <h2>%s</h2>
      <ul class="bullets">
      %s      </ul>
    </div>
  </section>`, active, htmlEscapeText(label), htmlEscapeText(fmt.Sprintf("%02d / %02d", i+1, len(slides))), htmlEscapeText(s.Title), bullets.String()))
	}

	return fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>%s</title>
<style>
  :root { --bg: #0a0a0c; --fg: #fafafa; --muted: #8b8b93; --border: rgba(250,250,250,0.16); --accent: #d4ff3f; --deck-scale: 1; }
  * { margin: 0; padding: 0; box-sizing: border-box; border-radius: 0; }
  html, body { background: var(--bg); color: var(--fg); font-family: Inter, "Segoe UI", Helvetica, Arial, sans-serif; height: 100%%; overflow: hidden; }
  .deck-stage { position: fixed; left: 50%%; top: 50%%; width: 1920px; height: 1080px; transform: translate(-50%%, -50%%) scale(var(--deck-scale)); background: var(--bg); }
  .slide { display: none; position: absolute; inset: 0; padding: 120px 140px; border-top: 1px solid var(--border); }
  .slide.active { display: block; }
  .slide-inner { display: grid; grid-template-columns: repeat(16, 1fr); gap: 20px; height: 100%%; align-content: start; }
  .tag { grid-column: 1 / span 16; font-size: 20px; letter-spacing: 0.35em; text-transform: uppercase; color: var(--muted); padding-bottom: 28px; border-bottom: 1px solid var(--border); }
  h2 { grid-column: 1 / span 16; font-size: 96px; line-height: 1.05; font-weight: 700; letter-spacing: -0.02em; padding-top: 48px; }
  .bullets { grid-column: 1 / span 12; list-style: none; padding-top: 56px; }
  .bullets li { font-size: 34px; line-height: 1.5; color: var(--fg); padding: 18px 0; border-bottom: 1px solid var(--border); }
  .bullets li::before { content: "→"; color: var(--accent); margin-right: 20px; }
  .progress { position: absolute; left: 0; bottom: 0; height: 4px; background: var(--accent); transition: width 0.25s ease; }
</style>
</head>
<body>
<main class="deck-stage" id="deck">
%s
  <div class="progress" id="progress"></div>
</main>
<script>
  (function () {
    var slides = Array.prototype.slice.call(document.querySelectorAll('.slide'));
    var idx = 0;
    var progress = document.getElementById('progress');
    function show(n) {
      idx = Math.max(0, Math.min(slides.length - 1, n));
      slides.forEach(function (s, i) { s.classList.toggle('active', i === idx); });
      progress.style.width = (((idx + 1) / slides.length) * 100) + '%%';
      var active = slides[idx];
      if (active) history.replaceState(null, '', '#' + (active.getAttribute('data-screen-label') || idx + 1).replace(/\s+/g, '-'));
    }
    function fit() {
      var scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
      document.documentElement.style.setProperty('--deck-scale', scale);
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { show(idx + 1); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { show(idx - 1); }
      else if (e.key === 'Home') { show(0); }
      else if (e.key === 'End') { show(slides.length - 1); }
    });
    window.addEventListener('resize', fit);
    fit();
    show(0);
  })();
</script>
</body>
</html>`, htmlEscapeText(title), sections.String())
}

func htmlEscapeText(s string) string {
	r := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&#34;", "'", "&#39;")
	return r.Replace(s)
}

// ============================================================================
// Remotion project scaffolding
// ============================================================================

// buildRemotionProject writes a runnable Remotion (React video) project.
func buildRemotionProject(title string, scenes []motionScene, fps, width, height int) map[string][]byte {
	if fps <= 0 {
		fps = 30
	}
	if width <= 0 {
		width = 1920
	}
	if height <= 0 {
		height = 1080
	}

	// Sequence table + defaults
	var seqs strings.Builder
	total := 0
	for i, s := range scenes {
		dur := s.DurationInFrames
		if dur <= 0 {
			dur = 90
		}
		fmt.Fprintf(&seqs, "    <Sequence from={%d} durationInFrames={%d}>\n      <Scene text={%q} index={%d} total={%d} />\n    </Sequence>\n", total, dur, s.Text, i+1, len(scenes))
		total += dur
	}
	compID := "Main"

	files := map[string][]byte{
		"package.json": []byte(fmt.Sprintf(`{
  "name": "remotion-motion",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "render": "remotion render src/index.ts %s out.mp4",
    "preview": "remotion studio src/index.ts"
  },
  "dependencies": {
    "@remotion/cli": "^4.0.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "remotion": "^4.0.0"
  }
}`, compID)),
		"tsconfig.json": []byte(`{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src"]
}`),
		"src/index.ts": []byte(`import { registerRoot } from "remotion";
import { RemotionRoot } from "./Root";

registerRoot(RemotionRoot);
`),
		"src/Root.tsx": []byte(fmt.Sprintf(`import React from "react";
import { Composition, Sequence, AbsoluteFill, interpolate, spring, useCurrentFrame } from "remotion";

const FPS = %d;
const WIDTH = %d;
const HEIGHT = %d;
const DURATION = %d;

const Scene: React.FC<{ text: string; index: number; total: number }> = ({ text, index, total }) => {
  const frame = useCurrentFrame();
  const enter = spring({ frame, fps: FPS, config: { damping: 200 } });
  const opacity = interpolate(enter, [0, 1], [0, 1]);
  const translateY = interpolate(enter, [0, 1], [60, 0]);
  return (
    <AbsoluteFill style={{ backgroundColor: "#0a0a0c", justifyContent: "center", alignItems: "center", padding: 120 }}>
      <div style={{ position: "absolute", top: 80, left: 120, fontSize: 28, letterSpacing: 8, color: "#8b8b93", textTransform: "uppercase" }}>
        {`+"`"+`{String(index).padStart(2, "0")} / {String(total).padStart(2, "0")}`+"`"+`}
      </div>
      <div style={{ transform: `+"`"+`translateY(${translateY}px)`+"`"+`, opacity, fontSize: 84, fontWeight: 700, color: "#fafafa", textAlign: "center", maxWidth: WIDTH - 300, lineHeight: 1.15 }}>
        {text}
      </div>
      <div style={{ position: "absolute", bottom: 80, left: 120, width: 160, height: 8, background: "#d4ff3f" }} />
    </AbsoluteFill>
  );
};

export const RemotionRoot: React.FC = () => (
  <Composition
    id=%q
    durationInFrames={DURATION}
    fps={FPS}
    dimensions={{ width: WIDTH, height: HEIGHT }}
  >
    %s  </Composition>
);
`, fps, width, height, total, compID, seqs.String())),
		"README.md": []byte(fmt.Sprintf(`# %s — Remotion Motion Project

Scaffolded by KendaliAI motion_remotion.

## Render

`+"```"+`bash
npm install
npx remotion render src/index.ts %s out.mp4
`+"```"+`

## Preview

`+"```"+`bash
npx remotion studio src/index.ts
`+"```"+`
`, title, compID)),
	}
	return files
}

// ============================================================================
// HyperFrames motion.html generation (GSAP master timeline)
// ============================================================================

// buildHyperframeHTML renders a single-file HyperFrames animation per the
// repo's open-design-hyperframes skill: fixed 1920x1080 stage, GSAP timeline.
func buildHyperframeHTML(title, accent string, scenes []hyperScene) string {
	if accent == "" {
		accent = "#d4ff3f"
	}
	var tl strings.Builder
	cursor := 0.0
	for i, s := range scenes {
		dur := s.DurationSeconds
		if dur <= 0 {
			dur = 3
		}
		fmt.Fprintf(&tl, `    tl.fromTo("#scene-%02d", { opacity: 0, y: 80 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" })
    tl.fromTo("#scene-%02d .bar", { scaleX: 0 }, { scaleX: 1, duration: 0.5, ease: "power2.out" }, "<0.2")
    tl.to("#scene-%02d", { opacity: 0, y: -60, duration: 0.5, ease: "power2.in" }, "+=%.2f")
`, i+1, i+1, i+1, dur-1.1)
		cursor += dur
	}

	var els strings.Builder
	for i, s := range scenes {
		els.WriteString(fmt.Sprintf(`
    <div class="scene" id="scene-%02d">
      <div class="counter">%02d</div>
      <h1>%s</h1>
      <div class="bar"></div>
    </div>`, i+1, i+1, htmlEscapeText(s.Text)))
	}

	return fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>%s</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: #050507; height: 100%%; overflow: hidden; font-family: Inter, "Segoe UI", Helvetica, Arial, sans-serif; }
  #root { position: fixed; left: 50%%; top: 50%%; width: 1920px; height: 1080px; transform: translate(-50%%, -50%%); background: #0a0a0c; overflow: hidden; }
  .scene { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center; padding: 0 160px; opacity: 0; }
  .scene .counter { font-size: 30px; letter-spacing: 0.35em; color: #8b8b93; text-transform: uppercase; margin-bottom: 40px; }
  .scene h1 { font-size: 120px; font-weight: 700; color: #fafafa; line-height: 1.05; letter-spacing: -0.02em; max-width: 1500px; }
  .scene .bar { width: 180px; height: 10px; background: %s; margin-top: 56px; transform-origin: left; }
</style>
</head>
<body>
<div id="root">
  <h2 style="position:absolute;top:64px;left:64px;font-size:26px;letter-spacing:0.3em;color:#8b8b93;text-transform:uppercase;">%s</h2>%s
</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
<script>
  window.addEventListener("load", function () {
    var tl = gsap.timeline({ repeat: 0, defaults: { ease: "power2.out" } });
%s  });
</script>
</body>
</html>`, htmlEscapeText(title), accent, htmlEscapeText(title), els.String(), tl.String())
}
