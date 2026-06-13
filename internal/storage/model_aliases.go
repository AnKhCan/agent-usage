package storage

import (
	"database/sql"
	"fmt"
	"sort"
	"strings"
	"time"
)

// ModelAlias maps a collected raw model name to a canonical model name.
type ModelAlias struct {
	Alias          string `json:"alias"`
	CanonicalModel string `json:"canonical_model"`
	Note           string `json:"note"`
	Source         string `json:"source"`
	CreatedAt      string `json:"created_at"`
	UpdatedAt      string `json:"updated_at"`
}

// ModelAliasVariant describes one raw model spelling in a duplicate candidate group.
type ModelAliasVariant struct {
	RawModel    string `json:"raw_model"`
	Model       string `json:"model"`
	Sources     string `json:"sources"`
	UsageCount  int    `json:"usage_count"`
	TotalTokens int64  `json:"total_tokens"`
	FirstSeen   string `json:"first_seen"`
	LastSeen    string `json:"last_seen"`
}

// ModelAliasCandidate groups raw model spellings that likely refer to one model.
type ModelAliasCandidate struct {
	CanonicalModel string              `json:"canonical_model"`
	UsageCount     int                 `json:"usage_count"`
	TotalTokens    int64               `json:"total_tokens"`
	Variants       []ModelAliasVariant `json:"variants"`
}

func builtInModelAlias(raw string) (string, bool) {
	model := strings.TrimSpace(raw)
	switch {
	case strings.EqualFold(model, "glm-5.1"):
		return "glm-5.1", true
	case strings.EqualFold(model, "zai-org/GLM-5.1"):
		return "glm-5.1", true
	case strings.EqualFold(model, "GLM-5.1"):
		return "glm-5.1", true
	default:
		return "", false
	}
}

func loadModelAliasMap(db *sql.DB) (map[string]string, error) {
	rows, err := db.Query("SELECT alias, canonical_model FROM model_aliases WHERE alias != '' AND canonical_model != ''")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	aliases := make(map[string]string)
	for rows.Next() {
		var alias, canonical string
		if err := rows.Scan(&alias, &canonical); err != nil {
			return nil, err
		}
		alias = strings.TrimSpace(alias)
		canonical = strings.TrimSpace(canonical)
		if alias == "" || canonical == "" {
			continue
		}
		aliases[alias] = canonical
	}
	return aliases, rows.Err()
}

func resolveModelWithAliases(raw string, aliases map[string]string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return ""
	}
	if canonical, ok := aliases[trimmed]; ok && strings.TrimSpace(canonical) != "" {
		return strings.TrimSpace(canonical)
	}
	if canonical, ok := builtInModelAlias(trimmed); ok {
		return canonical
	}
	return trimmed
}

// ResolveModelName returns the canonical model name for a collected raw model name.
func (d *DB) ResolveModelName(raw string) (string, error) {
	aliases, err := loadModelAliasMap(d.db)
	if err != nil {
		return "", err
	}
	return resolveModelWithAliases(raw, aliases), nil
}

// GetModelAliases returns user and config managed aliases.
func (d *DB) GetModelAliases() ([]ModelAlias, error) {
	rows, err := d.db.Query(`SELECT alias, canonical_model, note, source,
		COALESCE(created_at,''), COALESCE(updated_at,'')
		FROM model_aliases ORDER BY LOWER(alias) ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []ModelAlias
	for rows.Next() {
		var a ModelAlias
		if err := rows.Scan(&a.Alias, &a.CanonicalModel, &a.Note, &a.Source, &a.CreatedAt, &a.UpdatedAt); err != nil {
			return nil, err
		}
		result = append(result, a)
	}
	return result, rows.Err()
}

// CountModelAliases returns the number of aliases stored in SQLite.
func (d *DB) CountModelAliases() (int, error) {
	var count int
	err := d.db.QueryRow("SELECT COUNT(*) FROM model_aliases").Scan(&count)
	return count, err
}

// UpsertModelAlias inserts or updates an alias. Empty alias or canonical names are rejected.
func (d *DB) UpsertModelAlias(a ModelAlias) error {
	alias := strings.TrimSpace(a.Alias)
	canonical := strings.TrimSpace(a.CanonicalModel)
	if alias == "" {
		return fmt.Errorf("alias is required")
	}
	if canonical == "" {
		return fmt.Errorf("canonical model is required")
	}
	source := strings.TrimSpace(a.Source)
	if source == "" {
		source = "manual"
	}
	now := time.Now()
	_, err := d.db.Exec(`INSERT INTO model_aliases(alias, canonical_model, note, source, created_at, updated_at)
		VALUES(?,?,?,?,?,?)
		ON CONFLICT(alias) DO UPDATE SET
			canonical_model=excluded.canonical_model,
			note=excluded.note,
			source=excluded.source,
			updated_at=excluded.updated_at`,
		alias, canonical, strings.TrimSpace(a.Note), source, now, now)
	return err
}

// DeleteModelAlias removes an alias.
func (d *DB) DeleteModelAlias(alias string) error {
	_, err := d.db.Exec("DELETE FROM model_aliases WHERE alias=?", strings.TrimSpace(alias))
	return err
}

// ImportConfigAliases upserts config aliases without overwriting manual aliases.
func (d *DB) ImportConfigAliases(aliases map[string]string) error {
	if len(aliases) == 0 {
		return nil
	}
	now := time.Now()
	tx, err := d.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`INSERT INTO model_aliases(alias, canonical_model, note, source, created_at, updated_at)
		VALUES(?,?,?,?,?,?)
		ON CONFLICT(alias) DO UPDATE SET
			canonical_model=CASE WHEN model_aliases.source='manual' THEN model_aliases.canonical_model ELSE excluded.canonical_model END,
			note=CASE WHEN model_aliases.source='manual' THEN model_aliases.note ELSE excluded.note END,
			source=CASE WHEN model_aliases.source='manual' THEN model_aliases.source ELSE excluded.source END,
			updated_at=CASE WHEN model_aliases.source='manual' THEN model_aliases.updated_at ELSE excluded.updated_at END`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for alias, canonical := range aliases {
		alias = strings.TrimSpace(alias)
		canonical = strings.TrimSpace(canonical)
		if alias == "" || canonical == "" {
			continue
		}
		if _, err := stmt.Exec(alias, canonical, "config.yaml", "config", now, now); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// ApplyModelAliases rewrites historical usage_records.model from raw_model using current aliases.
func (d *DB) ApplyModelAliases() error {
	d.mu.Lock()
	defer d.mu.Unlock()

	aliases, err := loadModelAliasMap(d.db)
	if err != nil {
		return err
	}
	rows, err := d.db.Query(`SELECT id, model, COALESCE(NULLIF(raw_model,''), model) FROM usage_records`)
	if err != nil {
		return err
	}
	defer rows.Close()

	type rec struct {
		id        int64
		model     string
		rawModel  string
		canonical string
	}
	var recs []rec
	for rows.Next() {
		var r rec
		if err := rows.Scan(&r.id, &r.model, &r.rawModel); err != nil {
			return err
		}
		r.canonical = resolveModelWithAliases(r.rawModel, aliases)
		if r.model != r.canonical || r.rawModel == "" {
			recs = append(recs, r)
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	rows.Close()
	if len(recs) == 0 {
		return nil
	}

	tx, err := d.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	stmt, err := tx.Prepare(`UPDATE usage_records SET model=?, raw_model=CASE WHEN raw_model='' OR raw_model IS NULL THEN ? ELSE raw_model END WHERE id=?`)
	if err != nil {
		return err
	}
	defer stmt.Close()
	for _, r := range recs {
		if _, err := stmt.Exec(r.canonical, r.model, r.id); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func aliasCandidateKey(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return ""
	}
	if canonical, ok := builtInModelAlias(trimmed); ok {
		return canonical
	}
	lower := strings.ToLower(trimmed)
	parts := strings.Split(lower, "/")
	if len(parts) > 1 && strings.TrimSpace(parts[len(parts)-1]) != "" {
		return strings.TrimSpace(parts[len(parts)-1])
	}
	return lower
}

func chooseCandidateCanonical(key string, variants []ModelAliasVariant) string {
	modelCounts := make(map[string]int)
	for _, v := range variants {
		model := strings.TrimSpace(v.Model)
		if model != "" {
			modelCounts[model] += v.UsageCount
		}
	}
	bestModel := ""
	bestCount := -1
	for model, count := range modelCounts {
		if strings.EqualFold(model, key) {
			return strings.ToLower(model)
		}
		if count > bestCount || (count == bestCount && (bestModel == "" || len(model) < len(bestModel))) {
			bestModel = model
			bestCount = count
		}
	}
	if key != "" {
		return key
	}
	return bestModel
}

// GetModelAliasCandidates returns raw model spellings that likely refer to the same model.
func (d *DB) GetModelAliasCandidates() ([]ModelAliasCandidate, error) {
	rows, err := d.db.Query(`SELECT COALESCE(NULLIF(raw_model,''), model) as raw, model,
		GROUP_CONCAT(DISTINCT source), COUNT(*),
		COALESCE(SUM(input_tokens+cache_read_input_tokens+cache_creation_input_tokens+output_tokens),0),
		COALESCE(MIN(timestamp),''), COALESCE(MAX(timestamp),'')
		FROM usage_records
		WHERE COALESCE(NULLIF(raw_model,''), model) != ''
		GROUP BY raw, model`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	groups := make(map[string][]ModelAliasVariant)
	for rows.Next() {
		var v ModelAliasVariant
		if err := rows.Scan(&v.RawModel, &v.Model, &v.Sources, &v.UsageCount, &v.TotalTokens, &v.FirstSeen, &v.LastSeen); err != nil {
			return nil, err
		}
		key := aliasCandidateKey(v.RawModel)
		if key == "" {
			continue
		}
		groups[key] = append(groups[key], v)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	candidates := make([]ModelAliasCandidate, 0)
	for key, variants := range groups {
		rawNames := make(map[string]struct{})
		for _, v := range variants {
			rawNames[strings.TrimSpace(v.RawModel)] = struct{}{}
		}
		if len(rawNames) < 2 {
			continue
		}
		sort.Slice(variants, func(i, j int) bool {
			if variants[i].UsageCount == variants[j].UsageCount {
				return strings.ToLower(variants[i].RawModel) < strings.ToLower(variants[j].RawModel)
			}
			return variants[i].UsageCount > variants[j].UsageCount
		})
		c := ModelAliasCandidate{
			CanonicalModel: chooseCandidateCanonical(key, variants),
			Variants:       variants,
		}
		for _, v := range variants {
			c.UsageCount += v.UsageCount
			c.TotalTokens += v.TotalTokens
		}
		candidates = append(candidates, c)
	}
	sort.Slice(candidates, func(i, j int) bool {
		if candidates[i].TotalTokens == candidates[j].TotalTokens {
			return candidates[i].CanonicalModel < candidates[j].CanonicalModel
		}
		return candidates[i].TotalTokens > candidates[j].TotalTokens
	})
	return candidates, nil
}
