package gateway

import (
	"database/sql"
	"testing"

	_ "github.com/mattn/go-sqlite3"
)

func newAttachmentTestStore(t *testing.T) *Store {
	t.Helper()
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	db.SetMaxOpenConns(1)
	t.Cleanup(func() { db.Close() })
	if _, err := db.Exec(`CREATE TABLE objects (
		id TEXT PRIMARY KEY, session_id TEXT, bucket TEXT, key TEXT, checksum TEXT,
		mime TEXT, size INTEGER, url TEXT, metadata TEXT, created_at INTEGER
	)`); err != nil {
		t.Fatalf("create objects table: %v", err)
	}
	return NewStore(db)
}

func TestAttachmentSaveAndLoad(t *testing.T) {
	root := t.TempDir()
	SetAttachmentsRoot(root)
	t.Cleanup(func() { SetAttachmentsRoot("") })

	store := newAttachmentTestStore(t)
	data := []byte("hello attachment")
	att, err := store.SaveAttachment("sess_1", "notes.txt", data)
	if err != nil {
		t.Fatalf("save: %v", err)
	}
	if att.Kind != "text" {
		t.Fatalf("kind: got %q, want text", att.Kind)
	}
	if att.URL != "/api/attachments/"+att.ID {
		t.Fatalf("unexpected url %q", att.URL)
	}

	got, err := store.GetAttachment(att.ID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.Name != "notes.txt" || got.Size != int64(len(data)) {
		t.Fatalf("unexpected metadata: %+v", got)
	}
	loaded, err := LoadAttachmentBytes(*got)
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if string(loaded) != string(data) {
		t.Fatalf("loaded bytes mismatch")
	}
}

func TestAttachmentClassificationAndAllowlist(t *testing.T) {
	if AttachmentKind("photo.PNG", "image/png") != "image" {
		t.Fatal("png should be an image")
	}
	if AttachmentKind("report.pdf", "application/pdf") != "pdf" {
		t.Fatal("pdf should be a pdf")
	}
	if AttachmentKind("main.go", "text/plain") != "text" {
		t.Fatal("go source should be text")
	}
	if AttachmentKind("archive.bin", "application/octet-stream") != "other" {
		t.Fatal("unknown binary should be other")
	}

	if !IsAllowedAttachment("photo.png", nil) {
		t.Fatal("png should be allowed by default")
	}
	if IsAllowedAttachment("malware.exe", nil) {
		t.Fatal("exe should not be allowed by default")
	}
	if IsAllowedAttachment("photo.png", []string{".pdf"}) {
		t.Fatal("explicit allowlist should reject png")
	}
}
