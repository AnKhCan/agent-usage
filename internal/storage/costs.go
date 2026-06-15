package storage

import (
	"fmt"
	"strings"
)

// CostCalcFunc is a function that calculates USD cost from token counts and per-token prices.
type CostCalcFunc func(inputTokens, outputTokens, cacheCreation, cacheRead int64, prices [4]float64) float64

// RecalcCosts recalculates costs for usage records where cost_usd is zero,
// using fuzzy model name matching against the provided pricing map.
func (d *DB) RecalcCosts(allPrices map[string][4]float64, calcFn CostCalcFunc) error {
	return d.recalcCosts(allPrices, calcFn, false)
}

// RecalcAllCosts recalculates every usage record, resetting records without a
// matching price back to zero. This is used after pricing syncs and overrides.
func (d *DB) RecalcAllCosts(allPrices map[string][4]float64, calcFn CostCalcFunc) error {
	return d.recalcCosts(allPrices, calcFn, true)
}

// RecalcAllCostsForRawModels recalculates costs only for records with matching raw models.
func (d *DB) RecalcAllCostsForRawModels(allPrices map[string][4]float64, calcFn CostCalcFunc, rawModels []string) error {
	rawModels = normalizeRawModels(rawModels)
	if len(rawModels) == 0 {
		return nil
	}
	return d.recalcCostsForRawModels(allPrices, calcFn, rawModels)
}

func (d *DB) recalcCosts(allPrices map[string][4]float64, calcFn CostCalcFunc, all bool) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	query := `SELECT id, model, input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens FROM usage_records`
	if !all {
		query += ` WHERE cost_usd = 0`
	}
	rows, err := d.db.Query(query)
	if err != nil {
		return err
	}
	defer rows.Close()

	type rec struct {
		id                    int64
		model                 string
		input, output, cc, cr int64
	}
	var recs []rec
	for rows.Next() {
		var r rec
		if err := rows.Scan(&r.id, &r.model, &r.input, &r.output, &r.cc, &r.cr); err != nil {
			return err
		}
		recs = append(recs, r)
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

	stmt, err := tx.Prepare("UPDATE usage_records SET cost_usd=? WHERE id=?")
	if err != nil {
		return err
	}
	defer stmt.Close()

	updated := 0
	for _, r := range recs {
		prices, ok := matchPricing(r.model, allPrices)
		if !ok {
			if all {
				if _, err := stmt.Exec(0, r.id); err != nil {
					return err
				}
				updated++
			}
			continue
		}
		cost := calcFn(r.input, r.output, r.cc, r.cr, prices)
		if all || cost > 0 {
			if _, err := stmt.Exec(cost, r.id); err != nil {
				return err
			}
			updated++
		}
	}

	if updated > 0 {
		return tx.Commit()
	}
	return nil
}

func (d *DB) recalcCostsForRawModels(allPrices map[string][4]float64, calcFn CostCalcFunc, rawModels []string) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	ph := placeholders(len(rawModels))
	args := make([]any, 0, len(rawModels)*2)
	for _, raw := range rawModels {
		args = append(args, raw)
	}
	for _, raw := range rawModels {
		args = append(args, raw)
	}
	rows, err := d.db.Query(fmt.Sprintf(`SELECT id, model, input_tokens, output_tokens,
		cache_creation_input_tokens, cache_read_input_tokens
		FROM usage_records
		WHERE raw_model IN (%s)
			OR ((raw_model='' OR raw_model IS NULL) AND model IN (%s))`, ph, ph), args...)
	if err != nil {
		return err
	}
	defer rows.Close()

	type rec struct {
		id                    int64
		model                 string
		input, output, cc, cr int64
	}
	var recs []rec
	for rows.Next() {
		var r rec
		if err := rows.Scan(&r.id, &r.model, &r.input, &r.output, &r.cc, &r.cr); err != nil {
			return err
		}
		recs = append(recs, r)
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

	stmt, err := tx.Prepare("UPDATE usage_records SET cost_usd=? WHERE id=?")
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, r := range recs {
		cost := 0.0
		if prices, ok := matchPricing(r.model, allPrices); ok {
			cost = calcFn(r.input, r.output, r.cc, r.cr, prices)
		}
		if _, err := stmt.Exec(cost, r.id); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func placeholders(n int) string {
	if n <= 0 {
		return ""
	}
	return strings.TrimRight(strings.Repeat("?,", n), ",")
}

func matchPricing(model string, allPrices map[string][4]float64) ([4]float64, bool) {
	// Direct match
	if p, ok := allPrices[model]; ok {
		return p, true
	}
	// Try with provider prefix
	for _, prefix := range []string{"anthropic/", "openai/", "deepseek/", "gemini/", "google/", "mistral/", "cohere/", "azure_ai/"} {
		if p, ok := allPrices[prefix+model]; ok {
			return p, true
		}
	}

	// Normalize: replace / with . and version dots with dashes for matching
	norm := func(s string) string {
		s = strings.ToLower(s)
		s = strings.ReplaceAll(s, "/", ".")
		return s
	}

	modelNorm := norm(model)
	// Also try normalizing version numbers: 4.6 -> 4-6
	modelNormDash := strings.NewReplacer("4.6", "4-6", "4.5", "4-5", "3.5", "3-5", "5.4", "5-4").Replace(modelNorm)

	var bestKey string
	var bestScore int
	for k := range allPrices {
		kNorm := norm(k)
		for _, mn := range []string{modelNorm, modelNormDash} {
			if strings.Contains(kNorm, mn) || strings.Contains(mn, kNorm) {
				// Shortest key wins — avoids matching reseller paths over original provider
				score := 10000 - len(k)
				if kNorm == mn {
					score += 100000 // exact normalized match bonus
				}
				if score > bestScore {
					bestKey = k
					bestScore = score
				}
			}
		}
	}
	if bestKey != "" {
		p := allPrices[bestKey]
		return p, true
	}
	return [4]float64{}, false
}
