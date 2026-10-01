package config

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestConfigAtomicSaveAndPrivacy(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "config")
	t.Setenv("HOMENAS_CONFIG_DIR", dir)
	cfg := &Config{NasURL: "https://localhost", Token: "token", DeviceName: "test", BackupPaths: []string{"/data"}}
	if err := Save(cfg); err != nil {
		t.Fatal(err)
	}
	cfg.Token = "replacement"
	if err := Save(cfg); err != nil {
		t.Fatal(err)
	}
	restored, err := Load()
	if err != nil || restored.Token != cfg.Token {
		t.Fatalf("config roundtrip failed: %v %+v", err, restored)
	}
	if runtime.GOOS != "windows" {
		for path, mode := range map[string]os.FileMode{dir: 0700, configPath(): 0600} {
			info, err := os.Stat(path)
			if err != nil || info.Mode().Perm() != mode {
				t.Fatalf("insecure mode on %s: %v", path, err)
			}
		}
	}
	entries, err := os.ReadDir(dir)
	if err != nil || len(entries) != 1 {
		t.Fatal("temporary config leaked")
	}
}
