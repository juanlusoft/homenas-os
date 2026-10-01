package agent

import (
	"context"
	"github.com/robfig/cron/v3"
	"log"
	"sync"
	"time"

	"homenas.io/agent/internal/config"
)

// Agent is the main long-running agent process.
type Agent struct {
	cfg      *config.Config
	client   *NASClient
	backupMu sync.Mutex
}

// New creates an Agent from the given config.
func New(cfg *config.Config) *Agent {
	return &Agent{
		cfg:    cfg,
		client: NewNASClientWithTrust(cfg.NasURL, cfg.Token, cfg.TLSFingerprint, cfg.InsecureTLS),
	}
}

// Run starts the agent loop: heartbeat every 30s, backup on schedule.
func (a *Agent) Run(ctx context.Context) {
	log.Printf("[agent] starting — NAS: %s, device: %s", a.cfg.NasURL, a.cfg.DeviceName)

	// Initial heartbeat
	a.heartbeat(ctx)

	heartbeatTick := time.NewTicker(30 * time.Second)
	defer heartbeatTick.Stop()

	// Parse the actual configured cron expression rather than silently treating
	// every expression as "once every 24 hours".
	schedule := cron.New(cron.WithChain(cron.SkipIfStillRunning(cron.DefaultLogger)))
	if a.cfg.ScheduleCron != "" {
		if _, err := schedule.AddFunc(a.cfg.ScheduleCron, func() {
			if err := a.TriggerBackup(ctx); err != nil {
				log.Printf("[agent] backup error: %v", err)
			}
		}); err != nil {
			log.Printf("[agent] invalid backup schedule: %v", err)
		} else {
			schedule.Start()
		}
	}
	defer func() { <-schedule.Stop().Done() }()

	for {
		select {
		case <-ctx.Done():
			log.Println("[agent] shutting down")
			return

		case <-heartbeatTick.C:
			a.heartbeat(ctx)

		}
	}
}

// TriggerBackup runs a backup immediately (called from service control or CLI).
func (a *Agent) TriggerBackup(ctx context.Context) error {
	a.backupMu.Lock()
	defer a.backupMu.Unlock()
	return RunBackup(ctx, a.cfg, a.client)
}

func (a *Agent) heartbeat(ctx context.Context) {
	task, err := a.client.Poll(ctx)
	if err != nil {
		log.Printf("[agent] heartbeat error: %v", err)
		return
	}
	if task.Status == "backup" {
		if err := a.TriggerBackup(ctx); err != nil {
			log.Printf("[agent] requested backup error: %v", err)
		}
	}
}
