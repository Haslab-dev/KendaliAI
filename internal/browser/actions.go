package browser

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/chromedp/chromedp"
	"github.com/chromedp/cdproto/target"
)

// snapshotJS mirrors the prototype's pageIndexScript: walk interactive
// elements, keep visible in-viewport ones, and emit identity + center coords.
// Each element also gets a compact CSS locator used to re-resolve it at act
// time (so coordinates never go stale).
const snapshotJS = `(() => {
  const sel = 'a[href], button, input, select, textarea, [role="button"], [role="link"], [role="tab"], [role="checkbox"], [role="menuitem"], [role="switch"], [role="searchbox"], [role="combobox"], [contenteditable="true"], [data-testid], summary';
  function locatorFor(el) {
    if (el.id) return '#' + CSS.escape(el.id);
    const tid = el.getAttribute('data-testid');
    if (tid) return '[data-testid="' + CSS.escape(tid) + '"]';
    const path = [];
    let cur = el;
    for (let d = 0; d < 4 && cur && cur !== document.body; d++) {
      if (cur.id) { path.unshift('#' + CSS.escape(cur.id)); break; }
      let seg = cur.tagName.toLowerCase();
      const sibs = cur.parentElement ? Array.from(cur.parentElement.children).filter(c => c.tagName === cur.tagName) : [];
      if (sibs.length > 1) seg += ':nth-of-type(' + (sibs.indexOf(cur) + 1) + ')';
      path.unshift(seg);
      cur = cur.parentElement;
    }
    return path.join(' > ');
  }
  const out = [];
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    if (r.width < 3 || r.height < 3) continue;
    if (st.visibility === 'hidden' || st.display === 'none' || st.opacity === '0') continue;
    if (r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) continue;
    if (out.length >= 120) break;
    const role = el.getAttribute('role') || el.tagName.toLowerCase();
    const name = (el.getAttribute('aria-label') || el.innerText || el.value || el.placeholder || el.getAttribute('title') || '').trim().replace(/\s+/g, ' ').slice(0, 90);
    out.push({
      role, name,
      tag: el.tagName.toLowerCase(),
      id: el.id || '',
      testid: el.getAttribute('data-testid') || '',
      href: (el.tagName === 'A' && el.href) ? el.href.slice(0, 120) : '',
      disabled: !!el.disabled,
      x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2),
      w: Math.round(r.width), h: Math.round(r.height),
      loc: locatorFor(el)
    });
  }
  return { url: location.href, title: document.title, elements: out };
})()`

type element struct {
	Index    int     `json:"i"`
	Role     string  `json:"role"`
	Name     string  `json:"name"`
	Tag      string  `json:"tag"`
	ID       string  `json:"id"`
	TestID   string  `json:"testid"`
	Href     string  `json:"href"`
	Disabled bool    `json:"disabled"`
	X        float64 `json:"x"`
	Y        float64 `json:"y"`
	W        float64 `json:"w"`
	H        float64 `json:"h"`
	Loc      string  `json:"loc"`
}

type snapshotResult struct {
	URL      string    `json:"url"`
	Title    string    `json:"title"`
	Elements []element `json:"elements"`
}

func takeSnapshot(ctx context.Context) (snapshotResult, error) {
	var res snapshotResult
	if err := chromedp.Evaluate(snapshotJS, &res).Do(ctx); err != nil {
		return res, err
	}
	for i := range res.Elements {
		res.Elements[i].Index = i
	}
	return res, nil
}

// snapshotSettled snapshots up to `tries` times, waiting for content to
// render (clicks and navigations often resolve while the new page is blank).
func snapshotSettled(ctx context.Context, tries int) (snapshotResult, error) {
	var res snapshotResult
	var err error
	for i := 0; i < tries; i++ {
		if i > 0 {
			select {
			case <-ctx.Done():
			case <-time.After(time.Second):
			}
		}
		res, err = takeSnapshot(ctx)
		if err != nil {
			return res, err
		}
		if len(res.Elements) > 0 || (res.Title != "" && i >= 1) {
			break
		}
	}
	return res, nil
}

// Snapshot returns the current page's interactive elements and remembers them
// so index-based actions can re-resolve their locator.
func Snapshot() (string, error) {
	var res snapshotResult
	err := act(30*time.Second, func(ctx context.Context) error {
		var err error
		res, err = takeSnapshot(ctx)
		return err
	})
	if err != nil {
		return "", err
	}
	return renderAndStore(res), nil
}

// renderAndStore stores the snapshot for index-based actions and renders the
// text form shown to the model.
func renderAndStore(res snapshotResult) string {
	runMu.Lock()
	if defaultRun != nil {
		stored := make([]Element, len(res.Elements))
		for i, e := range res.Elements {
			stored[i] = Element{
				Index: e.Index, Role: e.Role, Name: e.Name, Tag: e.Tag,
				ID: e.ID, TestID: e.TestID, Href: e.Href,
				X: e.X, Y: e.Y, W: e.W, H: e.H, Locator: e.Loc,
			}
		}
		defaultRun.last = stored
	}
	runMu.Unlock()

	var b strings.Builder
	fmt.Fprintf(&b, "url: %s\ntitle: %s\nelements: %d\n", res.URL, res.Title, len(res.Elements))
	for _, e := range res.Elements {
		fmt.Fprintf(&b, "[%d] %s %q", e.Index, e.Role, e.Name)
		if e.Disabled {
			b.WriteString(" (disabled)")
		}
		if e.Href != "" {
			fmt.Fprintf(&b, " -> %s", e.Href)
		}
		b.WriteString("\n")
	}
	if len(res.Elements) == 0 {
		b.WriteString("(no interactive elements — try browser_scroll or browser_extract_text)\n")
	}
	return b.String()
}

// Navigate goes to a URL and returns a fresh snapshot.
func Navigate(url string) (string, error) {
	if !strings.HasPrefix(url, "http://") && !strings.HasPrefix(url, "https://") &&
		!strings.HasPrefix(url, "file://") && !strings.HasPrefix(url, "about:") {
		url = "https://" + url
	}
	err := act(45*time.Second, func(ctx context.Context) error {
		if err := chromedp.Navigate(url).Do(ctx); err != nil {
			return err
		}
		// Best-effort settle: body readiness or a short grace period.
		if err := chromedp.WaitReady("body", chromedp.ByQuery).Do(ctx); err != nil {
			select {
			case <-ctx.Done():
			case <-time.After(2 * time.Second):
			}
		}
		return nil
	})
	if err != nil {
		return "", err
	}
	var res snapshotResult
	err = act(20*time.Second, func(ctx context.Context) error {
		var err error
		res, err = snapshotSettled(ctx, 3)
		return err
	})
	if err != nil {
		return "", err
	}
	return renderAndStore(res), nil
}

// locatorAt returns the stored locator for a snapshot index.
func locatorAt(index int) (string, error) {
	runMu.Lock()
	defer runMu.Unlock()
	if defaultRun == nil || len(defaultRun.last) == 0 {
		return "", fmt.Errorf("no snapshot yet — call browser_snapshot first")
	}
	if index < 0 || index >= len(defaultRun.last) {
		return "", fmt.Errorf("index %d out of range (snapshot has %d elements) — take a fresh browser_snapshot", index, len(defaultRun.last))
	}
	return defaultRun.last[index].Locator, nil
}

// Click re-resolves element `index`, scrolls it into view and clicks its
// center with real mouse events.
func Click(index int, count int) (string, error) {
	loc, err := locatorAt(index)
	if err != nil {
		return "", err
	}
	if count < 1 {
		count = 1
	}
	err = act(30*time.Second, func(ctx context.Context) error {
		var xy []float64
		if err := chromedp.Evaluate(
			fmt.Sprintf(`(() => { const el = document.querySelector(%q); if (!el) return null; el.scrollIntoView({block:'center'}); const r = el.getBoundingClientRect(); return [r.x + r.width/2, r.y + r.height/2]; })()`, loc), &xy).Do(ctx); err != nil {
			return err
		}
		if len(xy) < 2 {
			return fmt.Errorf("element %d no longer present (page changed) — take a fresh browser_snapshot", index)
		}
		return chromedp.MouseClickXY(xy[0], xy[1], chromedp.ClickCount(count)).Do(ctx)
	})
	if err != nil {
		return "", err
	}
	var res snapshotResult
	err = act(20*time.Second, func(ctx context.Context) error {
		var err error
		res, err = snapshotSettled(ctx, 3)
		return err
	})
	if err != nil {
		return "", err
	}
	return renderAndStore(res), nil
}

// Type focuses element `index`, optionally clearing it, then types text.
func Type(index int, text string, clear bool) (string, error) {
	loc, err := locatorAt(index)
	if err != nil {
		return "", err
	}
	err = act(30*time.Second, func(ctx context.Context) error {
		var found bool
		if err := chromedp.Evaluate(
			fmt.Sprintf(`(() => { const el = document.querySelector(%q); if (!el) return false; el.scrollIntoView({block:'center'}); el.focus(); return true; })()`, loc), &found).Do(ctx); err != nil {
			return err
		}
		if !found {
			return fmt.Errorf("element %d no longer present (page changed) — take a fresh browser_snapshot", index)
		}
		if clear {
			var ok bool
			if err := chromedp.Evaluate(
				fmt.Sprintf(`(() => { const el = document.querySelector(%q); if (!el) return false; el.value = ''; el.dispatchEvent(new Event('input', {bubbles: true})); return true; })()`, loc), &ok).Do(ctx); err != nil {
				return err
			}
		}
		return chromedp.SendKeys(loc, text, chromedp.ByQuery).Do(ctx)
	})
	if err != nil {
		return "", err
	}
	return fmt.Sprintf(`{"status":"typed","index":%d,"chars":%d}`, index, len([]rune(text))), nil
}

// KeyNames are the key names chromedp understands for non-printable keys.
var KeyNames = map[string]bool{
	"Enter": true, "Tab": true, "Escape": true, "Backspace": true, "Delete": true,
	"ArrowUp": true, "ArrowDown": true, "ArrowLeft": true, "ArrowRight": true,
	"PageUp": true, "PageDown": true, "Home": true, "End": true, "Space": true,
}

// Key presses a special key in the focused element.
func Key(name string) (string, error) {
	canonical := map[string]string{
		"return": "Enter", "enter": "Enter", "esc": "Escape", "escape": "Escape",
		"tab": "Tab", "space": "Space", "backspace": "Backspace", "delete": "Delete",
		"up": "ArrowUp", "down": "ArrowDown", "left": "ArrowLeft", "right": "ArrowRight",
		"pageup": "PageUp", "pagedown": "PageDown", "home": "Home", "end": "End",
	}[strings.ToLower(strings.TrimSpace(name))]
	if canonical == "" {
		return "", fmt.Errorf("unsupported key %q (use: Enter Tab Escape Backspace Delete ArrowUp/Down/Left/Right PageUp PageDown Home End Space)", name)
	}
	err := act(15*time.Second, func(ctx context.Context) error {
		return chromedp.KeyEvent(canonical).Do(ctx)
	})
	if err != nil {
		return "", err
	}
	time.Sleep(600 * time.Millisecond)
	return fmt.Sprintf(`{"status":"pressed","key":%q}`, canonical), nil
}

// Scroll scrolls the page and returns a fresh snapshot (elements move).
func Scroll(direction string, amount int) (string, error) {
	if amount <= 0 {
		amount = 600
	}
	sign := map[string]int{"down": 1, "up": -1}[strings.ToLower(direction)]
	if sign == 0 {
		return "", fmt.Errorf("direction must be 'up' or 'down'")
	}
	err := act(15*time.Second, func(ctx context.Context) error {
		return chromedp.Evaluate(fmt.Sprintf(`window.scrollBy(0, %d)`, sign*amount), nil).Do(ctx)
	})
	if err != nil {
		return "", err
	}
	time.Sleep(400 * time.Millisecond)
	return Snapshot()
}

// ExtractText returns the page's visible text plus title/url.
func ExtractText() (string, error) {
	var res struct {
		URL   string `json:"u"`
		Title string `json:"t"`
		Text  string `json:"x"`
	}
	err := act(30*time.Second, func(ctx context.Context) error {
		return chromedp.Evaluate(`(() => ({u: location.href, t: document.title, x: document.body.innerText.slice(0, 6000)}))()`, &res).Do(ctx)
	})
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("url: %s\ntitle: %s\n---\n%s", res.URL, res.Title, res.Text), nil
}

// Screenshot captures the viewport to a PNG under ShotsDir and returns a
// servable URL alongside the path.
func Screenshot(dest string) (string, error) {
	var png []byte
	err := act(30*time.Second, func(ctx context.Context) error {
		return chromedp.CaptureScreenshot(&png).Do(ctx)
	})
	if err != nil {
		return "", err
	}
	if dest == "" {
		dest = "shot-" + time.Now().Format("20060102-150405") + ".png"
	}
	if !filepath.IsAbs(dest) {
		if filepath.Ext(dest) == "" {
			dest += ".png"
		}
		dest = filepath.Join(ShotsDir(), filepath.Base(dest))
	}
	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		return "", err
	}
	if err := os.WriteFile(dest, png, 0o644); err != nil {
		return "", err
	}
	url := ""
	if filepath.Clean(filepath.Dir(dest)) == filepath.Clean(ShotsDir()) {
		url = "/api/browser/shots/" + filepath.Base(dest)
	}
	return fmt.Sprintf(`{"status":"saved","path":%q,"url":%q}`, dest, url), nil
}

// Tabs lists open tabs. Switch focuses a tab by its 0-based index (matching
// the listing order) and returns a fresh snapshot.
func Tabs(switchIndex int) (string, error) {
	var infos []*target.Info
	err := act(15*time.Second, func(ctx context.Context) error {
		var err error
		infos, err = chromedp.Targets(ctx)
		return err
	})
	if err != nil {
		return "", err
	}
	var b strings.Builder
	for i, t := range infos {
		if t.Type != "page" {
			continue
		}
		marker := " "
		if i == switchIndex {
			marker = ">"
		}
		fmt.Fprintf(&b, "%s [%d] %s — %s\n", marker, i, t.Title, t.URL)
	}
	if !strings.Contains(b.String(), "[") {
		b.WriteString("(no tabs)\n")
	}
	return b.String(), nil
}

// Close shuts the browser down.
func Close() (string, error) {
	runMu.Lock()
	r := defaultRun
	defaultRun = nil
	runMu.Unlock()
	if r == nil || r.stop == nil {
		return `{"status":"not_running"}`, nil
	}
	r.stop()
	return `{"status":"closed"}`, nil
}
