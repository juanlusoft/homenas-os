package cmd

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestInstallExecutableCopiesToPrivateStableDirectory(t *testing.T) {
	downloads := t.TempDir()
	source := filepath.Join(downloads, "downloaded-agent")
	os.WriteFile(source, []byte("executable-test-content"), 0755)
	protected := filepath.Join(t.TempDir(), "private")
	installed, err := installExecutable(source, protected, false)
	if err != nil {
		t.Fatal(err)
	}
	os.RemoveAll(downloads)
	content, err := os.ReadFile(installed)
	if err != nil || string(content) != "executable-test-content" {
		t.Fatalf("service depends on downloads: %v", err)
	}
	if runtime.GOOS != "windows" {
		info, _ := os.Stat(installed)
		if info.Mode().Perm() != 0700 {
			t.Fatal("executable not private")
		}
	}
	if same, err := installExecutable(installed, protected, false); err != nil || same != installed {
		t.Fatalf("same path failed: %v", err)
	}
	os.WriteFile(source, []byte("missing-parent"), 0755)
	if _, err := installExecutable(source, protected, false); err == nil {
		t.Fatal("missing source accepted")
	}
	content, _ = os.ReadFile(installed)
	if string(content) != "executable-test-content" {
		t.Fatal("failed upgrade destroyed installed executable")
	}
}
