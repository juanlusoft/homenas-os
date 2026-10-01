package agent

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"homenas.io/agent/internal/config"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func entryFor(t *testing.T, path string) ManifestEntry {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	hash := sha256.Sum256(data)
	return ManifestEntry{Path: NormalizePath(path), Hash: hex.EncodeToString(hash[:]), Size: info.Size(), Mtime: info.ModTime().Unix()}
}

func TestUploadEmptyAndMultipleChunks(t *testing.T) {
	for _, size := range []int{0, 1, chunkSize, chunkSize + 1} {
		t.Run(fmt.Sprint(size), func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "data")
			data := make([]byte, size)
			if err := os.WriteFile(path, data, 0600); err != nil {
				t.Fatal(err)
			}
			entry := entryFor(t, path)
			received := 0
			chunks := 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Header.Get("X-Agent-Token") != "token" {
					t.Error("missing agent token")
				}
				reader, err := r.MultipartReader()
				if err != nil {
					t.Error(err)
					w.WriteHeader(400)
					return
				}
				for {
					p, err := reader.NextPart()
					if err == io.EOF {
						break
					}
					if err != nil {
						t.Error(err)
						break
					}
					b, _ := io.ReadAll(p)
					if p.FormName() == "data" {
						received += len(b)
						chunks++
					}
				}
				w.Write([]byte(`{"ok":true}`))
			}))
			defer server.Close()
			if err := NewNASClient(server.URL, "token").UploadFile(context.Background(), "session", path, entry.Path, entry); err != nil {
				t.Fatal(err)
			}
			expected := (size + chunkSize - 1) / chunkSize
			if expected == 0 {
				expected = 1
			}
			if received != size || chunks != expected {
				t.Fatalf("received %d bytes in %d chunks; expected %d/%d", received, chunks, size, expected)
			}
		})
	}
}

func TestUploadRejectsChangedSize(t *testing.T) {
	p := filepath.Join(t.TempDir(), "data")
	os.WriteFile(p, []byte("data"), 0600)
	entry := entryFor(t, p)
	entry.Size = 10
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { io.Copy(io.Discard, r.Body) }))
	defer srv.Close()
	if err := NewNASClient(srv.URL, "token").UploadFile(context.Background(), "id", p, entry.Path, entry); err == nil {
		t.Fatal("truncated file accepted")
	}
}

func TestWalkMissingRootSymlinkAndSameSecondChanges(t *testing.T) {
	root := t.TempDir()
	p := filepath.Join(root, "data")
	os.WriteFile(p, []byte("old"), 0600)
	prev := entryFor(t, p)
	os.WriteFile(p, []byte("new"), 0600)
	os.Chtimes(p, time.Unix(prev.Mtime, 0), time.Unix(prev.Mtime, 0))
	outside := filepath.Join(t.TempDir(), "secret")
	os.WriteFile(outside, []byte("secret"), 0600)
	os.Symlink(outside, filepath.Join(root, "escape"))
	result, err := WalkPath(root, map[string]ManifestEntry{prev.Path: prev}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.All) != 1 || len(result.Changed) != 1 || result.All[0].Hash == prev.Hash {
		t.Fatalf("walk lost change or followed symlink: %+v", result)
	}
	if _, err := WalkPath(filepath.Join(root, "missing"), nil, nil); err == nil {
		t.Fatal("missing root silently accepted")
	}
}

func TestBackupResendsUnchangedWhenNASMissingAndRejectsFailures(t *testing.T) {
	for _, failure := range []string{"", "check", "upload", "walk"} {
		t.Run(failure, func(t *testing.T) {
			cfgDir := t.TempDir()
			t.Setenv("HOMENAS_CONFIG_DIR", cfgDir)
			root := t.TempDir()
			p := filepath.Join(root, "file")
			os.WriteFile(p, []byte("important"), 0600)
			entry := entryFor(t, p)
			if err := SaveManifest(cfgDir, []ManifestEntry{entry}); err != nil {
				t.Fatal(err)
			}
			before, _ := os.ReadFile(manifestPath(cfgDir))
			uploads := 0
			endStatus := ""
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				switch r.URL.Path {
				case "/api/active-backup/agent/backup/begin":
					w.WriteHeader(201)
					w.Write([]byte(`{"session_id":"id","version":"v2","previous_version":"v1"}`))
				case "/api/active-backup/agent/backup/file-check":
					if failure == "check" {
						w.WriteHeader(500)
					} else {
						w.Write([]byte(`{"already_have":[]}`))
					}
				case "/api/active-backup/agent/backup/file":
					uploads++
					io.Copy(io.Discard, r.Body)
					if failure == "upload" {
						w.WriteHeader(500)
					} else {
						w.Write([]byte(`{"ok":true}`))
					}
				case "/api/active-backup/agent/backup/end":
					var body struct {
						Status string `json:"status"`
					}
					json.NewDecoder(r.Body).Decode(&body)
					endStatus = body.Status
					w.Write([]byte(`{"ok":true}`))
				default:
					t.Errorf("unexpected %s", r.URL.Path)
					w.WriteHeader(404)
				}
			}))
			defer server.Close()
			paths := []string{root}
			if failure == "walk" {
				paths = []string{filepath.Join(root, "missing")}
			}
			err := RunBackup(context.Background(), &config.Config{NasURL: server.URL, Token: "token", BackupPaths: paths}, NewNASClient(server.URL, "token"))
			if failure == "" {
				if err != nil || uploads != 1 || endStatus != "success" {
					t.Fatalf("unchanged missing backup not restored: %v uploads=%d status=%s", err, uploads, endStatus)
				}
			} else {
				if err == nil || endStatus != "error" {
					t.Fatalf("failure marked success: %v status=%s", err, endStatus)
				}
				after, _ := os.ReadFile(manifestPath(cfgDir))
				if string(before) != string(after) {
					t.Fatal("failed backup replaced manifest")
				}
			}
		})
	}
}

func TestTLSPinAndRedirectTokenProtection(t *testing.T) {
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.Write([]byte(`{"status":"waiting"}`)) }))
	defer srv.Close()
	if err := NewNASClient(srv.URL, "token").Heartbeat(context.Background()); err == nil {
		t.Fatal("untrusted self-signed cert accepted")
	}
	pin := CertificateFingerprint(srv.Certificate())
	if err := NewNASClientWithTrust(srv.URL, "token", pin, false).Heartbeat(context.Background()); err != nil {
		t.Fatal(err)
	}
	if err := NewNASClientWithTrust(srv.URL, "token", string(make([]byte, 64)), false).Heartbeat(context.Background()); err == nil {
		t.Fatal("wrong TLS pin accepted")
	}
	leaked := false
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { leaked = true }))
	defer target.Close()
	redirect := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.Redirect(w, r, target.URL, 302) }))
	defer redirect.Close()
	if err := NewNASClient(redirect.URL, "token").Heartbeat(context.Background()); err == nil || leaked {
		t.Fatal("redirect followed or secret leaked")
	}
}

func TestAgentConsumesNASBackupRequest(t *testing.T) {
	cfgDir := t.TempDir()
	t.Setenv("HOMENAS_CONFIG_DIR", cfgDir)
	source := t.TempDir()
	os.WriteFile(filepath.Join(source, "file"), []byte("data"), 0600)
	finished := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/active-backup/agent/poll":
			w.Write([]byte(`{"status":"backup","run_id":1}`))
		case "/api/active-backup/agent/backup/begin":
			w.WriteHeader(201)
			w.Write([]byte(`{"session_id":"id","version":"v1"}`))
		case "/api/active-backup/agent/backup/file-check":
			w.Write([]byte(`{"already_have":[]}`))
		case "/api/active-backup/agent/backup/file":
			io.Copy(io.Discard, r.Body)
			w.Write([]byte(`{"ok":true}`))
		case "/api/active-backup/agent/backup/end":
			finished = true
			w.Write([]byte(`{"ok":true}`))
		default:
			w.WriteHeader(404)
		}
	}))
	defer server.Close()
	a := New(&config.Config{NasURL: server.URL, Token: "token", BackupPaths: []string{source}})
	a.heartbeat(context.Background())
	if !finished {
		t.Fatal("NAS backup request was ignored")
	}
}
