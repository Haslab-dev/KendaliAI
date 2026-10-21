package acp

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os/exec"
	"sync"
)

// Client is one spawned agent process speaking JSON-RPC 2.0 over stdio.
type Client struct {
	cmd    *exec.Cmd
	stdin  io.WriteCloser
	stdout *bufio.Scanner

	mu      sync.Mutex // guards writes + nextID + pending map
	nextID  int64
	pending map[int64]chan rpcResponse

	// onNotify receives server→client notifications ("session/update", ...).
	onNotify func(method string, params json.RawMessage)
	// onRequest receives server→client requests ("session/request_permission")
	// and must return the result object (or an error).
	onRequest func(id int64, method string, params json.RawMessage) (interface{}, error)
	// onExit fires once when the process ends.
	onExit func(err error)
	// onStream receives stream-json events (e.g. agy "step_update" or "init").
	onStream func(event string, raw []byte)

	exited  chan struct{}
	exitErr error
}

// Start spawns the agent command and begins serving its stdio pipes. The
// process is bound to ctx: cancelling it kills the agent.
func Start(ctx context.Context, command string, args []string, cwd string) (*Client, error) {
	if resolved, err := resolveExecutablePath(command); err == nil {
		command = resolved
	}
	cmd := exec.CommandContext(ctx, command, args...)
	if cwd != "" {
		cmd.Dir = cwd
	}
	// Force unbuffered/color-free output where the agent honors it with enriched PATH.
	cmd.Env = enrichedEnv([]string{"NO_COLOR=1", "TERM=dumb"})
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, fmt.Errorf("acp: stdin pipe: %w", err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("acp: stdout pipe: %w", err)
	}
	cmd.Stderr = io.Discard

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("acp: spawn %s: %w", command, err)
	}

	c := &Client{
		cmd:     cmd,
		stdin:   stdin,
		stdout:  bufio.NewScanner(stdout),
		pending: make(map[int64]chan rpcResponse),
		exited:  make(chan struct{}),
	}
	// Line-oriented ACP messages can be large (whole-file diffs): grow the
	// scan buffer to 32MB via the Scanner.Buffer API.
	c.stdout.Buffer(make([]byte, 0, 1024*1024), 32*1024*1024)

	go c.readLoop()
	go c.waitLoop()

	return c, nil
}

// SetHandlers installs the notification/request callbacks (call before the
// first round-trip; typically immediately after Start).
func (c *Client) SetHandlers(onNotify func(string, json.RawMessage), onRequest func(int64, string, json.RawMessage) (interface{}, error), onExit func(error)) {
	c.onNotify = onNotify
	c.onRequest = onRequest
	c.onExit = onExit
}

// SetStreamHandler installs the stream-json callback for non-JSON-RPC stream events.
func (c *Client) SetStreamHandler(onStream func(string, []byte)) {
	c.onStream = onStream
}

// WriteRaw writes raw bytes directly with a trailing newline (used by stream-json agents like agy).
func (c *Client) WriteRaw(data []byte) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	_, err := c.stdin.Write(append(data, '\n'))
	return err
}

// Call sends a request and blocks for its response, decoding into result.
func (c *Client) Call(method string, params interface{}, result interface{}) error {
	c.mu.Lock()
	c.nextID++
	id := c.nextID
	ch := make(chan rpcResponse, 1)
	c.pending[id] = ch
	c.mu.Unlock()

	if err := c.write(rpcRequest{JSONRPC: "2.0", ID: &id, Method: method, Params: params}); err != nil {
		c.mu.Lock()
		delete(c.pending, id)
		c.mu.Unlock()
		return fmt.Errorf("acp: %s write: %w", method, err)
	}

	select {
	case <-c.exited:
		return fmt.Errorf("acp: %s: agent process exited: %v", method, c.exitErr)
	case resp, ok := <-ch:
		if !ok {
			return fmt.Errorf("acp: %s: agent process exited: %v", method, c.exitErr)
		}
		if resp.Error != nil {
			return fmt.Errorf("acp: %s: %s", method, resp.Error.Message)
		}
		if result != nil && len(resp.Result) > 0 {
			if err := json.Unmarshal(resp.Result, result); err != nil {
				return fmt.Errorf("acp: %s decode: %w", method, err)
			}
		}
		return nil
	}
}

// Notify sends a notification (no id, no response expected).
func (c *Client) Notify(method string, params interface{}) error {
	return c.write(rpcNotification{JSONRPC: "2.0", Method: method, Params: params})
}

func (c *Client) write(v interface{}) error {
	data, err := json.Marshal(v)
	if err != nil {
		return err
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	_, err = c.stdin.Write(append(data, '\n'))
	return err
}

// respond sends the reply to a server→client request.
func (c *Client) respond(id int64, result interface{}, rpcErr *rpcError) {
	resp := rpcResponse{JSONRPC: "2.0", ID: &id, Result: json.RawMessage("null"), Error: rpcErr}
	if result != nil {
		if data, err := json.Marshal(result); err == nil {
			resp.Result = data
		}
	}
	_ = c.write(resp)
}

func (c *Client) readLoop() {
	for c.stdout.Scan() {
		line := c.stdout.Bytes()
		if len(line) == 0 {
			continue
		}

		var generic map[string]interface{}
		if err := json.Unmarshal(line, &generic); err != nil {
			continue // tolerate non-JSON noise on stdout
		}

		// Stream-JSON events (e.g. Google Antigravity agy: "event", Claude stream-json: "type")
		if eventVal, ok := generic["event"].(string); ok && eventVal != "" {
			if c.onStream != nil {
				c.onStream(eventVal, line)
			}
			continue
		}
		if typeVal, ok := generic["type"].(string); ok && typeVal != "" {
			if typeVal == "system" || typeVal == "assistant" || typeVal == "content_block_delta" || typeVal == "result" {
				if c.onStream != nil {
					c.onStream(typeVal, line)
				}
				continue
			}
		}

		var base struct {
			ID     *int64          `json:"id"`
			Method string          `json:"method"`
			Result json.RawMessage `json:"result"`
			Error  *rpcError       `json:"error"`
			Params json.RawMessage `json:"params"`
		}
		_ = json.Unmarshal(line, &base)

		switch {
		case base.Method != "" && base.ID != nil:
			// Server→client request (e.g. session/request_permission).
			if c.onRequest != nil {
				go func(id int64, method string, params json.RawMessage) {
					result, err := c.onRequest(id, method, params)
					if err != nil {
						c.respond(id, nil, &rpcError{Code: -32603, Message: err.Error()})
					} else {
						c.respond(id, result, nil)
					}
				}(*base.ID, base.Method, base.Params)
			} else {
				c.respond(*base.ID, nil, &rpcError{Code: -32601, Message: "method not supported"})
			}
		case base.Method != "":
			if c.onNotify != nil {
				c.onNotify(base.Method, base.Params)
			}
		case base.ID != nil:
			c.mu.Lock()
			ch, ok := c.pending[*base.ID]
			if ok {
				delete(c.pending, *base.ID)
			}
			c.mu.Unlock()
			if ok {
				ch <- rpcResponse{JSONRPC: "2.0", ID: base.ID, Result: base.Result, Error: base.Error}
			}
		}
	}
}

func (c *Client) waitLoop() {
	err := c.cmd.Wait()
	c.exitErr = err
	c.mu.Lock()
	for id, ch := range c.pending {
		close(ch)
		delete(c.pending, id)
	}
	c.mu.Unlock()
	close(c.exited)
	if c.onExit != nil {
		c.onExit(err)
	}
}

// Kill terminates the agent process.
func (c *Client) Kill() {
	if c.cmd.Process != nil {
		_ = c.cmd.Process.Kill()
	}
}
