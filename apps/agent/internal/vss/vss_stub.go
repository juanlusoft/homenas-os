//go:build !windows

package vss

// Snapshot is a no-op on non-Windows platforms.
type Snapshot struct {
	ID         string
	DevicePath string
}

// Create is a no-op on non-Windows — returns a dummy snapshot.
func Create(volume string) (*Snapshot, error) {
	return &Snapshot{ID: "", DevicePath: volume}, nil
}

// Delete is a no-op.
func (s *Snapshot) Delete() {}

// TranslatePath returns the original path unchanged on non-Windows.
func (s *Snapshot) TranslatePath(volume, origPath string) string {
	return origPath
}
