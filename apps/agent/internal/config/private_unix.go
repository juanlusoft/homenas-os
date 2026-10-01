//go:build !windows

package config

import "os"

func protectConfigDirectory(path string) error {
	if os.Geteuid() == 0 {
		if err := os.Chown(path, 0, 0); err != nil {
			return err
		}
	}
	return os.Chmod(path, 0o700)
}
