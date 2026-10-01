package cmd

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/xml"
	"fmt"
	"homenas.io/agent/internal/config"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// InstallService installs the agent as a system service.
// On Windows: Windows Service via SCM.
// On Linux: systemd unit file.
// On macOS: launchd plist.
func InstallService(exePath, nasURL, token string) error {
	installedPath, err := installExecutable(exePath, config.Dir(), runtime.GOOS == "windows")
	if err != nil {
		return err
	}
	exePath = installedPath
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
	// Config contains the token; do not duplicate secrets into arguments or
	// world-readable service definitions. Use the exact directory saved by CLI.
	if strings.ContainsAny(exePath+config.Dir(), "\r\n") {
		return fmt.Errorf("invalid service path")
	}

	unit := fmt.Sprintf(`[Unit]
Description=HomeNas Active Backup Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
Environment="HOMENAS_CONFIG_DIR=%s"
ExecStart="%s" --run
Restart=always
RestartSec=30
Environment=HOME=/root

[Install]
WantedBy=multi-user.target
`, systemdEscape(config.Dir()), systemdEscape(exePath))

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
    </array>
    <key>EnvironmentVariables</key>
    <dict><key>HOMENAS_CONFIG_DIR</key><string>%s</string></dict>

    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/var/log/homenas-agent.log</string>
    <key>StandardErrorPath</key>
    <string>/var/log/homenas-agent.log</string>
</dict>
</plist>`, xmlEscape(exePath), xmlEscape(config.Dir()))

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

func systemdEscape(value string) string {
	return strings.NewReplacer("\\", "\\\\", "\"", "\\\"", "%", "%%", "$", "$$").Replace(value)
}

func xmlEscape(value string) string {
	var buffer bytes.Buffer
	_ = xml.EscapeText(&buffer, []byte(value))
	return buffer.String()
}

// A root/SYSTEM service must not execute the user-writable Downloads/ZIP copy.
func installExecutable(source, directory string, windowsBinary bool) (string, error) {
	if err := config.ProtectDirectory(directory); err != nil {
		return "", err
	}
	sourceAbs, err := filepath.Abs(source)
	if err != nil {
		return "", err
	}
	input, err := os.Open(sourceAbs)
	if err != nil {
		return "", err
	}
	defer input.Close()
	output, err := os.CreateTemp(directory, ".agent-*")
	if err != nil {
		return "", err
	}
	defer os.Remove(output.Name())
	hasher := sha256.New()
	if _, err := io.Copy(io.MultiWriter(output, hasher), input); err != nil {
		output.Close()
		return "", err
	}
	if err := output.Chmod(0o700); err != nil {
		output.Close()
		return "", err
	}
	if err := output.Sync(); err != nil {
		output.Close()
		return "", err
	}
	if err := output.Close(); err != nil {
		return "", err
	}
	// Versioned filenames permit Windows upgrades while the old executable is
	// still locked by SCM. Existing identical binaries can be reused safely.
	filename := "homenas-agent-" + hex.EncodeToString(hasher.Sum(nil))
	if windowsBinary {
		filename += ".exe"
	}
	destination := filepath.Join(directory, filename)
	destAbs, err := filepath.Abs(destination)
	if err != nil {
		return "", err
	}
	if existing, err := os.ReadFile(destination); err == nil {
		checksum := sha256.Sum256(existing)
		if hex.EncodeToString(checksum[:]) != hex.EncodeToString(hasher.Sum(nil)) {
			return "", fmt.Errorf("installed executable checksum mismatch")
		}
		return destAbs, nil
	} else if !os.IsNotExist(err) {
		return "", err
	}
	if err := os.Rename(output.Name(), destination); err != nil {
		return "", err
	}
	return destAbs, nil
}
