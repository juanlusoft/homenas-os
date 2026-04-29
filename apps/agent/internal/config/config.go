package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
)

// Config holds agent configuration persisted to disk.
type Config struct {
	NasURL       string   `json:"nas_url"`
	Token        string   `json:"token"`
	DeviceName   string   `json:"device_name"`
	BackupPaths  []string `json:"backup_paths"`
	ScheduleCron string   `json:"schedule_cron"` // empty = rely on NAS trigger via poll
}

// Dir returns the platform-appropriate config directory.
func Dir() string {
	switch runtime.GOOS {
	case "windows":
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
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(configPath(), data, 0o600)
}
