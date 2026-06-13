package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/briqt/agent-usage/internal/collector"
	"github.com/briqt/agent-usage/internal/config"
	"github.com/briqt/agent-usage/internal/pricing"
	"github.com/briqt/agent-usage/internal/server"
	"github.com/briqt/agent-usage/internal/storage"
)

var (
	version = "dev"
	commit  = "none"
	date    = "unknown"
)

func main() {
	if len(os.Args) > 1 && os.Args[1] == "version" {
		fmt.Printf("agent-usage %s (commit: %s, built: %s)\n", version, commit, date)
		os.Exit(0)
	}

	configPath := flag.String("config", "", "path to config file")
	flag.Parse()

	cfg, err := config.Load(config.ResolveConfigPath(*configPath))
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	db, err := storage.Open(cfg.Storage.Path)
	if err != nil {
		log.Fatalf("storage: %v", err)
	}
	defer db.Close()

	if err := db.ImportConfigAliases(cfg.ModelAliases); err != nil {
		log.Fatalf("model aliases: %v", err)
	}
	if err := db.ApplyModelAliases(); err != nil {
		log.Fatalf("apply model aliases: %v", err)
	}

	// Check if version changed — if so, reset scan state to force full re-scan
	// (needed when prompt counting logic or other parsing changes)
	lastVer, _ := db.GetMeta("version")
	if lastVer != "" && lastVer != version {
		log.Printf("version changed (%s -> %s), resetting scan state for full re-scan", lastVer, version)
		if err := db.ResetScanState(); err != nil {
			log.Printf("reset scan state: %v", err)
		}
	}
	db.SetMeta("version", version)

	// Sync pricing
	log.Println("syncing pricing data...")
	pricingOptions := pricing.SyncOptions{SourceURL: cfg.Pricing.SourceURL, CachePath: cfg.Pricing.CachePath}
	if err := pricing.Sync(db, pricingOptions); err != nil {
		log.Printf("pricing sync failed: %v (continuing without pricing)", err)
	}

	// Calculate costs for existing records
	recalcAllCosts(db)

	// Collector loop
	type collectorEntry struct {
		name string
		c    collector.Collector
		cfg  config.CollectorConfig
	}
	collectors := []collectorEntry{
		{"Claude Code", collector.NewClaudeCollector(db, cfg.Collectors.Claude.Paths), cfg.Collectors.Claude},
		{"Codex", collector.NewCodexCollector(db, cfg.Collectors.Codex.Paths), cfg.Collectors.Codex},
		{"OpenClaw", collector.NewOpenClawCollector(db, cfg.Collectors.OpenClaw.Paths), cfg.Collectors.OpenClaw},
		{"OpenCode", collector.NewOpenCodeCollector(db, cfg.Collectors.OpenCode.Paths), cfg.Collectors.OpenCode},
		{"MiMo Code", collector.NewMiMoCodeCollector(db, cfg.Collectors.MiMoCode.Paths), cfg.Collectors.MiMoCode},
		{"Kiro", collector.NewKiroCollector(db, cfg.Collectors.Kiro.Paths), cfg.Collectors.Kiro},
		{"Pi", collector.NewPiCollector(db, cfg.Collectors.Pi.Paths), cfg.Collectors.Pi},
	}
	for _, ce := range collectors {
		if !ce.cfg.Enabled {
			continue
		}
		log.Printf("scanning %s sessions...", ce.name)
		if err := ce.c.Scan(); err != nil {
			log.Printf("%s scan: %v", ce.name, err)
		}
		recalcCosts(db)

		go func(ce collectorEntry) {
			ticker := time.NewTicker(ce.cfg.ScanInterval)
			for range ticker.C {
				ce.c.Scan()
				recalcCosts(db)
			}
		}(ce)
	}

	// Periodic pricing sync
	go func() {
		ticker := time.NewTicker(cfg.Pricing.SyncInterval)
		for range ticker.C {
			pricing.Sync(db, pricingOptions)
			recalcAllCosts(db)
		}
	}()

	// Start web server
	addr := fmt.Sprintf("%s:%d", cfg.Server.BindAddress, cfg.Server.Port)
	srv := server.New(db, addr, pricingOptions)
	log.Fatal(srv.Start())
}

func recalcCosts(db *storage.DB) {
	prices, err := db.GetAllPricing()
	if err != nil {
		return
	}
	if err := db.RecalcCosts(prices, pricing.CalcCost); err != nil {
		log.Printf("recalc costs: %v", err)
	}
}

func recalcAllCosts(db *storage.DB) {
	prices, err := db.GetAllPricing()
	if err != nil {
		return
	}
	if err := db.RecalcAllCosts(prices, pricing.CalcCost); err != nil {
		log.Printf("recalc costs: %v", err)
	}
}
