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

// ImportConfigAliases syncs config aliases without overwriting manual aliases.
// It returns true when the stored config-managed aliases changed.
func (d *DB) ImportConfigAliases(aliases map[string]string) (bool, error) {
	desired := map[string]string{}
	for alias, canonical := range aliases {
		alias = strings.TrimSpace(alias)
		canonical = strings.TrimSpace(canonical)
		if alias == "" || canonical == "" {
			continue
		}
		desired[alias] = canonical
	}

	now := time.Now()
	tx, err := d.db.Begin()
	if err != nil {
		return false, err
	}
	defer tx.Rollback()

	rows, err := tx.Query("SELECT alias FROM model_aliases WHERE source='config'")
	if err != nil {
		return false, err
	}
	var existingConfig []string
	for rows.Next() {
		var alias string
		if err := rows.Scan(&alias); err != nil {
			rows.Close()
			return false, err
		}
		existingConfig = append(existingConfig, alias)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return false, err
	}
	rows.Close()

	changed := false
	for _, alias := range existingConfig {
		if _, ok := desired[alias]; ok {
			continue
		}
		if _, err := tx.Exec("DELETE FROM model_aliases WHERE alias=? AND source='config'", alias); err != nil {
			return false, err
		}
		changed = true
	}

	for alias, canonical := range desired {
		var currentCanonical, currentNote, currentSource string
		err := tx.QueryRow("SELECT canonical_model, COALESCE(note,''), COALESCE(source,'') FROM model_aliases WHERE alias=?", alias).
			Scan(&currentCanonical, &currentNote, &currentSource)
		if err == sql.ErrNoRows {
			if _, err := tx.Exec(`INSERT INTO model_aliases(alias, canonical_model, note, source, created_at, updated_at)
				VALUES(?,?,?,?,?,?)`, alias, canonical, "config.yaml", "config", now, now); err != nil {
				return false, err
			}
			changed = true
			continue
		}
		if err != nil {
			return false, err
		}
		if currentSource == "manual" {
			continue
		}
		if currentCanonical == canonical && currentNote == "config.yaml" && currentSource == "config" {
			continue
		}
		if _, err := tx.Exec(`UPDATE model_aliases
			SET canonical_model=?, note=?, source=?, updated_at=?
			WHERE alias=? AND source!='manual'`, canonical, "config.yaml", "config", now, alias); err != nil {
			return false, err
		}
		changed = true
	}
	if err := tx.Commit(); err != nil {
		return false, err
	}
	return changed, nil
}

// ApplyModelAliases rewrites historical usage_records.model from raw_model using current aliases.
// This full reconciliation is intended for startup/config changes; user edits should use
// ApplyModelAliasesForRawModels to avoid scanning unrelated history.
func (d *DB) ApplyModelAliases() error {
	d.mu.Lock()
	defer d.mu.Unlock()

	tx, err := d.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`UPDATE usage_records
		SET raw_model=model
		WHERE raw_model='' OR raw_model IS NULL`); err != nil {
		return err
	}

	if _, err := tx.Exec(`UPDATE usage_records
		SET model=(SELECT canonical_model FROM model_aliases WHERE alias=usage_records.raw_model)
		WHERE raw_model IN (SELECT alias FROM model_aliases WHERE alias!='' AND canonical_model!='')
			AND model!=(SELECT canonical_model FROM model_aliases WHERE alias=usage_records.raw_model)`); err != nil {
		return err
	}

	if _, err := tx.Exec(`UPDATE usage_records
		SET model=raw_model
		WHERE raw_model!=''
			AND model!=raw_model
			AND raw_model NOT IN (SELECT alias FROM model_aliases WHERE alias!='' AND canonical_model!='')`); err != nil {
		return err
	}

	return tx.Commit()
}

// ApplyModelAliasesForRawModels rewrites only records whose raw model is in rawModels.
func (d *DB) ApplyModelAliasesForRawModels(rawModels []string) error {
	rawModels = normalizeRawModels(rawModels)
	if len(rawModels) == 0 {
		return nil
	}

	d.mu.Lock()
	defer d.mu.Unlock()

	aliases, err := loadModelAliasMap(d.db)
	if err != nil {
		return err
	}
	tx, err := d.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`UPDATE usage_records
		SET model=?,
			raw_model=CASE WHEN raw_model='' OR raw_model IS NULL THEN ? ELSE raw_model END
		WHERE raw_model=? OR ((raw_model='' OR raw_model IS NULL) AND model=?)`)
	if err != nil {
		return err
	}
	defer stmt.Close()
	for _, rawModel := range rawModels {
		canonical := resolveModelWithAliases(rawModel, aliases)
		if canonical == "" {
			canonical = rawModel
		}
		if _, err := stmt.Exec(canonical, rawModel, rawModel, rawModel); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func normalizeRawModels(rawModels []string) []string {
	seen := make(map[string]struct{}, len(rawModels))
	result := make([]string, 0, len(rawModels))
	for _, raw := range rawModels {
		raw = strings.TrimSpace(raw)
		if raw == "" {
			continue
		}
		if _, ok := seen[raw]; ok {
			continue
		}
		seen[raw] = struct{}{}
		result = append(result, raw)
	}
	return result
}

func isASCIIDigit(b byte) bool {
	return b >= '0' && b <= '9'
}

func normalizeModelVersionSeparators(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	for i := 0; i < len(s); i++ {
		c := s[i]
		if (c == '.' || c == '-') && i > 0 && i+1 < len(s) && isASCIIDigit(s[i-1]) && isASCIIDigit(s[i+1]) {
			b.WriteByte('#')
			continue
		}
		b.WriteByte(c)
	}
	return b.String()
}

func aliasCandidateBase(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return ""
	}
	lower := strings.ToLower(trimmed)
	parts := strings.Split(lower, "/")
	if len(parts) > 1 && strings.TrimSpace(parts[len(parts)-1]) != "" {
		return strings.TrimSpace(parts[len(parts)-1])
	}
	return lower
}

func aliasCandidateKey(raw string) string {
	base := aliasCandidateBase(raw)
	if base == "" {
		return ""
	}
	return normalizeModelVersionSeparators(base)
}

func betterAliasTarget(current, candidate string) bool {
	candidate = strings.TrimSpace(candidate)
	if candidate == "" {
		return false
	}
	current = strings.TrimSpace(current)
	if current == "" {
		return true
	}
	currentHasSlash := strings.Contains(current, "/")
	candidateHasSlash := strings.Contains(candidate, "/")
	if currentHasSlash != candidateHasSlash {
		return !candidateHasSlash
	}
	if len(candidate) != len(current) {
		return len(candidate) < len(current)
	}
	return strings.ToLower(candidate) < strings.ToLower(current)
}

func chooseObservedCanonical(key string, modelCounts map[string]int) string {
	bestModel := ""
	bestCount := -1
	for model, count := range modelCounts {
		if aliasCandidateKey(model) != key {
			continue
		}
		model = strings.TrimSpace(model)
		if strings.Contains(model, "/") {
			continue
		}
		if count > bestCount || (count == bestCount && betterAliasTarget(bestModel, model)) {
			bestModel = model
			bestCount = count
		}
	}
	if bestModel != "" {
		return strings.ToLower(bestModel)
	}
	return ""
}

func chooseCandidateCanonical(key string, variants []ModelAliasVariant, pricingTargets map[string]string) string {
	modelCounts := make(map[string]int)
	for _, v := range variants {
		model := strings.TrimSpace(v.Model)
		if model != "" {
			modelCounts[model] += v.UsageCount
		}
	}
	if observed := chooseObservedCanonical(key, modelCounts); observed != "" {
		return observed
	}
	if pricingTarget := strings.TrimSpace(pricingTargets[key]); pricingTarget != "" {
		return pricingTarget
	}
	bestModel := ""
	bestCount := -1
	for model, count := range modelCounts {
		if count > bestCount || (count == bestCount && (bestModel == "" || len(model) < len(bestModel))) {
			bestModel = model
			bestCount = count
		}
	}
	return bestModel
}

func pricingAliasTargetsForModel(model string) []string {
	trimmed := strings.TrimSpace(model)
	if trimmed == "" {
		return nil
	}
	base := aliasCandidateBase(trimmed)
	if base == "" {
		return nil
	}
	return []string{base}
}

func (d *DB) loadPricingAliasTargets() (map[string]string, error) {
	rows, err := d.db.Query(`SELECT model FROM pricing WHERE model!=''
		UNION SELECT model FROM pricing_overrides WHERE model!=''`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	targets := make(map[string]string)
	for rows.Next() {
		var model string
		if err := rows.Scan(&model); err != nil {
			return nil, err
		}
		for _, target := range pricingAliasTargetsForModel(model) {
			key := aliasCandidateKey(target)
			if key == "" {
				continue
			}
			if betterAliasTarget(targets[key], target) {
				targets[key] = target
			}
		}
	}
	return targets, rows.Err()
}

func hasPricingBackedAliasCandidate(key, canonical string, variants []ModelAliasVariant, pricingTargets map[string]string) bool {
	if strings.TrimSpace(pricingTargets[key]) == "" {
		return false
	}
	canonical = strings.TrimSpace(canonical)
	if canonical == "" {
		return false
	}
	for _, v := range variants {
		raw := strings.TrimSpace(v.RawModel)
		model := strings.TrimSpace(v.Model)
		if raw == "" || strings.EqualFold(raw, canonical) || strings.EqualFold(model, canonical) {
			continue
		}
		if aliasCandidateKey(raw) == key {
			return true
		}
	}
	return false
}

// GetModelAliasCandidates returns raw model spellings that likely refer to the same model.
func (d *DB) GetModelAliasCandidates() ([]ModelAliasCandidate, error) {
	pricingTargets, err := d.loadPricingAliasTargets()
	if err != nil {
		return nil, err
	}
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
		sort.Slice(variants, func(i, j int) bool {
			if variants[i].UsageCount == variants[j].UsageCount {
				return strings.ToLower(variants[i].RawModel) < strings.ToLower(variants[j].RawModel)
			}
			return variants[i].UsageCount > variants[j].UsageCount
		})
		canonical := chooseCandidateCanonical(key, variants, pricingTargets)
		if len(rawNames) < 2 && !hasPricingBackedAliasCandidate(key, canonical, variants, pricingTargets) {
			continue
		}
		c := ModelAliasCandidate{
			CanonicalModel: canonical,
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
