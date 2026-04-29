//go:build windows

package svc

import (
	"context"
	"log"

	"golang.org/x/sys/windows/svc"

	"homenas.io/agent/internal/agent"
	"homenas.io/agent/internal/config"
)

const ServiceName = "HomeNasAgent"

type windowsService struct{}

func (ws *windowsService) Execute(args []string, r <-chan svc.ChangeRequest, s chan<- svc.Status) (bool, uint32) {
	s <- svc.Status{State: svc.StartPending}

	cfg, err := config.Load()
	if err != nil {
		log.Printf("[svc] failed to load config: %v", err)
		return false, 1
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	a := agent.New(cfg)

	s <- svc.Status{State: svc.Running, Accepts: svc.AcceptStop | svc.AcceptShutdown}

	go a.Run(ctx)

	for c := range r {
		switch c.Cmd {
		case svc.Stop, svc.Shutdown:
			s <- svc.Status{State: svc.StopPending}
			cancel()
			return false, 0
		}
	}
	return false, 0
}

// Run starts the process as a Windows Service.
func Run() error {
	return svc.Run(ServiceName, &windowsService{})
}

// IsService returns true if the process is running as a Windows Service.
func IsService() (bool, error) {
	return svc.IsWindowsService()
}
