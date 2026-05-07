package agent

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"strconv"
	"time"
)

const chunkSize = 4 * 1024 * 1024 // 4 MB

// NASClient handles HTTP communication with the NAS.
type NASClient struct {
	BaseURL string
	Token   string
	HTTP    *http.Client
}

func NewNASClient(baseURL, token string) *NASClient {
	// Self-signed cert from the NAS is accepted, but force at least TLS 1.2
	// (Go default still allows 1.0/1.1). TODO: pin the cert SHA-256 once the
	// installer publishes it alongside the token — until then this is the
	// minimum reasonable hardening.
	transport := &http.Transport{
		TLSClientConfig: &tls.Config{
			InsecureSkipVerify: true, //nolint:gosec
			MinVersion:         tls.VersionTLS12,
		},
	}
	return &NASClient{
		BaseURL: baseURL,
		Token:   token,
		// Hard timeout so a stuck/unreachable NAS doesn't hang uploads forever.
		HTTP: &http.Client{Transport: transport, Timeout: 60 * time.Second},
	}
}

func (c *NASClient) do(req *http.Request) (*http.Response, error) {
	req.Header.Set("X-Agent-Token", c.Token)
	return c.HTTP.Do(req)
}

func (c *NASClient) postJSON(ctx context.Context, path string, body interface{}) (*http.Response, error) {
	data, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.BaseURL+path, bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	return c.do(req)
}

// BeginSession starts a new backup session on the NAS.
func (c *NASClient) BeginSession(ctx context.Context, deviceName, hostname, osType string) (sessionID, version, prevVersion string, err error) {
	resp, err := c.postJSON(ctx, "/api/active-backup/agent/backup/begin", map[string]interface{}{
		"device_name": deviceName,
		"hostname":    hostname,
		"os_type":     osType,
	})
	if err != nil {
		return "", "", "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		return "", "", "", fmt.Errorf("begin session %d: %s", resp.StatusCode, body)
	}
	var result struct {
		SessionID       string `json:"session_id"`
		Version         string `json:"version"`
		PreviousVersion string `json:"previous_version"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", "", "", err
	}
	return result.SessionID, result.Version, result.PreviousVersion, nil
}

// CheckFiles asks the NAS which files it already has (for deduplication).
func (c *NASClient) CheckFiles(ctx context.Context, sessionID string, files []ManifestEntry) ([]string, error) {
	resp, err := c.postJSON(ctx, "/api/active-backup/agent/backup/file-check", map[string]interface{}{
		"session_id": sessionID,
		"files":      files,
	})
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("file-check %d: %s", resp.StatusCode, body)
	}
	var result struct {
		AlreadyHave []string `json:"already_have"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	return result.AlreadyHave, nil
}

// UploadFile sends a file to the NAS in 4MB chunks.
func (c *NASClient) UploadFile(ctx context.Context, sessionID, localPath, relPath string, entry ManifestEntry) error {
	f, err := os.Open(localPath)
	if err != nil {
		return fmt.Errorf("open %s: %w", localPath, err)
	}
	defer f.Close()

	// Ceiling division — handles size%chunkSize == 0 cleanly without the
	// previous "+1 then maybe undo" dance that was off-by-one for empty
	// files (we still need at least 1 chunk to write zero bytes).
	totalChunks := int((entry.Size + chunkSize - 1) / chunkSize)
	if totalChunks == 0 {
		totalChunks = 1
	}

	buf := make([]byte, chunkSize)
	for idx := 0; idx < totalChunks; idx++ {
		n, err := io.ReadFull(f, buf)
		if err != nil && err != io.ErrUnexpectedEOF && err != io.EOF {
			return fmt.Errorf("read chunk %d: %w", idx, err)
		}
		if n == 0 {
			break
		}

		if err := c.uploadChunk(ctx, sessionID, relPath, entry, idx, totalChunks, buf[:n]); err != nil {
			return fmt.Errorf("upload chunk %d/%d: %w", idx, totalChunks, err)
		}
	}
	return nil
}

func (c *NASClient) uploadChunk(ctx context.Context, sessionID, relPath string, entry ManifestEntry, chunkIdx, totalChunks int, data []byte) error {
	var body bytes.Buffer
	w := multipart.NewWriter(&body)

	_ = w.WriteField("session_id", sessionID)
	_ = w.WriteField("path", relPath)
	_ = w.WriteField("hash", entry.Hash)
	_ = w.WriteField("mtime", strconv.FormatInt(entry.Mtime, 10))
	_ = w.WriteField("size", strconv.FormatInt(entry.Size, 10))
	_ = w.WriteField("chunk_index", strconv.Itoa(chunkIdx))
	_ = w.WriteField("total_chunks", strconv.Itoa(totalChunks))

	fw, err := w.CreateFormFile("data", "chunk")
	if err != nil {
		return err
	}
	if _, err := fw.Write(data); err != nil {
		return err
	}
	w.Close()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		c.BaseURL+"/api/active-backup/agent/backup/file", &body)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", w.FormDataContentType())

	resp, err := c.do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("upload chunk %d: %d %s", chunkIdx, resp.StatusCode, b)
	}
	return nil
}

// EndSession finalizes the backup session and sends the full manifest.
func (c *NASClient) EndSession(ctx context.Context, sessionID string, manifest []ManifestEntry, filesCount int, sizeBytes int64, status, errMsg string) error {
	resp, err := c.postJSON(ctx, "/api/active-backup/agent/backup/end", map[string]interface{}{
		"session_id":    sessionID,
		"files_count":   filesCount,
		"size_bytes":    sizeBytes,
		"status":        status,
		"error_message": errMsg,
		"manifest":      manifest,
	})
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("end session %d: %s", resp.StatusCode, b)
	}
	return nil
}

// Heartbeat polls the NAS — keeps last_seen fresh. Token goes in the
// X-Agent-Token header (same as every other request) instead of a query
// string, so it doesn't end up in nginx/journald access logs on the NAS.
func (c *NASClient) Heartbeat(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		c.BaseURL+"/api/active-backup/agent/poll", nil)
	if err != nil {
		return err
	}
	resp, err := c.do(req)
	if err != nil {
		return err
	}
	resp.Body.Close()
	return nil
}

// Register registers this device with the NAS and returns the token.
func Register(ctx context.Context, baseURL, deviceName, hostname, osType string) (string, error) {
	client := &http.Client{
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{
				InsecureSkipVerify: true, //nolint:gosec
				MinVersion:         tls.VersionTLS12,
			},
		},
		Timeout: 30 * time.Second,
	}
	data, _ := json.Marshal(map[string]string{
		"name":     deviceName,
		"hostname": hostname,
		"os_type":  osType,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		baseURL+"/api/active-backup/agent/register", bytes.NewReader(data))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		b, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("register %d: %s", resp.StatusCode, b)
	}
	var result struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}
	return result.Token, nil
}
