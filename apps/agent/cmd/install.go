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
	unit := fmt.Sprintf(`[Unit]
Description=HomeNas Active Backup Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=%s --run --nas %s --token %s
Restart=always
RestartSec=30
Environment=HOME=/root

[Install]
WantedBy=multi-user.target
`, exePath, nasURL, token)

	if err := os.WriteFile("/etc/systemd/system/homenas-agent.service", []byte(unit), 0o644); err != nil {
		return fmt.Errorf("write systemd unit: %w", err)
	}
	return runCmd("systemctl", "daemon-reload", "&&", "systemctl", "enable", "--now", "homenas-agent")
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

