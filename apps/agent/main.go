package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"

	agentpkg "homenas.io/agent/internal/agent"
	"homenas.io/agent/internal/config"
	"homenas.io/agent/internal/svc"
	"homenas.io/agent/cmd"
)

func main() {
	var (
		install   = flag.Bool("install", false, "Install as system service")
		uninstall = flag.Bool("uninstall", false, "Uninstall system service")
		run       = flag.Bool("run", false, "Run agent (used internally by service)")
		backup    = flag.Bool("backup", false, "Trigger a backup immediately and exit")
		nasURL    = flag.String("nas", "", "NAS base URL (e.g. https://192.168.1.101)")
		token     = flag.String("token", "", "Pre-approved device token (optional)")
		name      = flag.String("name", "", "Device name (default: hostname)")
		paths     = flag.String("paths", "", "Comma-separated backup paths (e.g. C:\\Users,D:\\Projects)")
	)
	flag.Parse()

	// Default device name to hostname
	if *name == "" {
		h, _ := os.Hostname()
		*name = h
	}

	switch {
	case *install:
		if err := doInstall(*nasURL, *token, *name, *paths); err != nil {
			fmt.Fprintf(os.Stderr, "install failed: %v\n", err)
			os.Exit(1)
		}
		fmt.Println("HomeNas Agent installed and started successfully.")
		fmt.Println("The device will appear as 'pending' in the HomeNas dashboard.")
		fmt.Println("An admin must approve it before backups start.")

	case *uninstall:
		if err := cmd.UninstallService(); err != nil {
			fmt.Fprintf(os.Stderr, "uninstall failed: %v\n", err)
			os.Exit(1)
		}
		fmt.Println("HomeNas Agent uninstalled.")

	case *backup:
		cfg, err := config.Load()
		if err != nil || cfg.Token == "" {
			fmt.Fprintln(os.Stderr, "not configured — run --install first")
			os.Exit(1)
		}
		client := agentpkg.NewNASClient(cfg.NasURL, cfg.Token)
		ctx := context.Background()
		if err := agentpkg.RunBackup(ctx, cfg, client); err != nil {
			fmt.Fprintf(os.Stderr, "backup failed: %v\n", err)
			os.Exit(1)
		}

	case *run:
		runAgent()

	default:
		// When invoked with no flags and running as Windows Service, behave as --run
		if isWindowsService, _ := svc.IsService(); isWindowsService {
			if err := svc.Run(); err != nil {
				log.Fatalf("service failed: %v", err)
			}
			return
		}

		// When invoked with no flags: look for homenas-agent.json next to the exe
		if err := autoInstall(); err != nil {
			showError(fmt.Sprintf("Error de instalación:\n\n%v\n\n¿Estás ejecutando como Administrador?", err))
			os.Exit(1)
		}
	}
}

func doInstall(nasURL, token, name, pathsFlag string) error {
	if nasURL == "" {
		return fmt.Errorf("--nas is required")
	}

	// Register with NAS if no token provided
	if token == "" {
		hostname, _ := os.Hostname()
		osType := runtime.GOOS
		if osType == "darwin" {
			osType = "mac"
		}
		ctx := context.Background()
		var err error
		token, err = agentpkg.Register(ctx, nasURL, name, hostname, osType)
		if err != nil {
			return fmt.Errorf("register with NAS: %w", err)
		}
		fmt.Printf("Registered with NAS. Token: %s\n", token)
	}

	// Parse backup paths
	var backupPaths []string
	if pathsFlag != "" {
		for _, p := range strings.Split(pathsFlag, ",") {
			p = strings.TrimSpace(p)
			if p != "" {
				backupPaths = append(backupPaths, p)
			}
		}
	} else {
		// Default backup paths per OS
		switch runtime.GOOS {
		case "windows":
			backupPaths = []string{`C:\Users`}
		case "darwin":
			home, _ := os.UserHomeDir()
			backupPaths = []string{home}
		default:
			home, _ := os.UserHomeDir()
			backupPaths = []string{home}
		}
	}

	// Save config
	cfg := &config.Config{
		NasURL:      nasURL,
		Token:       token,
		DeviceName:  name,
		BackupPaths: backupPaths,
	}
	if err := config.Save(cfg); err != nil {
		return fmt.Errorf("save config: %w", err)
	}

	// Get executable path
	exePath, err := filepath.Abs(os.Args[0])
	if err != nil {
		exePath = os.Args[0]
	}

	return cmd.InstallService(exePath, nasURL, token)
}

// autoInstall reads homenas-agent.json from the same directory as the exe
// and silently installs the agent as a service.
func autoInstall() error {
	exePath, err := filepath.Abs(os.Args[0])
	if err != nil {
		return fmt.Errorf("no se pudo obtener la ruta del ejecutable: %w", err)
	}
	exeDir := filepath.Dir(exePath)
	cfgPath := filepath.Join(exeDir, "homenas-agent.json")

	data, err := os.ReadFile(cfgPath)
	if err != nil {
		return fmt.Errorf("no se encontró homenas-agent.json junto al ejecutable.\n\nDescarga el paquete desde la UI del NAS en Ajustes → Active Backup → Añadir dispositivo")
	}

	var bundled struct {
		NasURL      string   `json:"nas_url"`
		Token       string   `json:"token"`
		DeviceName  string   `json:"device_name"`
		BackupPaths []string `json:"backup_paths"`
		ScheduleCron string  `json:"schedule_cron"`
	}
	if err := json.Unmarshal(data, &bundled); err != nil {
		return fmt.Errorf("homenas-agent.json inválido: %w", err)
	}
	if bundled.NasURL == "" || bundled.Token == "" {
		return fmt.Errorf("homenas-agent.json incompleto: faltan nas_url o token")
	}

	// Save config to the OS config dir
	cfg := &config.Config{
		NasURL:       bundled.NasURL,
		Token:        bundled.Token,
		DeviceName:   bundled.DeviceName,
		BackupPaths:  bundled.BackupPaths,
		ScheduleCron: bundled.ScheduleCron,
	}
	if err := config.Save(cfg); err != nil {
		return fmt.Errorf("no se pudo guardar la configuración: %w", err)
	}

	return cmd.InstallService(exePath, bundled.NasURL, bundled.Token)
}

func runAgent() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("[main] load config: %v", err)
	}
	if cfg.Token == "" {
		log.Fatal("[main] no token configured — run --install first")
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	a := agentpkg.New(cfg)
	a.Run(ctx)
}
