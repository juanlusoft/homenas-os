package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
)

// Config holds agent configuration persisted to disk.
type Config struct {
	NasURL         string   `json:"nas_url"`
	Token          string   `json:"token"`
	DeviceName     string   `json:"device_name"`
	BackupPaths    []string `json:"backup_paths"`
	TLSFingerprint string   `json:"tls_fingerprint_sha256,omitempty"`
	InsecureTLS    bool     `json:"insecure_tls,omitempty"`
	ScheduleCron   string   `json:"schedule_cron"` // empty = rely on NAS trigger via poll
}

// Dir returns the platform-appropriate config directory.
func Dir() string {
	if dir := os.Getenv("HOMENAS_CONFIG_DIR"); dir != "" {
		return dir
	}
	switch runtime.GOOS {
	case "windows":
		if data := os.Getenv("ProgramData"); data != "" {
			return filepath.Join(data, "HomeNas")
		}
		if appData := os.Getenv("APPDATA"); appData != "" {
			return filepath.Join(appData, "HomeNas")
		}
		return filepath.Join(os.Getenv("USERPROFILE"), "AppData", "Roaming", "HomeNas")
	case "darwin":
		home, _ := os.UserHomeDir()
		return filepath.Join(home, "Library", "Application Support", "HomeNas")
	default:
		home, _ := os.UserHomeDir()
		return filepath.Join(home, ".homenas")
	}
}

func configPath() string {
	return filepath.Join(Dir(), "config.json")
}

// Load reads config from disk. Returns empty config if file does not exist.
func Load() (*Config, error) {
	data, err := os.ReadFile(configPath())
	if os.IsNotExist(err) && runtime.GOOS != "windows" && os.Getenv("HOMENAS_CONFIG_DIR") == "" {
		// Newly installed privileged services use a stable OS directory, while
		// existing per-user CLI configurations remain the first lookup.
		data, err = os.ReadFile(filepath.Join(ServiceDir(), "config.json"))
	}
	if os.IsNotExist(err) && runtime.GOOS == "windows" && os.Getenv("HOMENAS_CONFIG_DIR") == "" {
		// Compatibility for pre-ProgramData agents run by the original user.
		// A reinstall saves this legacy configuration to the protected path.
		legacy := os.Getenv("APPDATA")
		if legacy == "" {
			legacy = filepath.Join(os.Getenv("USERPROFILE"), "AppData", "Roaming")
		}
		legacyPath := filepath.Join(legacy, "HomeNas", "config.json")
		if legacyPath != configPath() {
			data, err = os.ReadFile(legacyPath)
		}
	}
	if os.IsNotExist(err) {
		return &Config{}, nil
	}
	if err != nil {
		return nil, err
	}
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}

// Save writes config to disk.
func Save(cfg *Config) error {
	if err := os.MkdirAll(Dir(), 0o700); err != nil {
		return err
	}
	if err := ProtectDirectory(Dir()); err != nil {
		return err
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	file, err := os.CreateTemp(Dir(), ".config-*")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	if _, err = file.Write(data); err != nil {
		file.Close()
		return err
	}
	if err = file.Sync(); err != nil {
		file.Close()
		return err
	}
	if err = file.Close(); err != nil {
		return err
	}
	return os.Rename(file.Name(), configPath())
}

// ProtectDirectory is also used for the service executable placed with config.
func ProtectDirectory(path string) error {
	if err := os.MkdirAll(path, 0o700); err != nil {
		return err
	}
	info, err := os.Lstat(path)
	if err != nil {
		return err
	}
	if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return fmt.Errorf("configuration directory must not be a symlink: %s", path)
	}
	return protectConfigDirectory(path)
}

// ServiceDir is outside a user's Downloads/home so unprivileged users cannot
// replace a privileged service's executable by renaming a parent directory.
func ServiceDir() string {
	switch runtime.GOOS {
	case "windows":
		if data := os.Getenv("ProgramData"); data != "" {
			return filepath.Join(data, "HomeNas")
		}
		return `C:\ProgramData\HomeNas`
	case "darwin":
		return "/Library/Application Support/HomeNas"
	default:
		return "/etc/homenas"
	}
}
