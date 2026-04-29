package agent

import (
	"crypto/sha256"
	"encoding/hex"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// WalkResult contains the current state of the filesystem for a backup path.
type WalkResult struct {
	// Changed contains files that need to be uploaded (new or modified).
	Changed []ManifestEntry
	// Unchanged contains files that match the previous manifest (skip upload).
	Unchanged []ManifestEntry
	// All contains every file scanned (for the final manifest).
	All []ManifestEntry
}

// NormalizePath converts an absolute path to a relative, forward-slash key
// suitable for storing in the NAS (and manifest).
// e.g. "C:\Users\Juan\file.txt" → "C/Users/Juan/file.txt"
//      "/home/juan/file.txt"    → "home/juan/file.txt"
func NormalizePath(absPath string) string {
	if runtime.GOOS == "windows" {
		// Replace backslashes
		p := strings.ReplaceAll(absPath, `\`, "/")
		// Remove drive letter colon: "C:/..." → "C/..."
		if len(p) >= 2 && p[1] == ':' {
			p = string(p[0]) + p[2:]
		}
		return strings.TrimLeft(p, "/")
	}
	return strings.TrimLeft(absPath, "/")
}

// WalkPath walks a directory tree and classifies each file as changed or unchanged
// relative to the previous manifest.
func WalkPath(root string, prevManifest map[string]ManifestEntry, vssTranslate func(string) string) (*WalkResult, error) {
	result := &WalkResult{}

	err := filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			// Skip unreadable files/dirs
			return nil
		}
		if d.IsDir() {
			return nil
		}

		info, err := d.Info()
		if err != nil {
			return nil
		}

		relPath := NormalizePath(path)
		mtime := info.ModTime().Unix()
		size := info.Size()

		// Fast check: if mtime and size match the previous manifest, skip hashing
		if prev, ok := prevManifest[relPath]; ok {
			if prev.Mtime == mtime && prev.Size == size {
				entry := ManifestEntry{
					Path:  relPath,
					Hash:  prev.Hash,
					Size:  size,
					Mtime: mtime,
				}
				result.Unchanged = append(result.Unchanged, entry)
				result.All = append(result.All, entry)
				return nil
			}
		}

		// File is new or modified — compute hash
		// On Windows, use VSS path for open-file access
		readPath := path
		if vssTranslate != nil {
			readPath = vssTranslate(path)
		}

		hash, err := hashFile(readPath)
		if err != nil {
			// Skip files we can't read (e.g. pagefile.sys)
			return nil
		}

		// If hash matches previous (size/mtime changed but content identical — e.g. touch), treat as unchanged
		if prev, ok := prevManifest[relPath]; ok && prev.Hash == hash {
			entry := ManifestEntry{Path: relPath, Hash: hash, Size: size, Mtime: mtime}
			result.Unchanged = append(result.Unchanged, entry)
			result.All = append(result.All, entry)
			return nil
		}

		entry := ManifestEntry{Path: relPath, Hash: hash, Size: size, Mtime: mtime}
		result.Changed = append(result.Changed, entry)
		result.All = append(result.All, entry)
		return nil
	})

	return result, err
}

func hashFile(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}
