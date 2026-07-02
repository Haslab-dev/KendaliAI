package skills

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

type SkillProvider interface {
	CanHandle(url string) bool
	Fetch(ctx context.Context, url string) (string, error)
}

type githubTreeURL struct {
	Owner    string
	Repo     string
	Ref      string
	Path     string
	SkillID  string
}

var githubTreeRE = regexp.MustCompile(`github\.com/([^/]+)/([^/]+)/tree/([^/]+)/(.+)`)

func parseGitHubURL(rawURL string) *githubTreeURL {
	rawURL = strings.TrimSuffix(rawURL, "/")
	if strings.HasPrefix(rawURL, "git@github.com:") {
		rawURL = strings.TrimPrefix(rawURL, "git@github.com:")
		rawURL = strings.TrimSuffix(rawURL, ".git")
		rawURL = "https://github.com/" + rawURL
	}
	rawURL = strings.ReplaceAll(rawURL, "https://github.com/", "github.com/")

	matches := githubTreeRE.FindStringSubmatch(rawURL)
	if matches == nil {
		return nil
	}

	gh := &githubTreeURL{
		Owner: matches[1],
		Repo:  strings.TrimSuffix(matches[2], ".git"),
		Ref:   matches[3],
		Path:  matches[4],
	}
	parts := strings.Split(gh.Path, "/")
	gh.SkillID = parts[len(parts)-1]
	return gh
}

type GitHubProvider struct {
	client *http.Client
}

func NewGitHubProvider() *GitHubProvider {
	return &GitHubProvider{client: &http.Client{}}
}

func (p *GitHubProvider) CanHandle(url string) bool {
	return strings.Contains(url, "github.com")
}

func (p *GitHubProvider) Fetch(ctx context.Context, url string) (string, error) {
	gh := parseGitHubURL(url)
	if gh == nil {
		return "", fmt.Errorf("cannot parse GitHub URL: %s", url)
	}

	baseDir := filepath.Join(os.TempDir(), "kendaliai-gh-"+gh.SkillID)
	os.RemoveAll(baseDir)
	os.MkdirAll(baseDir, 0755)

	if err := p.downloadDir(ctx, gh, gh.Path, baseDir); err != nil {
		os.RemoveAll(baseDir)
		return "", fmt.Errorf("download: %w", err)
	}

	return baseDir, nil
}

func (p *GitHubProvider) downloadDir(ctx context.Context, gh *githubTreeURL, path, dest string) error {
	apiURL := fmt.Sprintf("https://api.github.com/repos/%s/%s/contents/%s?ref=%s",
		gh.Owner, gh.Repo, path, gh.Ref)

	req, _ := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	if token := os.Getenv("GITHUB_TOKEN"); token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := p.client.Do(req)
	if err != nil {
		return fmt.Errorf("api request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return fmt.Errorf("github api returned %d", resp.StatusCode)
	}

	data, _ := io.ReadAll(resp.Body)

	var files []struct {
		Name        string `json:"name"`
		Type        string `json:"type"`
		DownloadURL string `json:"download_url"`
	}
	if err := json.Unmarshal(data, &files); err != nil {
		var single struct {
			Name        string `json:"name"`
			Content     string `json:"content"`
			Encoding    string `json:"encoding"`
		}
		json.Unmarshal(data, &single)
		if single.Name != "" {
			content := single.Content
			if err := os.WriteFile(filepath.Join(dest, single.Name), []byte(content), 0644); err != nil {
				return fmt.Errorf("write %s: %w", single.Name, err)
			}
			return nil
		}
		return fmt.Errorf("empty directory: %s", path)
	}

	for _, f := range files {
		destPath := filepath.Join(dest, f.Name)
		if f.Type == "dir" {
			os.MkdirAll(destPath, 0755)
			subPath := path + "/" + f.Name
			if err := p.downloadDir(ctx, gh, subPath, destPath); err != nil {
				return err
			}
			continue
		}
		content, err := p.downloadFile(ctx, f.DownloadURL)
		if err != nil {
			return fmt.Errorf("download %s: %w", f.Name, err)
		}
		os.WriteFile(destPath, content, 0644)
	}

	return nil
}

func (p *GitHubProvider) downloadFile(ctx context.Context, url string) ([]byte, error) {
	req, _ := http.NewRequestWithContext(ctx, "GET", url, nil)
	resp, err := p.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	return io.ReadAll(resp.Body)
}

type FilesystemProvider struct{}

func (p *FilesystemProvider) CanHandle(url string) bool {
	return strings.HasPrefix(url, "/") || strings.HasPrefix(url, ".") || strings.HasPrefix(url, "~") ||
		(!strings.Contains(url, "://") && !strings.Contains(url, "github.com"))
}

func (p *FilesystemProvider) Fetch(ctx context.Context, url string) (string, error) {
	abs, err := filepath.Abs(url)
	if err != nil {
		return "", fmt.Errorf("resolve path: %w", err)
	}
	if _, err := os.Stat(abs); err != nil {
		return "", fmt.Errorf("path not found: %s", abs)
	}
	return abs, nil
}
