package agent

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"homenas.io/agent/internal/config"
	"homenas.io/agent/internal/vss"
)

// RunBackup performs a full backup cycle: VSS → walk → dedup check → upload → finalize.
func RunBackup(ctx context.Context, cfg *config.Config, client *NASClient) error {
	log.Println("[backup] starting backup")
	if len(cfg.BackupPaths) == 0 {
		return fmt.Errorf("no backup paths configured")
	}
	// Resolve relative paths before walking; NAS keys remain absolute-normalized.
	roots := make([]string, 0, len(cfg.BackupPaths))
	for _, path := range cfg.BackupPaths {
		root, err := filepath.Abs(path)
		if err != nil {
			return err
		}
		roots = append(roots, root)
	}

	// ── 1. Load previous manifest ──────────────────────────────────────────
	prevManifest, err := LoadManifest(config.Dir())
	if err != nil {
		log.Printf("[backup] warning: could not load previous manifest: %v", err)
		prevManifest = map[string]ManifestEntry{}
	}

	// ── 2. Begin session ───────────────────────────────────────────────────
	hostname, _ := os.Hostname()
	osType := runtime.GOOS
	if osType == "darwin" {
		osType = "mac"
	}

	sessionID, version, _, err := client.BeginSession(ctx, cfg.DeviceName, hostname, osType)
	if err != nil {
		return fmt.Errorf("begin session: %w", err)
	}
	log.Printf("[backup] session %s, version %s", sessionID, version)
	completed := false
	defer func() {
		if !completed {
			cleanupCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			if err := client.EndSession(cleanupCtx, sessionID, nil, 0, 0, "error", "Backup interrupted or incomplete"); err != nil {
				log.Printf("[backup] could not report failed session: %v", err)
			}
		}
	}()

	// ── 3. VSS snapshot (Windows only) ────────────────────────────────────
	// Collect unique volumes from backup paths
	volumes := uniqueVolumes(cfg.BackupPaths)
	snapshots := map[string]*vss.Snapshot{}

	if runtime.GOOS == "windows" {
		for _, vol := range volumes {
			snap, err := vss.Create(vol)
			if err != nil {
				log.Printf("[backup] VSS snapshot failed for %s: %v — will backup without snapshot", vol, err)
				continue
			}
			snapshots[strings.ToUpper(vol)] = snap
			log.Printf("[backup] VSS snapshot created for %s: %s", vol, snap.ID)
		}
		defer func() {
			for _, snap := range snapshots {
				snap.Delete()
			}
		}()
	}

	vssTranslate := func(path string) string {
		if runtime.GOOS != "windows" {
			return path
		}
		// Find which volume this path belongs to
		upper := strings.ToUpper(path)
		for vol, snap := range snapshots {
			if strings.HasPrefix(upper, strings.ToUpper(vol)) {
				return snap.TranslatePath(vol, path)
			}
		}
		return path // no snapshot for this volume
	}

	// ── 4. Walk filesystem ─────────────────────────────────────────────────
	var allEntries []ManifestEntry
	seen := map[string]bool{}

	for _, backupPath := range roots {
		log.Printf("[backup] walking %s", backupPath)
		result, err := WalkPath(backupPath, prevManifest, vssTranslate)
		if err != nil {
			return fmt.Errorf("walk %s: %w", backupPath, err)
		}
		for _, entry := range result.All {
			if !seen[entry.Path] {
				allEntries = append(allEntries, entry)
				seen[entry.Path] = true
			}
		}
		log.Printf("[backup] %s: %d total, %d changed, %d unchanged",
			backupPath, len(result.All), len(result.Changed), len(result.Unchanged))
	}

	// ── 5. Dedup check — ask NAS which files it already has ────────────────
	// Send all entries (including unchanged) so NAS can hardlink them
	alreadyHave := map[string]bool{}
	if len(allEntries) > 0 {
		// Send in batches of 1000 to avoid huge request bodies
		const batchSize = 1000
		for i := 0; i < len(allEntries); i += batchSize {
			end := i + batchSize
			if end > len(allEntries) {
				end = len(allEntries)
			}
			batch := allEntries[i:end]
			have, err := client.CheckFiles(ctx, sessionID, batch)
			if err != nil {
				return fmt.Errorf("file-check: %w", err)
			}
			for _, p := range have {
				alreadyHave[p] = true
			}
		}
		log.Printf("[backup] dedup: %d files already on NAS", len(alreadyHave))
	}

	// ── 6. Upload all files not present on NAS ─────────────────────────
	var totalBytes int64
	var uploadedBytes int64
	for _, entry := range allEntries {
		totalBytes += entry.Size
	}
	uploaded := 0

	for _, entry := range allEntries {
		if alreadyHave[entry.Path] {
			continue // NAS has it with same hash in a previous version
		}

		// Find original local path from normalized path
		localPath := denormalizePath(entry.Path)

		// Use VSS-translated path for reading
		readPath := vssTranslate(localPath)

		log.Printf("[backup] uploading %s (%d bytes)", entry.Path, entry.Size)
		if err := client.UploadFile(ctx, sessionID, readPath, entry.Path, entry); err != nil {
			return fmt.Errorf("upload %s: %w", entry.Path, err)
		}
		uploadedBytes += entry.Size
		uploaded++
	}

	log.Printf("[backup] uploaded %d files (%d bytes)", uploaded, uploadedBytes)

	// ── 7. Finalize ────────────────────────────────────────────────────────
	if err := client.EndSession(ctx, sessionID, allEntries, len(allEntries), totalBytes, "success", ""); err != nil {
		return fmt.Errorf("end session: %w", err)
	}

	completed = true

	// ── 8. Save updated manifest locally ──────────────────────────────────
	if err := SaveManifest(config.Dir(), allEntries); err != nil {
		return fmt.Errorf("save manifest: %w", err)
	}

	log.Printf("[backup] completed — version %s, %d files", version, len(allEntries))
	return nil
}

// uniqueVolumes extracts unique drive letters/volumes from a list of paths.
func uniqueVolumes(paths []string) []string {
	seen := map[string]bool{}
	var result []string
	for _, p := range paths {
		if runtime.GOOS == "windows" && len(p) >= 2 && p[1] == ':' {
			vol := strings.ToUpper(string(p[0])) + ":"
			if !seen[vol] {
				seen[vol] = true
				result = append(result, vol)
			}
		}
	}
	return result
}

// denormalizePath converts a normalized NAS path back to a local absolute path.
// e.g. "C/Users/Juan/file.txt" → "C:\Users\Juan\file.txt" on Windows
//
//	"home/juan/file.txt"    → "/home/juan/file.txt" on Linux
func denormalizePath(normalized string) string {
	if runtime.GOOS == "windows" {
		// "C/Users/..." → "C:\Users\..."
		if len(normalized) >= 2 && normalized[1] == '/' {
			drive := string(normalized[0])
			rest := strings.ReplaceAll(normalized[2:], "/", `\`)
			return drive + `:\` + rest
		}
		return strings.ReplaceAll(normalized, "/", `\`)
	}
	return "/" + normalized
}
