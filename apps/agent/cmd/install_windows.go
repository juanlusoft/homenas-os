//go:build windows

package cmd

import (
	"fmt"
	"os/exec"
	"time"

	"golang.org/x/sys/windows/svc/mgr"

	"homenas.io/agent/internal/svc"
)

func installWindows(exePath, nasURL, token string) error {
	m, err := mgr.Connect()
	if err != nil {
		return fmt.Errorf("connect to SCM: %w", err)
	}
	defer m.Disconnect()

	// Remove existing service if present
	if s, err := m.OpenService(svc.ServiceName); err == nil {
		s.Control(0x1) // stop
		time.Sleep(2 * time.Second)
		s.Delete()
		s.Close()
	}

	s, err := m.CreateService(svc.ServiceName, exePath, mgr.Config{
		StartType:   mgr.StartAutomatic,
		DisplayName: "HomeNas Active Backup Agent",
		Description: "Backs up this PC to HomeNas automatically. Managed by HomeNas OS.",
	}, "--run", "--nas", nasURL, "--token", token)
	if err != nil {
		return fmt.Errorf("create service: %w", err)
	}
	defer s.Close()

	// Set failure recovery: restart after 60s, always
	if err := s.SetRecoveryActions([]mgr.RecoveryAction{
		{Type: mgr.ServiceRestart, Delay: 60_000},
		{Type: mgr.ServiceRestart, Delay: 60_000},
		{Type: mgr.ServiceRestart, Delay: 60_000},
	}, 0); err != nil {
		// Non-fatal
		_ = err
	}

	return s.Start()
}

func uninstallWindows() error {
	m, err := mgr.Connect()
	if err != nil {
		return fmt.Errorf("connect to SCM: %w", err)
	}
	defer m.Disconnect()

	s, err := m.OpenService(svc.ServiceName)
	if err != nil {
		return fmt.Errorf("open service: %w", err)
	}
	defer s.Close()

	s.Control(0x1) // stop
	time.Sleep(2 * time.Second)
	return s.Delete()
}

func runCmd(name string, args ...string) error {
	return exec.Command(name, args...).Run()
}
