package workspace

import (
	"os"
	"path/filepath"
	"testing"
)

func TestExplorer_FileOperations(t *testing.T) {
	tmpDir := t.TempDir()
	exp := NewExplorer(tmpDir)

	// Write file
	err := exp.WriteFile("test/hello.txt", "Hello KendaliAI")
	if err != nil {
		t.Fatalf("WriteFile failed: %v", err)
	}

	// Read file
	content, _, err := exp.ReadFile("test/hello.txt")
	if err != nil {
		t.Fatalf("ReadFile failed: %v", err)
	}
	if content != "Hello KendaliAI" {
		t.Fatalf("expected 'Hello KendaliAI', got '%s'", content)
	}

	// List directory
	items, err := exp.ListDirectory("test")
	if err != nil {
		t.Fatalf("ListDirectory failed: %v", err)
	}
	if len(items) != 1 || items[0].Name != "hello.txt" {
		t.Fatalf("unexpected items: %+v", items)
	}

	// Delete path
	err = exp.DeletePath("test/hello.txt")
	if err != nil {
		t.Fatalf("DeletePath failed: %v", err)
	}

	if _, err := os.Stat(filepath.Join(tmpDir, "test", "hello.txt")); !os.IsNotExist(err) {
		t.Fatalf("file should have been deleted")
	}
}
