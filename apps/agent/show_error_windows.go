//go:build windows

package main

import (
	"golang.org/x/sys/windows"
)

func showError(msg string) {
	title, _ := windows.UTF16PtrFromString("HomeNas Agent — Error")
	text, _ := windows.UTF16PtrFromString(msg)
	windows.MessageBox(0, text, title, windows.MB_ICONERROR|windows.MB_OK)
}
