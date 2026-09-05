package embedding

import (
	"context"
	"net/http"
	"net/http/httptest"
	"io"
	"strings"
	"testing"
)

func TestResolveEmbeddingsBase(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{name: "empty keeps client default", in: "", want: ""},
		{name: "bare proxy root gets /v1", in: "http://localhost:4000", want: "http://localhost:4000/v1"},
		{name: "trailing slash trimmed", in: "http://localhost:4000/", want: "http://localhost:4000/v1"},
		{name: "versioned endpoint kept", in: "https://api.openai.com/v1", want: "https://api.openai.com/v1"},
		{name: "other version kept", in: "https://api.example.com/v2", want: "https://api.example.com/v2"},
		{name: "versioned with trailing slash", in: "https://api.openai.com/v1/", want: "https://api.openai.com/v1"},
		{name: "full embeddings path trimmed", in: "https://api.openai.com/v1/embeddings", want: "https://api.openai.com/v1"},
		{name: "custom path without version kept as base", in: "https://gw.example.com/api/embeddings", want: "https://gw.example.com/api"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := resolveEmbeddingsBase(tt.in); got != tt.want {
				t.Errorf("resolveEmbeddingsBase(%q) = %q, want %q", tt.in, got, tt.want)
			}
		})
	}
}

func TestEmbedPlainTextInputErrorIsActionable(t *testing.T) {
	// Simulates a wrong URL: server answers Go's plain-text 404 body, which
	// previously surfaced as "json: cannot unmarshal number into Go value of
	// type openai.ErrorResponse" with no URL context.
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasSuffix(r.URL.Path, "/v1/embeddings") {
			w.WriteHeader(http.StatusNotFound)
			_, _ = w.Write([]byte("404 page not found"))
			return
		}
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":{"message":"invalid key","type":"auth_error"}}`))
	}))
	defer server.Close()

	c := NewClientFromConfig("key", server.URL, "test-model") // no /v1 -> resolver must add it
	_, err := c.Embed(context.Background(), []string{"hello"})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), c.baseURL+"/embeddings") {
		t.Errorf("error missing resolved URL %q: %v", c.baseURL, err)
	}
	// The request must have been routed to /v1/embeddings (the handler would
	// return a plain-text 404 body otherwise, triggering the hint branch).
	if strings.Contains(err.Error(), "did not return a JSON response") {
		t.Errorf("resolver did not add /v1; hit plain-text branch: %v", err)
	}
	if !strings.Contains(err.Error(), "invalid key") {
		t.Errorf("server error message lost: %v", err)
	}
}

func TestEmbedPlainBodyHint(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte("404 page not found"))
	}))
	defer server.Close()

	c := NewClientFromConfig("key", server.URL, "test-model")
	_, err := c.Embed(context.Background(), []string{"hello"})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "did not return a JSON response") {
		t.Errorf("expected non-JSON hint in error: %v", err)
	}
	if !strings.Contains(err.Error(), "via") {
		t.Errorf("expected resolved URL in error: %v", err)
	}
}

func TestEmbedSuccess(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"index":0,"embedding":[0.25,-0.5,1.0]}],"usage":{"prompt_tokens":1,"total_tokens":1}}`))
	}))
	defer server.Close()

	c := NewClientFromConfig("key", server.URL, "test-model")
	vecs, err := c.Embed(context.Background(), []string{"hello world"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(vecs) != 1 || len(vecs[0]) != 3 || vecs[0][2] != 1.0 {
		t.Errorf("unexpected vectors: %v", vecs)
	}
}

func TestEmbedRequestOmitsUserField(t *testing.T) {
	var captured string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		captured = string(b)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"embedding":[1,2,3]}]}`))
	}))
	defer server.Close()

	c := NewClientFromConfig("key", server.URL, "mistral-embed")
	if _, err := c.Embed(context.Background(), []string{"hello"}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if strings.Contains(captured, "user") {
		t.Errorf("request must not carry a user field (Mistral 422): %s", captured)
	}
	if !strings.Contains(captured, `"model":"mistral-embed"`) {
		t.Errorf("model missing from request: %s", captured)
	}
}

func TestEmbedMistralShapeErrorIsReadable(t *testing.T) {
	// Mistral returns 422 with {"object":"error","message":{"detail":[...]},"type":...}
	// — go-openai printed this as "%!s(<nil>)".
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnprocessableEntity)
		_, _ = w.Write([]byte(`{"object":"error","message":{"detail":[{"type":"extra_forbidden","loc":["body","EmbeddingRequest","user"],"msg":"Extra inputs are not permitted","input":""}]},"type":"invalid_request_error","param":null,"code":null,"raw_status_code":422}`))
	}))
	defer server.Close()

	c := NewClientFromConfig("key", server.URL, "mistral-embed")
	_, err := c.Embed(context.Background(), []string{"hello"})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "Extra inputs are not permitted") {
		t.Errorf("Mistral detail message lost: %v", err)
	}
	if strings.Contains(err.Error(), "%!s") {
		t.Errorf("raw format verb leaked into error: %v", err)
	}
}
