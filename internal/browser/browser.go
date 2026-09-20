// Package browser implements the browser-use layer on top of chromedp (CDP).
// It is the Go successor of the x-agent prototype's PlaywrightRuntime: a
// persistent-profile Chromium that the chat agent drives through a
// snapshot → act loop (semantic element list with stable locators).
package browser

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"github.com/chromedp/chromedp"
)

// Config controls the browser runtime. Defaults: headed, persistent profile
// under ~/.kendaliai/browser/profile, 1380x880 window (matches the prototype).
type Config struct {
	Headless    *bool  `json:"headless,omitempty" yaml:"headless,omitempty"`
	ExecPath    string `json:"execPath,omitempty" yaml:"execPath,omitempty"`
	UserDataDir string `json:"userDataDir,omitempty" yaml:"userDataDir,omitempty"`
	WindowW     int    `json:"windowW,omitempty" yaml:"windowW,omitempty"`
	WindowH     int    `json:"windowH,omitempty" yaml:"windowH,omitempty"`
}

// Element is one interactive element from a snapshot, with the stable CSS
// locator the act methods re-resolve at execution time.
type Element struct {
	Index   int     `json:"i"`
	Role    string  `json:"role"`
	Name    string  `json:"name"`
	Tag     string  `json:"tag"`
	ID      string  `json:"id,omitempty"`
	TestID  string  `json:"testid,omitempty"`
	Href    string  `json:"href,omitempty"`
	X       float64 `json:"x"`
	Y       float64 `json:"y"`
	W       float64 `json:"w"`
	H       float64 `json:"h"`
	Locator string  `json:"-"`
}

type run struct {
	allocCtx context.Context
	stop     context.CancelFunc
	ctx      context.Context // tab context used for all actions
	mu       sync.Mutex
	last     []Element
}

var (
	defaultRun *run
	runMu      sync.Mutex
	browserCfg Config
)

// Configure sets runtime options; call before the first tool use. It only
// has effect until the browser is started. Headless defaults to true — set
// Headless:false to show the browser window while the agent works.
func Configure(cfg Config) {
	runMu.Lock()
	defer runMu.Unlock()
	if defaultRun == nil || defaultRun.allocCtx == nil {
		browserCfg = cfg
	}
}

// DataDir is the browser-use data root (profile + screenshots).
func DataDir() string {
	if p := browserCfg.UserDataDir; p != "" {
		return filepath.Dir(p)
	}
	home, err := os.UserHomeDir()
	if err != nil {
		home = os.TempDir()
	}
	return home + "/.kendaliai/browser"
}

func ProfileDir() string {
	if p := browserCfg.UserDataDir; p != "" {
		return p
	}
	return DataDir() + "/profile"
}

func ShotsDir() string { return DataDir() + "/shots" }

// findChrome resolves the browser executable: config override, then the
// Playwright cache left by the x-agent prototype, then standard Chrome.
// In headless mode the headless-shell build is preferred: on some macOS
// VMs the full Chrome build's network service hangs on any http fetch
// while headless-shell works.
func findChrome(headless bool) (string, error) {
	if p := browserCfg.ExecPath; p != "" {
		if _, err := os.Stat(p); err == nil {
			return p, nil
		}
		return "", fmt.Errorf("browserUse.execPath %q not found", p)
	}
	if home, err := os.UserHomeDir(); err == nil {
		pick := func(glob string) string {
			matches, _ := filepath.Glob(home + glob)
			sort.Strings(matches)
			if len(matches) > 0 {
				return matches[len(matches)-1]
			}
			return ""
		}
		if headless {
			if p := pick("/Library/Caches/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-mac-arm64/chrome-headless-shell"); p != "" {
				return p, nil
			}
		}
		if p := pick("/Library/Caches/ms-playwright/chromium-*/chrome-mac-*/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"); p != "" {
			return p, nil
		}
	}
	if _, err := os.Stat("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"); err == nil {
		return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", nil
	}
	return "", errors.New("no Chromium found (install Google Chrome, run `npx playwright install chromium`, or set browserUse.execPath)")
}

// ensure starts the browser if needed.
func (r *run) ensure() error {
	if r.ctx != nil {
		select {
		case <-r.ctx.Done():
			r.ctx, r.allocCtx, r.stop = nil, nil, nil
		default:
			return nil
		}
	}
	headless := browserCfg.Headless == nil || *browserCfg.Headless
	exe, err := findChrome(headless)
	if err != nil {
		return err
	}
	_ = os.MkdirAll(ProfileDir(), 0o755)

	w, h := browserCfg.WindowW, browserCfg.WindowH
	if w == 0 {
		w = 1380
	}
	if h == 0 {
		h = 880
	}
	opts := []chromedp.ExecAllocatorOption{
		chromedp.ExecPath(exe),
		chromedp.UserDataDir(ProfileDir()),
		chromedp.WindowSize(w, h),
		chromedp.NoFirstRun,
		chromedp.NoDefaultBrowserCheck,
		chromedp.DisableGPU,
		chromedp.Flag("disable-blink-features", "AutomationControlled"),
		chromedp.Flag("force-renderer-accessibility", true),
	}
	if headless {
		opts = append(opts, chromedp.Headless)
	}

	allocCtx, acancel := chromedp.NewExecAllocator(context.Background(), opts...)
	browserCtx, bcancel := chromedp.NewContext(allocCtx)
	if err := chromedp.Run(browserCtx); err != nil {
		acancel()
		return fmt.Errorf("chromium launch failed: %w", err)
	}
	r.allocCtx, r.stop, r.ctx = allocCtx, func() { bcancel(); acancel() }, browserCtx
	return nil
}

// act runs fn against the browser with proper locking and a timeout.
// Actions must go through chromedp.Run so the CDP executor is attached.
func act(timeout time.Duration, fn func(ctx context.Context) error) error {
	runMu.Lock()
	if defaultRun == nil {
		defaultRun = &run{}
	}
	r := defaultRun
	if err := r.ensure(); err != nil {
		runMu.Unlock()
		return err
	}
	r.mu.Lock()
	runMu.Unlock()
	defer r.mu.Unlock()

	ctx, cancel := context.WithTimeout(r.ctx, timeout)
	defer cancel()
	return chromedp.Run(ctx, chromedp.ActionFunc(fn))
}
