package cmd

import (
	"fmt"
	"os"
	"runtime"
)

// InstallService installs the agent as a system service.
// On Windows: Windows Service via SCM.
// On Linux: systemd unit file.
// On macOS: launchd plist.
func InstallService(exePath, nasURL, token string) error {
	switch runtime.GOOS {
	case "windows":
		return installWindows(exePath, nasURL, token)
	case "linux":
		return installLinux(exePath, nasURL, token)
	case "darwin":
		return installMac(exePath, nasURL, token)
	default:
		return fmt.Errorf("unsupported OS: %s", runtime.GOOS)
	}
}

// UninstallService removes the agent service.
func UninstallService() error {
	switch runtime.GOOS {
	case "windows":
		return uninstallWindows()
	case "linux":
		return uninstallLinux()
	case "darwin":
		return uninstallMac()
	default:
		return fmt.Errorf("unsupported OS: %s", runtime.GOOS)
	}
}

// ── Linux (systemd) ───────────────────────────────────────────────────────────

func installLinux(exePath, nasURL, token string) error {
	// Token goes in a root-only EnvironmentFile so it doesn't leak through
	// the world-readable unit file (chmod 0644) or appear in `systemctl cat`
	// output for non-root users.
	if err := os.MkdirAll("/etc/homenas", 0o700); err != nil {
		return fmt.Errorf("mkdir /etc/homenas: %w", err)
	}
	envContent := fmt.Sprintf("HOMENAS_NAS_URL=%s\nHOMENAS_AGENT_TOKEN=%s\n", nasURL, token)
	if err := os.WriteFile("/etc/homenas/agent.env", []byte(envContent), 0o600); err != nil {
		return fmt.Errorf("write agent.env: %w", err)
	}
	if err := os.Chmod("/etc/homenas/agent.env", 0o600); err != nil {
		return fmt.Errorf("chmod agent.env: %w", err)
	}

	unit := fmt.Sprintf(`[Unit]
Description=HomeNas Active Backup Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
EnvironmentFile=/etc/homenas/agent.env
ExecStart=%s --run --nas ${HOMENAS_NAS_URL} --token ${HOMENAS_AGENT_TOKEN}
Restart=always
RestartSec=30
Environment=HOME=/root

[Install]
WantedBy=multi-user.target
`, exePath)

	if err := os.WriteFile("/etc/systemd/system/homenas-agent.service", []byte(unit), 0o644); err != nil {
		return fmt.Errorf("write systemd unit: %w", err)
	}
	// runCmd uses exec.Command which doesn't spawn a shell — `&&` was being
	// passed as a literal argument to systemctl. Split into two calls.
	if err := runCmd("systemctl", "daemon-reload"); err != nil {
		return fmt.Errorf("systemctl daemon-reload: %w", err)
	}
	return runCmd("systemctl", "enable", "--now", "homenas-agent")
}

func uninstallLinux() error {
	runCmd("systemctl", "stop", "homenas-agent")
	runCmd("systemctl", "disable", "homenas-agent")
	os.Remove("/etc/systemd/system/homenas-agent.service")
	return runCmd("systemctl", "daemon-reload")
}

// ── macOS (launchd) ───────────────────────────────────────────────────────────

func installMac(exePath, nasURL, token string) error {
	plist := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>io.homenas.agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>%s</string>
        <string>--run</string>
        <string>--nas</string>
        <string>%s</string>
        <string>--token</string>
        <string>%s</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/var/log/homenas-agent.log</string>
    <key>StandardErrorPath</key>
    <string>/var/log/homenas-agent.log</string>
</dict>
</plist>`, exePath, nasURL, token)

	plistPath := "/Library/LaunchDaemons/io.homenas.agent.plist"
	if err := os.WriteFile(plistPath, []byte(plist), 0o644); err != nil {
		return fmt.Errorf("write plist: %w", err)
	}
	return runCmd("launchctl", "load", "-w", plistPath)
}

func uninstallMac() error {
	plistPath := "/Library/LaunchDaemons/io.homenas.agent.plist"
	runCmd("launchctl", "unload", plistPath)
	return os.Remove(plistPath)
}

// ── Windows — no-op stubs on non-Windows (real impl in install_windows.go) ───

