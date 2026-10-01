//go:build windows

package cmd

import (
	"fmt"
	"os/exec"
	"time"

	"golang.org/x/sys/windows"
	winsvc "golang.org/x/sys/windows/svc"
	"golang.org/x/sys/windows/svc/mgr"

	"homenas.io/agent/internal/svc"
)

func installWindows(exePath, nasURL, token string) error {
	m, err := mgr.Connect()
	if err != nil {
		return fmt.Errorf("connect to SCM: %w", err)
	}
	defer m.Disconnect()

	// Wait for SCM to stop the old instance and release its service record;
	// an arbitrary two-second sleep races slow backups and service deletion.
	if previous, err := m.OpenService(svc.ServiceName); err == nil {
		status, err := previous.Query()
		if err != nil {
			previous.Close()
			return err
		}
		if status.State != winsvc.Stopped {
			if _, err := previous.Control(winsvc.Stop); err != nil && err != windows.ERROR_SERVICE_NOT_ACTIVE {
				previous.Close()
				return err
			}
			deadline := time.Now().Add(30 * time.Second)
			for status.State != winsvc.Stopped {
				if time.Now().After(deadline) {
					previous.Close()
					return fmt.Errorf("previous agent service did not stop")
				}
				time.Sleep(100 * time.Millisecond)
				status, err = previous.Query()
				if err != nil {
					previous.Close()
					return err
				}
			}
		}
		if err := previous.Delete(); err != nil {
			previous.Close()
			return err
		}
		previous.Close()
		deadline := time.Now().Add(10 * time.Second)
		for {
			check, err := m.OpenService(svc.ServiceName)
			if err == windows.ERROR_SERVICE_DOES_NOT_EXIST {
				break
			}
			if check != nil {
				check.Close()
			}
			if err != nil && err != windows.ERROR_SERVICE_MARKED_FOR_DELETE {
				return err
			}
			if time.Now().After(deadline) {
				return fmt.Errorf("previous agent service deletion is still pending")
			}
			time.Sleep(100 * time.Millisecond)
		}
	} else if err != windows.ERROR_SERVICE_DOES_NOT_EXIST {
		return err
	}

	s, err := m.CreateService(svc.ServiceName, exePath, mgr.Config{
		StartType:   mgr.StartAutomatic,
		DisplayName: "HomeNas Active Backup Agent",
		Description: "Backs up this PC to HomeNas automatically. Managed by HomeNas OS.",
	}, "--run")
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
