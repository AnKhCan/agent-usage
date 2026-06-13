package storage

import (
	"database/sql"
	"encoding/json"
	"time"
)

// FileScanContext stores parser state needed to continue incremental scans.
type FileScanContext struct {
	SessionID string `json:"session_id"`
	CWD       string `json:"cwd"`
	Version   string `json:"version"`
	Model     string `json:"model"`
}

// File state tracking

// GetMeta returns the value for a meta key, or empty string if not found.
func (d *DB) GetMeta(key string) (string, error) {
	var val string
	err := d.db.QueryRow("SELECT value FROM meta WHERE key=?", key).Scan(&val)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return val, err
}

// SetMeta sets a meta key-value pair.
func (d *DB) SetMeta(key, value string) error {
	_, err := d.db.Exec(`INSERT INTO meta(key,value) VALUES(?,?)
		ON CONFLICT(key) DO UPDATE SET value=excluded.value`, key, value)
	return err
}

// ResetScanState clears file_state and sessions tables to force a full re-scan.
func (d *DB) ResetScanState() error {
	_, err := d.db.Exec("DELETE FROM file_state")
	if err != nil {
		return err
	}
	_, err = d.db.Exec("DELETE FROM sessions")
	return err
}

// GetFileState returns the last known size, read offset, and parser context for a file path.
func (d *DB) GetFileState(path string) (size, offset int64, ctx *FileScanContext, err error) {
	var raw sql.NullString
	err = d.db.QueryRow("SELECT size, last_offset, scan_context FROM file_state WHERE path=?", path).Scan(&size, &offset, &raw)
	if err == sql.ErrNoRows {
		return 0, 0, nil, nil
	}
	if err != nil {
		return 0, 0, nil, err
	}
	if raw.Valid && raw.String != "" {
		ctx = &FileScanContext{}
		if err := json.Unmarshal([]byte(raw.String), ctx); err != nil {
			return size, offset, nil, nil // ignore malformed context
		}
	}
	return size, offset, ctx, nil
}

// SetFileState records the current size, read offset, and optional parser context for a file path.
func (d *DB) SetFileState(path string, size, offset int64, ctx *FileScanContext) error {
	var raw string
	if ctx != nil {
		b, err := json.Marshal(ctx)
		if err != nil {
			return err
		}
		raw = string(b)
	}
	_, err := d.db.Exec(`INSERT INTO file_state(path,size,last_offset,scan_context) VALUES(?,?,?,?)
		ON CONFLICT(path) DO UPDATE SET size=excluded.size, last_offset=excluded.last_offset, scan_context=excluded.scan_context`,
		path, size, offset, raw)
	return err
}

// Sessions

// UpsertSession inserts or updates a session record, merging non-empty fields.
func (d *DB) UpsertSession(s *SessionRecord) error {
	_, err := d.db.Exec(`INSERT INTO sessions(source,session_id,project,cwd,version,git_branch,start_time,prompts)
		VALUES(?,?,?,?,?,?,?,?)
		ON CONFLICT(session_id) DO UPDATE SET
			project=CASE WHEN excluded.project!='' THEN excluded.project ELSE sessions.project END,
			cwd=CASE WHEN excluded.cwd!='' THEN excluded.cwd ELSE sessions.cwd END,
			version=CASE WHEN excluded.version!='' THEN excluded.version ELSE sessions.version END,
			git_branch=CASE WHEN excluded.git_branch!='' THEN excluded.git_branch ELSE sessions.git_branch END,
			start_time=CASE WHEN excluded.start_time < sessions.start_time THEN excluded.start_time ELSE sessions.start_time END,
			prompts=prompts+excluded.prompts`,
		s.Source, s.SessionID, s.Project, s.CWD, s.Version, s.GitBranch, s.StartTime, s.Prompts)
	return err
}

// Usage records

// InsertUsage inserts a single usage record, ignoring duplicates.
func (d *DB) InsertUsage(r *UsageRecord) error {
	_, err := d.db.Exec(`INSERT OR IGNORE INTO usage_records(source,session_id,model,input_tokens,output_tokens,
		cache_creation_input_tokens,cache_read_input_tokens,reasoning_output_tokens,cost_usd,timestamp,project,git_branch)
		VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
		r.Source, r.SessionID, r.Model, r.InputTokens, r.OutputTokens,
		r.CacheCreationInputTokens, r.CacheReadInputTokens, r.ReasoningOutputTokens,
		r.CostUSD, r.Timestamp, r.Project, r.GitBranch)
	return err
}

// InsertUsageBatch inserts multiple usage records in a single transaction,
// ignoring duplicates.
func (d *DB) InsertUsageBatch(records []*UsageRecord) error {
	tx, err := d.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	stmt, err := tx.Prepare(`INSERT OR IGNORE INTO usage_records(source,session_id,model,input_tokens,output_tokens,
		cache_creation_input_tokens,cache_read_input_tokens,reasoning_output_tokens,cost_usd,timestamp,project,git_branch)
		VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
	if err != nil {
		return err
	}
	defer stmt.Close()
	for _, r := range records {
		_, err := stmt.Exec(r.Source, r.SessionID, r.Model, r.InputTokens, r.OutputTokens,
			r.CacheCreationInputTokens, r.CacheReadInputTokens, r.ReasoningOutputTokens,
			r.CostUSD, r.Timestamp, r.Project, r.GitBranch)
		if err != nil {
			return err
		}
	}
	return tx.Commit()
}

// Prompt events

// InsertPromptBatch inserts multiple prompt events in a single transaction,
// ignoring duplicates.
func (d *DB) InsertPromptBatch(events []*PromptEvent) error {
	if len(events) == 0 {
		return nil
	}
	d.mu.Lock()
	defer d.mu.Unlock()
	tx, err := d.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	stmt, err := tx.Prepare(`INSERT OR IGNORE INTO prompt_events(source, session_id, timestamp) VALUES(?,?,?)`)
	if err != nil {
		return err
	}
	defer stmt.Close()
	for _, e := range events {
		if _, err := stmt.Exec(e.Source, e.SessionID, e.Timestamp); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// Pricing

// PricingOverride represents a user-managed model price override.
type PricingOverride struct {
	Model                       string  `json:"model"`
	InputCostPerToken           float64 `json:"input_cost_per_token"`
	OutputCostPerToken          float64 `json:"output_cost_per_token"`
	CacheReadInputTokenCost     float64 `json:"cache_read_input_token_cost"`
	CacheCreationInputTokenCost float64 `json:"cache_creation_input_token_cost"`
	Note                        string  `json:"note"`
	CreatedAt                   string  `json:"created_at"`
	UpdatedAt                   string  `json:"updated_at"`
}

// MissingPricingModel describes a used model that has no effective pricing.
type MissingPricingModel struct {
	Model        string `json:"model"`
	Sources      string `json:"sources"`
	UsageCount   int    `json:"usage_count"`
	InputTokens  int64  `json:"input_tokens"`
	OutputTokens int64  `json:"output_tokens"`
	CacheRead    int64  `json:"cache_read"`
	CacheCreate  int64  `json:"cache_create"`
	TotalTokens  int64  `json:"total_tokens"`
	FirstSeen    string `json:"first_seen"`
	LastSeen     string `json:"last_seen"`
}

// UpsertPricing inserts or updates synced per-token pricing for a model.
func (d *DB) UpsertPricing(model string, inputCost, outputCost, cacheReadCost, cacheCreationCost float64) error {
	_, err := d.db.Exec(`INSERT INTO pricing(model,input_cost_per_token,output_cost_per_token,
		cache_read_input_token_cost,cache_creation_input_token_cost,updated_at)
		VALUES(?,?,?,?,?,?)
		ON CONFLICT(model) DO UPDATE SET
			input_cost_per_token=excluded.input_cost_per_token,
			output_cost_per_token=excluded.output_cost_per_token,
			cache_read_input_token_cost=excluded.cache_read_input_token_cost,
			cache_creation_input_token_cost=excluded.cache_creation_input_token_cost,
			updated_at=excluded.updated_at`,
		model, inputCost, outputCost, cacheReadCost, cacheCreationCost, time.Now())
	return err
}

// GetPricing returns per-token costs for a specific model.
func (d *DB) GetPricing(model string) (inputCost, outputCost, cacheReadCost, cacheCreationCost float64, err error) {
	err = d.db.QueryRow("SELECT input_cost_per_token,output_cost_per_token,cache_read_input_token_cost,cache_creation_input_token_cost FROM pricing WHERE model=?", model).
		Scan(&inputCost, &outputCost, &cacheReadCost, &cacheCreationCost)
	if err == sql.ErrNoRows {
		return 0, 0, 0, 0, nil
	}
	return
}

// GetSyncedPricing returns prices synced from the upstream model price file.
func (d *DB) GetSyncedPricing() (map[string][4]float64, error) {
	rows, err := d.db.Query("SELECT model,input_cost_per_token,output_cost_per_token,cache_read_input_token_cost,cache_creation_input_token_cost FROM pricing")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	m := make(map[string][4]float64)
	for rows.Next() {
		var model string
		var costs [4]float64
		if err := rows.Scan(&model, &costs[0], &costs[1], &costs[2], &costs[3]); err != nil {
			return nil, err
		}
		m[model] = costs
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return m, nil
}

// GetAllPricing returns effective per-token costs for all models as a map keyed
// by model name. User overrides take precedence over synced pricing.
// The array values are [input, output, cache_read, cache_creation] costs.
func (d *DB) GetAllPricing() (map[string][4]float64, error) {
	m, err := d.GetSyncedPricing()
	if err != nil {
		return nil, err
	}
	overrides, err := d.GetPricingOverrides()
	if err != nil {
		return nil, err
	}
	for _, p := range overrides {
		m[p.Model] = [4]float64{p.InputCostPerToken, p.OutputCostPerToken, p.CacheReadInputTokenCost, p.CacheCreationInputTokenCost}
	}
	return m, nil
}

// GetPricingOverrides returns all user-managed price overrides.
func (d *DB) GetPricingOverrides() ([]PricingOverride, error) {
	rows, err := d.db.Query(`SELECT model,input_cost_per_token,output_cost_per_token,
		cache_read_input_token_cost,cache_creation_input_token_cost,note,
		COALESCE(created_at,''),COALESCE(updated_at,'')
		FROM pricing_overrides ORDER BY model ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []PricingOverride
	for rows.Next() {
		var p PricingOverride
		if err := rows.Scan(&p.Model, &p.InputCostPerToken, &p.OutputCostPerToken,
			&p.CacheReadInputTokenCost, &p.CacheCreationInputTokenCost, &p.Note, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		result = append(result, p)
	}
	return result, rows.Err()
}

// UpsertPricingOverride inserts or updates a user-managed model price override.
func (d *DB) UpsertPricingOverride(p PricingOverride) error {
	now := time.Now()
	_, err := d.db.Exec(`INSERT INTO pricing_overrides(model,input_cost_per_token,output_cost_per_token,
		cache_read_input_token_cost,cache_creation_input_token_cost,note,created_at,updated_at)
		VALUES(?,?,?,?,?,?,?,?)
		ON CONFLICT(model) DO UPDATE SET
			input_cost_per_token=excluded.input_cost_per_token,
			output_cost_per_token=excluded.output_cost_per_token,
			cache_read_input_token_cost=excluded.cache_read_input_token_cost,
			cache_creation_input_token_cost=excluded.cache_creation_input_token_cost,
			note=excluded.note,
			updated_at=excluded.updated_at`,
		p.Model, p.InputCostPerToken, p.OutputCostPerToken, p.CacheReadInputTokenCost, p.CacheCreationInputTokenCost, p.Note, now, now)
	return err
}

// DeletePricingOverride removes a user-managed price override.
func (d *DB) DeletePricingOverride(model string) error {
	_, err := d.db.Exec("DELETE FROM pricing_overrides WHERE model=?", model)
	return err
}

// PricingOverrideExists reports whether a user-managed override exists.
func (d *DB) PricingOverrideExists(model string) (bool, error) {
	var exists int
	err := d.db.QueryRow("SELECT 1 FROM pricing_overrides WHERE model=? LIMIT 1", model).Scan(&exists)
	if err == sql.ErrNoRows {
		return false, nil
	}
	return err == nil, err
}

// HasUsageModel reports whether a model has appeared in collected usage.
func (d *DB) HasUsageModel(model string) (bool, error) {
	var exists int
	err := d.db.QueryRow("SELECT 1 FROM usage_records WHERE model=? LIMIT 1", model).Scan(&exists)
	if err == sql.ErrNoRows {
		return false, nil
	}
	return err == nil, err
}

// GetMissingPricingModels returns used models that cannot be matched against the
// provided effective price map.
func (d *DB) GetMissingPricingModels(allPrices map[string][4]float64) ([]MissingPricingModel, error) {
	rows, err := d.db.Query(`SELECT model, GROUP_CONCAT(DISTINCT source), COUNT(*),
		COALESCE(SUM(input_tokens),0), COALESCE(SUM(output_tokens),0),
		COALESCE(SUM(cache_read_input_tokens),0), COALESCE(SUM(cache_creation_input_tokens),0),
		COALESCE(SUM(input_tokens+cache_read_input_tokens+cache_creation_input_tokens+output_tokens),0),
		COALESCE(MIN(timestamp),''), COALESCE(MAX(timestamp),'')
		FROM usage_records WHERE model != '' GROUP BY model ORDER BY MAX(timestamp) DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []MissingPricingModel
	for rows.Next() {
		var m MissingPricingModel
		if err := rows.Scan(&m.Model, &m.Sources, &m.UsageCount, &m.InputTokens, &m.OutputTokens,
			&m.CacheRead, &m.CacheCreate, &m.TotalTokens, &m.FirstSeen, &m.LastSeen); err != nil {
			return nil, err
		}
		if _, ok := matchPricing(m.Model, allPrices); ok {
			continue
		}
		result = append(result, m)
	}
	return result, rows.Err()
}
