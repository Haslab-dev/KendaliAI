package tools

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

func (tr *ToolRegistry) HTTPClientTools() map[string]ToolDef {
	return map[string]ToolDef{
		"http_request": {
			Name:        "http_request",
			Description: "Makes HTTP requests (GET, POST, PUT, DELETE, PATCH). Supports headers, query params, and JSON body.",
			Signature:   `{"method": "string", "url": "string", "headers": "object", "body": "object", "timeout": "int"}`,
			Category:    "HTTP",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				method, _ := args["method"].(string)
				urlStr, _ := args["url"].(string)
				headers, _ := args["headers"].(map[string]interface{})
				body, _ := args["body"]
				timeout := 30
				if t, ok := args["timeout"].(float64); ok {
					timeout = int(t)
				}

				if urlStr == "" {
					return "error: 'url' is required"
				}
				if method == "" {
					method = "GET"
				}

				var bodyReader io.Reader
				if body != nil {
					var bodyBytes []byte
					switch v := body.(type) {
					case string:
						bodyBytes = []byte(v)
					case map[string]interface{}, []interface{}:
						bodyBytes, _ = json.Marshal(v)
					}
					bodyReader = bytes.NewBuffer(bodyBytes)
				}

				req, err := http.NewRequestWithContext(ctx, strings.ToUpper(method), urlStr, bodyReader)
				if err != nil {
					return fmt.Sprintf("error creating request: %v", err)
				}

				req.Header.Set("User-Agent", "KendaliAI/1.0")
				req.Header.Set("Accept", "application/json")

				if headers != nil {
					for k, v := range headers {
						req.Header.Set(k, fmt.Sprintf("%v", v))
					}
				}

				client := &http.Client{Timeout: time.Duration(timeout) * time.Second}
				resp, err := client.Do(req)
				if err != nil {
					return fmt.Sprintf("request failed: %v", err)
				}
				defer resp.Body.Close()

				respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
				contentType := resp.Header.Get("Content-Type")

				result := map[string]interface{}{
					"status":       resp.StatusCode,
					"statusText":   http.StatusText(resp.StatusCode),
					"headers":      resp.Header,
					"contentType":  contentType,
					"size":         len(respBody),
				}

				if len(respBody) > 0 {
					if strings.Contains(contentType, "application/json") {
						result["body"] = json.RawMessage(respBody)
					} else {
						bodyStr := string(respBody)
						if len(bodyStr) > 2000 {
							bodyStr = bodyStr[:2000] + "\n...(truncated)"
						}
						result["body"] = bodyStr
					}
				}

				b, _ := json.MarshalIndent(result, "", "  ")
				return string(b)
			},
		},

		"http_get": {
			Name:        "http_get",
			Description: "Convenience method for GET requests with optional query parameters.",
			Signature:   `{"url": "string", "params": "object", "headers": "object"}`,
			Category:    "HTTP",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				urlStr, _ := args["url"].(string)
				params, _ := args["params"].(map[string]interface{})
				headers, _ := args["headers"].(map[string]interface{})

				if urlStr == "" {
					return "error: 'url' is required"
				}

				if params != nil {
					query := url.Values{}
					for k, v := range params {
						query.Set(k, fmt.Sprintf("%v", v))
					}
					if strings.Contains(urlStr, "?") {
						urlStr += "&" + query.Encode()
					} else {
						urlStr += "?" + query.Encode()
					}
				}

				req, _ := http.NewRequestWithContext(ctx, "GET", urlStr, nil)
				req.Header.Set("User-Agent", "KendaliAI/1.0")
				req.Header.Set("Accept", "application/json")

				if headers != nil {
					for k, v := range headers {
						req.Header.Set(k, fmt.Sprintf("%v", v))
					}
				}

				resp, err := http.DefaultClient.Do(req)
				if err != nil {
					return fmt.Sprintf("GET failed: %v", err)
				}
				defer resp.Body.Close()

				body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
				return fmt.Sprintf(`{"status":%d,"body":%s}`, resp.StatusCode, string(body))
			},
		},

		"http_post": {
			Name:        "http_post",
			Description: "Convenience method for POST requests with JSON body.",
			Signature:   `{"url": "string", "body": "object", "headers": "object"}`,
			Category:    "HTTP",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				urlStr, _ := args["url"].(string)
				body, _ := args["body"]
				headers, _ := args["headers"].(map[string]interface{})

				if urlStr == "" {
					return "error: 'url' is required"
				}

				var bodyBytes []byte
				if body != nil {
					bodyBytes, _ = json.Marshal(body)
				}

				req, _ := http.NewRequestWithContext(ctx, "POST", urlStr, bytes.NewBuffer(bodyBytes))
				req.Header.Set("Content-Type", "application/json")
				req.Header.Set("User-Agent", "KendaliAI/1.0")

				if headers != nil {
					for k, v := range headers {
						req.Header.Set(k, fmt.Sprintf("%v", v))
					}
				}

				resp, err := http.DefaultClient.Do(req)
				if err != nil {
					return fmt.Sprintf("POST failed: %v", err)
				}
				defer resp.Body.Close()

				respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
				return fmt.Sprintf(`{"status":%d,"body":%s}`, resp.StatusCode, string(respBody))
			},
		},

		"fetch_url": {
			Name:        "fetch_url",
			Description: "Fetches and parses web page content (HTML or JSON).",
			Signature:   `{"url": "string", "format": "string"}`,
			Category:    "HTTP",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				urlStr, _ := args["url"].(string)
				format, _ := args["format"].(string)

				if urlStr == "" {
					return "error: 'url' is required"
				}

				req, _ := http.NewRequestWithContext(ctx, "GET", urlStr, nil)
				req.Header.Set("User-Agent", "KendaliAI/1.0")

				resp, err := http.DefaultClient.Do(req)
				if err != nil {
					return fmt.Sprintf("fetch failed: %v", err)
				}
				defer resp.Body.Close()

				body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
				content := string(body)

				if format == "json" || strings.Contains(resp.Header.Get("Content-Type"), "json") {
					var prettyJSON bytes.Buffer
					json.Indent(&prettyJSON, body, "", "  ")
					content = prettyJSON.String()
				}

				if len(content) > 8000 {
					content = content[:8000] + "\n...(truncated)"
				}

				return content
			},
		},

		"api_call": {
			Name:        "api_call",
			Description: "Calls a configured API endpoint using service name (e.g., 'github', 'openai').",
			Signature:   `{"service": "string", "endpoint": "string", "method": "string", "params": "object"}`,
			Category:    "HTTP",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				service, _ := args["service"].(string)
				endpoint, _ := args["endpoint"].(string)
				method, _ := args["method"].(string)
				params, _ := args["params"].(map[string]interface{})

				if service == "" {
					return "error: 'service' is required"
				}

				baseURL := os.Getenv(service + "_API_URL")
				if baseURL == "" {
					return fmt.Sprintf("API '%s' not configured (set %s_API_URL)", service, service)
				}

				urlStr := baseURL
				if endpoint != "" {
					urlStr = strings.TrimSuffix(baseURL, "/") + "/" + strings.TrimPrefix(endpoint, "/")
				}

				var body []byte
				httpMethod := "GET"
				if params != nil && (method == "" || method == "POST" || method == "PUT") {
					body, _ = json.Marshal(params)
					httpMethod = method
					if httpMethod == "" {
						httpMethod = "POST"
					}
				}

				if params != nil && httpMethod == "GET" {
					query := url.Values{}
					for k, v := range params {
						query.Set(k, fmt.Sprintf("%v", v))
					}
					if strings.Contains(urlStr, "?") {
						urlStr += "&" + query.Encode()
					} else {
						urlStr += "?" + query.Encode()
					}
				}

				req, _ := http.NewRequestWithContext(ctx, httpMethod, urlStr, bytes.NewBuffer(body))
				req.Header.Set("Content-Type", "application/json")
				req.Header.Set("User-Agent", "KendaliAI/1.0")

				if apiKey := os.Getenv(service + "_API_KEY"); apiKey != "" {
					req.Header.Set("Authorization", "Bearer "+apiKey)
				}

				resp, err := http.DefaultClient.Do(req)
				if err != nil {
					return fmt.Sprintf("API call failed: %v", err)
				}
				defer resp.Body.Close()

				respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
				return fmt.Sprintf(`{"status":%d,"body":%s}`, resp.StatusCode, string(respBody))
			},
		},
	}
}
