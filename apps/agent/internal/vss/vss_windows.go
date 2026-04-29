//go:build windows

package vss

import (
	"fmt"
	"os/exec"
	"regexp"
	"strings"
)

// Snapshot represents an active VSS shadow copy.
type Snapshot struct {
	ID         string
	DevicePath string // \\?\GLOBALROOT\Device\HarddiskVolumeShadowCopyN
}

// Create creates a VSS snapshot for the given volume (e.g. "C:").
// Uses wmic to avoid COM interop complexity.
func Create(volume string) (*Snapshot, error) {
	// Ensure volume ends with backslash
	vol := strings.TrimRight(volume, `\/`) + `\`

	out, err := exec.Command("wmic", "shadowcopy", "call", "create",
		fmt.Sprintf(`Volume=%s`, vol)).Output()
	if err != nil {
		return nil, fmt.Errorf("wmic create snapshot: %w", err)
	}

	// Parse shadow ID from output like: ShadowID = "{GUID}";
	re := regexp.MustCompile(`ShadowID\s*=\s*"(\{[^}]+\})"`)
	matches := re.FindStringSubmatch(string(out))
	if len(matches) < 2 {
		return nil, fmt.Errorf("could not parse ShadowID from: %s", string(out))
	}
	id := matches[1]

	// Get device path
	devOut, err := exec.Command("wmic", "shadowcopy", "where",
		fmt.Sprintf(`ID='%s'`, id), "get", "DeviceObject", "/value").Output()
	if err != nil {
		return nil, fmt.Errorf("wmic get device: %w", err)
	}

	reDev := regexp.MustCompile(`DeviceObject=(.+)`)
	devMatches := reDev.FindStringSubmatch(strings.TrimSpace(string(devOut)))
	if len(devMatches) < 2 {
		return nil, fmt.Errorf("could not parse DeviceObject from: %s", string(devOut))
	}
	devicePath := strings.TrimSpace(devMatches[1])

	return &Snapshot{ID: id, DevicePath: devicePath}, nil
}

// Delete removes the VSS snapshot.
func (s *Snapshot) Delete() {
	exec.Command("wmic", "shadowcopy", "where",
		fmt.Sprintf(`ID='%s'`, s.ID), "delete").Run()
}

// TranslatePath maps an original path to its shadow copy equivalent.
// e.g. "C:\Users\Juan\file.txt" → "\\?\GLOBALROOT\Device\HarddiskVolumeShadowCopyN\Users\Juan\file.txt"
func (s *Snapshot) TranslatePath(volume, origPath string) string {
	// Strip volume prefix (e.g. "C:") and replace with shadow device path
	vol := strings.TrimRight(volume, `\/`)
	rel := strings.TrimPrefix(origPath, vol)
	rel = strings.TrimLeft(rel, `\/`)
	return s.DevicePath + `\` + rel
}
