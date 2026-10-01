//go:build !windows

package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestReviewConfigRejectsSymlinkDirectoryBeforeChangingTarget(t *testing.T) {
	root := t.TempDir()
	target := filepath.Join(root, "unrelated")
	if err := os.Mkdir(target, 0755); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(root, "config")
	if err := os.Symlink(target, link); err != nil {
		t.Fatal(err)
	}
	t.Setenv("HOMENAS_CONFIG_DIR", link)
	if err := Save(&Config{Token: "review-token"}); err == nil {
		t.Fatal("configuration directory symlink accepted")
	}
	if _, err := os.Stat(filepath.Join(target, "config.json")); !os.IsNotExist(err) {
		t.Fatal("token written through directory symlink")
	}
	info, err := os.Stat(target)
	if err != nil || info.Mode().Perm() != 0755 {
		t.Fatal("unrelated symlink target permissions changed")
	}
}
