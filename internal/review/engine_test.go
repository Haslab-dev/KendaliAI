package review

import (
	"os"
	"path/filepath"
	"testing"
)

func TestReviewEngine_SecretDetection(t *testing.T) {
	re := NewReviewEngine()
	tmpDir := t.TempDir()
	testFile := filepath.Join(tmpDir, "config.go")

	badCode := `package main
var apiKey = "api_key_secret_1234567890abcdef"
func main() {}`

	if err := os.WriteFile(testFile, []byte(badCode), 0644); err != nil {
		t.Fatal(err)
	}

	report, err := re.ReviewFile(testFile)
	if err != nil {
		t.Fatal(err)
	}

	if report.Clean {
		t.Fatalf("expected issues found, got clean report")
	}

	if report.HighCount == 0 {
		t.Fatalf("expected high severity issue for api key leak")
	}
}
