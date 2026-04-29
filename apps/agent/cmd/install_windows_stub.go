//go:build !windows

package cmd

import "fmt"

func installWindows(exePath, nasURL, token string) error {
	return fmt.Errorf("Windows installation not supported on this platform")
}

func uninstallWindows() error {
	return fmt.Errorf("Windows uninstallation not supported on this platform")
}
