package agent

import (
	"context"
	"log"
	"time"

	"homenas.io/agent/internal/config"
)

// Agent is the main long-running agent process.
type Agent struct {
	cfg    *config.Config
	client *NASClient
}

// New creates an Agent from the given config.
func New(cfg *config.Config) *Agent {
	return &Agent{
		cfg:    cfg,
		client: NewNASClient(cfg.NasURL, cfg.Token),
	}
}

// Run starts the agent loop: heartbeat every 30s, backup on schedule.
func (a *Agent) Run(ctx context.Context) {
	log.Printf("[agent] starting — NAS: %s, device: %s", a.cfg.NasURL, a.cfg.DeviceName)

	// Initial heartbeat
	a.heartbeat(ctx)

	heartbeatTick := time.NewTicker(30 * time.Second)
	defer heartbeatTick.Stop()

	// Schedule-based backup (if configured)
	var backupTick <-chan time.Time
	if a.cfg.ScheduleCron != "" {
		// Simple daily fallback — for cron parsing use robfig/cron in a full impl
		backupTick = time.NewTicker(24 * time.Hour).C
	}

	for {
		select {
		case <-ctx.Done():
			log.Println("[agent] shutting down")
			return

		case <-heartbeatTick.C:
			a.heartbeat(ctx)

		case <-backupTick:
			log.Println("[agent] scheduled backup triggered")
			if err := RunBackup(ctx, a.cfg, a.client); err != nil {
				log.Printf("[agent] backup error: %v", err)
			}
		}
	}
}

// TriggerBackup runs a backup immediately (called from service control or CLI).
func (a *Agent) TriggerBackup(ctx context.Context) error {
	return RunBackup(ctx, a.cfg, a.client)
}

func (a *Agent) heartbeat(ctx context.Context) {
	if err := a.client.Heartbeat(ctx); err != nil {
		log.Printf("[agent] heartbeat error: %v", err)
	}
}
