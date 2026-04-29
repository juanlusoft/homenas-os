//go:build !windows

package svc

const ServiceName = "HomeNasAgent"

// Run is a no-op on non-Windows — process runs in foreground.
func Run() error {
	return nil
}

// IsService always returns false on non-Windows platforms.
func IsService() (bool, error) {
	return false, nil
}
