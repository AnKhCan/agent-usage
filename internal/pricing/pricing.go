package pricing

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/briqt/agent-usage/internal/storage"
)

const DefaultSourceURL = "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json"

const (
	MetaSourceURL      = "pricing.source_url"
	MetaCachePath      = "pricing.cache_path"
	MetaLastSyncAt     = "pricing.last_sync_at"
	MetaLastDownloadAt = "pricing.last_download_at"
	MetaLastError      = "pricing.last_error"
	MetaLastModelCount = "pricing.last_model_count"
)

// SyncOptions controls where pricing is downloaded from and cached locally.
type SyncOptions struct {
	SourceURL string
	CachePath string
}

type modelPricing struct {
	InputCostPerToken           *float64 `json:"input_cost_per_token"`
	OutputCostPerToken          *float64 `json:"output_cost_per_token"`
	CacheReadInputTokenCost     *float64 `json:"cache_read_input_token_cost"`
	CacheCreationInputTokenCost *float64 `json:"cache_creation_input_token_cost"`
}

// Sync fetches model pricing, stores a validated copy on disk, and upserts it
// into the database. If the download fails, the previous local cache is used.
func Sync(db *storage.DB, opts SyncOptions) error {
	if opts.SourceURL == "" {
		opts.SourceURL = DefaultSourceURL
	}
	db.SetMeta(MetaSourceURL, opts.SourceURL)
	db.SetMeta(MetaCachePath, opts.CachePath)

	body, err := fetchPricing(opts.SourceURL)
	if err == nil {
		count, parseErr := syncBytes(db, body)
		if parseErr == nil {
			if opts.CachePath != "" {
				if writeErr := writeCache(opts.CachePath, body); writeErr != nil {
					db.SetMeta(MetaLastError, writeErr.Error())
					return writeErr
				}
			}
			now := time.Now().Format(time.RFC3339)
			db.SetMeta(MetaLastDownloadAt, now)
			db.SetMeta(MetaLastSyncAt, now)
			db.SetMeta(MetaLastModelCount, fmt.Sprintf("%d", count))
			db.SetMeta(MetaLastError, "")
			log.Printf("pricing: synced %d models", count)
			return nil
		}
		err = parseErr
	}

	if opts.CachePath != "" {
		cached, readErr := os.ReadFile(opts.CachePath)
		if readErr == nil {
			count, parseErr := syncBytes(db, cached)
			if parseErr == nil {
				now := time.Now().Format(time.RFC3339)
				db.SetMeta(MetaLastSyncAt, now)
				db.SetMeta(MetaLastModelCount, fmt.Sprintf("%d", count))
				db.SetMeta(MetaLastError, fmt.Sprintf("download failed; using local cache: %v", err))
				log.Printf("pricing: synced %d models from cache", count)
				return nil
			}
			db.SetMeta(MetaLastError, fmt.Sprintf("download failed: %v; cache parse failed: %v", err, parseErr))
			return parseErr
		}
	}

	db.SetMeta(MetaLastError, err.Error())
	return err
}

func fetchPricing(url string) ([]byte, error) {
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("pricing download failed: %s", resp.Status)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	return body, nil
}

func writeCache(path string, body []byte) error {
	dir := filepath.Dir(path)
	if dir != "." && dir != "" {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return err
		}
	}
	return os.WriteFile(path, body, 0644)
}

func syncBytes(db *storage.DB, body []byte) (int, error) {
	var data map[string]json.RawMessage
	if err := json.NewDecoder(bytes.NewReader(body)).Decode(&data); err != nil {
		return 0, err
	}

	count := 0
	for model, raw := range data {
		var p modelPricing
		if err := json.Unmarshal(raw, &p); err != nil {
			continue
		}
		if p.InputCostPerToken == nil || p.OutputCostPerToken == nil {
			continue
		}

		var cacheRead, cacheCreate float64
		if p.CacheReadInputTokenCost != nil {
			cacheRead = *p.CacheReadInputTokenCost
		}
		if p.CacheCreationInputTokenCost != nil {
			cacheCreate = *p.CacheCreationInputTokenCost
		}

		if err := db.UpsertPricing(model, *p.InputCostPerToken, *p.OutputCostPerToken, cacheRead, cacheCreate); err != nil {
			log.Printf("pricing: error upserting %s: %v", model, err)
			continue
		}
		count++
	}
	return count, nil
}

// CalcCost computes the USD cost for a single API call given token counts and
// per-token prices. The prices array is [input, output, cache_read, cache_creation].
// input_tokens is the non-cached input only (cache tokens are separate fields).
func CalcCost(inputTokens, outputTokens, cacheCreation, cacheRead int64, prices [4]float64) float64 {
	inputPrice := prices[0]
	outputPrice := prices[1]
	cacheReadPrice := prices[2]
	cacheCreatePrice := prices[3]

	cost := float64(inputTokens)*inputPrice +
		float64(cacheCreation)*cacheCreatePrice +
		float64(cacheRead)*cacheReadPrice +
		float64(outputTokens)*outputPrice
	return cost
}
