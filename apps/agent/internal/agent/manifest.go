package agent

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// ManifestEntry represents one file in a backup snapshot.
type ManifestEntry struct {
	Path  string `json:"path"`  // normalized relative path (forward slashes, no leading /)
	Hash  string `json:"hash"`  // hex SHA-256
	Size  int64  `json:"size"`
	Mtime int64  `json:"mtime"` // unix seconds
}

func manifestPath(configDir string) string {
	return filepath.Join(configDir, "manifest.json")
}

// LoadManifest reads the local manifest from the previous backup.
// Returns an empty map if no manifest exists yet.
func LoadManifest(configDir string) (map[string]ManifestEntry, error) {
	data, err := os.ReadFile(manifestPath(configDir))
	if os.IsNotExist(err) {
		return map[string]ManifestEntry{}, nil
	}
	if err != nil {
		return nil, err
	}
	var entries []ManifestEntry
	if err := json.Unmarshal(data, &entries); err != nil {
		return nil, err
	}
	m := make(map[string]ManifestEntry, len(entries))
	for _, e := range entries {
		m[e.Path] = e
	}
	return m, nil
}

// SaveManifest writes the manifest for the just-completed backup.
func SaveManifest(configDir string, entries []ManifestEntry) error {
	if err := os.MkdirAll(configDir, 0o700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(entries, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(manifestPath(configDir), data, 0o600)
}
