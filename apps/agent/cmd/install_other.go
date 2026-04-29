//go:build !windows

package cmd

import "os/exec"

func runCmd(name string, args ...string) error {
	return exec.Command(name, args...).Run()
}
