package cmd

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestReviewWindowsUpgradeUsesDifferentProtectedExecutable(t *testing.T) {
	dir := t.TempDir()
	source := filepath.Join(dir, "source")
	installedDir := filepath.Join(dir, "private")
	if err := os.WriteFile(source, []byte("version-one"), 0700); err != nil {
		t.Fatal(err)
	}
	old, err := installExecutable(source, installedDir, true)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(source, []byte("version-two"), 0700); err != nil {
		t.Fatal(err)
	}
	next, err := installExecutable(source, installedDir, true)
	if err != nil {
		t.Fatal(err)
	}
	if next == old || !strings.HasSuffix(next, ".exe") {
		t.Fatal("Windows upgrade would replace running executable")
	}
	prior, err := os.ReadFile(old)
	if err != nil || string(prior) != "version-one" {
		t.Fatal("upgrade overwrote old executable")
	}
	again, err := installExecutable(source, installedDir, true)
	if err != nil || again != next {
		t.Fatal("identical executable not reused")
	}
}
