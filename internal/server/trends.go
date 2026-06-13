package server

import (
	"math"
	"net/http"
	"sort"
	"time"

	"github.com/briqt/agent-usage/internal/storage"
)

type trendRange struct {
	From string `json:"from"`
	To   string `json:"to"`
}

type compareMetric struct {
	Current  float64  `json:"current"`
	Previous float64  `json:"previous"`
	Delta    float64  `json:"delta"`
	DeltaPct *float64 `json:"delta_pct,omitempty"`
}

type trendSummary struct {
	Cost         compareMetric `json:"cost"`
	Tokens       compareMetric `json:"tokens"`
	Sessions     compareMetric `json:"sessions"`
	Prompts      compareMetric `json:"prompts"`
	Calls        compareMetric `json:"calls"`
	CacheHitRate compareMetric `json:"cache_hit_rate"`
}

type trendSeriesValue struct {
	Cost     float64 `json:"cost"`
	Tokens   int64   `json:"tokens"`
	Calls    int     `json:"calls"`
	Sessions int     `json:"sessions"`
}

type trendComparePoint struct {
	Label         string           `json:"label"`
	PreviousLabel string           `json:"previous_label"`
	Current       trendSeriesValue `json:"current"`
	Previous      trendSeriesValue `json:"previous"`
}

type trendBreakdownItem struct {
	Name           string   `json:"name"`
	CurrentCost    float64  `json:"current_cost"`
	PreviousCost   float64  `json:"previous_cost"`
	DeltaCost      float64  `json:"delta_cost"`
	DeltaCostPct   *float64 `json:"delta_cost_pct,omitempty"`
	CurrentTokens  int64    `json:"current_tokens"`
	PreviousTokens int64    `json:"previous_tokens"`
	DeltaTokens    int64    `json:"delta_tokens"`
	CurrentCalls   int      `json:"current_calls"`
	PreviousCalls  int      `json:"previous_calls"`
	DeltaCalls     int      `json:"delta_calls"`
}

type trendBreakdowns struct {
	Models  []trendBreakdownItem `json:"models"`
	Sources []trendBreakdownItem `json:"sources"`
}

type trendCompareResponse struct {
	Range        trendRange          `json:"range"`
	CompareRange trendRange          `json:"compare_range"`
	CompareMode  string              `json:"compare_mode"`
	Granularity  string              `json:"granularity"`
	Summary      trendSummary        `json:"summary"`
	Series       []trendComparePoint `json:"series"`
	Breakdowns   trendBreakdowns     `json:"breakdowns"`
}

const trendCostEpsilon = 0.0000001

func (s *Server) handleTrendCompare(w http.ResponseWriter, r *http.Request) {
	from, to, compareFrom, compareTo, tzOffset, compareMode, err := s.parseTrendCompareRanges(r)
	if err != nil {
		badRequest(w, err)
		return
	}

	granularity := normalizeTrendGranularity(r.URL.Query().Get("granularity"))
	source := r.URL.Query().Get("source")
	model := r.URL.Query().Get("model")

	currentStats, err := s.db.GetDashboardStats(from, to, source, model)
	if err != nil {
		serverError(w, err)
		return
	}
	previousStats, err := s.db.GetDashboardStats(compareFrom, compareTo, source, model)
	if err != nil {
		serverError(w, err)
		return
	}
	currentSeries, err := s.db.GetTrendSeries(from, to, granularity, source, model, tzOffset)
	if err != nil {
		serverError(w, err)
		return
	}
	previousSeries, err := s.db.GetTrendSeries(compareFrom, compareTo, granularity, source, model, tzOffset)
	if err != nil {
		serverError(w, err)
		return
	}
	currentModels, err := s.db.GetTrendBreakdown(from, to, source, model, "model")
	if err != nil {
		serverError(w, err)
		return
	}
	previousModels, err := s.db.GetTrendBreakdown(compareFrom, compareTo, source, model, "model")
	if err != nil {
		serverError(w, err)
		return
	}
	currentSources, err := s.db.GetTrendBreakdown(from, to, source, model, "source")
	if err != nil {
		serverError(w, err)
		return
	}
	previousSources, err := s.db.GetTrendBreakdown(compareFrom, compareTo, source, model, "source")
	if err != nil {
		serverError(w, err)
		return
	}

	resp := trendCompareResponse{
		Range:        trendRange{From: formatTrendTime(from), To: formatTrendTime(to)},
		CompareRange: trendRange{From: formatTrendTime(compareFrom), To: formatTrendTime(compareTo)},
		CompareMode:  compareMode,
		Granularity:  granularity,
		Summary: trendSummary{
			Cost:         makeCompareMetric(currentStats.TotalCost, previousStats.TotalCost),
			Tokens:       makeCompareMetric(float64(currentStats.TotalTokens), float64(previousStats.TotalTokens)),
			Sessions:     makeCompareMetric(float64(currentStats.TotalSessions), float64(previousStats.TotalSessions)),
			Prompts:      makeCompareMetric(float64(currentStats.TotalPrompts), float64(previousStats.TotalPrompts)),
			Calls:        makeCompareMetric(float64(currentStats.TotalCalls), float64(previousStats.TotalCalls)),
			CacheHitRate: makeCompareMetric(currentStats.CacheHitRate, previousStats.CacheHitRate),
		},
		Series: buildTrendCompareSeries(
			currentSeries,
			previousSeries,
			bucketLabels(from, to, granularity, tzOffset),
			bucketLabels(compareFrom, compareTo, granularity, tzOffset),
		),
		Breakdowns: trendBreakdowns{
			Models:  mergeTrendBreakdowns(currentModels, previousModels, 6),
			Sources: mergeTrendBreakdowns(currentSources, previousSources, 6),
		},
	}

	writeJSON(w, resp)
}

func (s *Server) parseTrendCompareRanges(r *http.Request) (time.Time, time.Time, time.Time, time.Time, int, string, error) {
	from, to, tzOffset, err := s.parseTimeRange(r)
	if err != nil {
		return time.Time{}, time.Time{}, time.Time{}, time.Time{}, 0, "", err
	}

	query := r.URL.Query()
	fromDate, err := trendQueryDate(query.Get("from"), from, tzOffset)
	if err != nil {
		return time.Time{}, time.Time{}, time.Time{}, time.Time{}, 0, "", err
	}
	toDate, err := trendQueryDate(query.Get("to"), to, tzOffset)
	if err != nil {
		return time.Time{}, time.Time{}, time.Time{}, time.Time{}, 0, "", err
	}

	days := int(toDate.Sub(fromDate).Hours()/24) + 1
	if days < 1 {
		days = 1
	}

	compareMode := normalizeCompareMode(query.Get("compare_mode"))
	fullTo := to
	now := time.Now().UTC()
	toRaw := query.Get("to")
	if toRaw == "" {
		toRaw = localTrendDate(to, tzOffset)
	}
	if toRaw == localTrendDate(now, tzOffset) && to.After(now) {
		to = now
	}

	compareFrom := from.AddDate(0, 0, -days)
	compareToBase := to
	if compareMode == "full" {
		compareToBase = fullTo
	}
	compareTo := compareToBase.AddDate(0, 0, -days)
	return from, to, compareFrom, compareTo, tzOffset, compareMode, nil
}

func normalizeCompareMode(mode string) string {
	switch mode {
	case "full":
		return "full"
	default:
		return "elapsed"
	}
}

func trendQueryDate(raw string, fallback time.Time, tzOffset int) (time.Time, error) {
	if raw == "" {
		raw = localTrendDate(fallback, tzOffset)
	}
	return time.Parse("2006-01-02", raw)
}

func localTrendDate(t time.Time, tzOffset int) string {
	return t.Add(-time.Duration(tzOffset) * time.Minute).Format("2006-01-02")
}

func formatTrendTime(t time.Time) string {
	return t.UTC().Format(time.RFC3339)
}

func makeCompareMetric(current, previous float64) compareMetric {
	m := compareMetric{
		Current:  current,
		Previous: previous,
		Delta:    current - previous,
	}
	if previous != 0 {
		pct := (m.Delta / previous) * 100
		m.DeltaPct = &pct
	}
	return m
}

func normalizeTrendGranularity(g string) string {
	switch g {
	case "1m", "30m", "1h", "6h", "12h", "1d", "1w", "1M":
		return g
	default:
		return "1d"
	}
}

func trendLocalTime(t time.Time, tzOffset int) time.Time {
	return t.Add(-time.Duration(tzOffset) * time.Minute)
}

func floorTrendBucket(t time.Time, granularity string) time.Time {
	y, m, d := t.Date()
	h, min, _ := t.Clock()
	switch granularity {
	case "1m":
		return time.Date(y, m, d, h, min, 0, 0, time.UTC)
	case "30m":
		return time.Date(y, m, d, h, (min/30)*30, 0, 0, time.UTC)
	case "1h":
		return time.Date(y, m, d, h, 0, 0, 0, time.UTC)
	case "6h":
		return time.Date(y, m, d, (h/6)*6, 0, 0, 0, time.UTC)
	case "12h":
		return time.Date(y, m, d, (h/12)*12, 0, 0, 0, time.UTC)
	case "1w":
		day := time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
		daysSinceMonday := (int(t.Weekday()) + 6) % 7
		return day.AddDate(0, 0, -daysSinceMonday)
	case "1M":
		return time.Date(y, m, 1, 0, 0, 0, 0, time.UTC)
	default:
		return time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
	}
}

func addTrendBucket(t time.Time, granularity string) time.Time {
	switch granularity {
	case "1m":
		return t.Add(time.Minute)
	case "30m":
		return t.Add(30 * time.Minute)
	case "1h":
		return t.Add(time.Hour)
	case "6h":
		return t.Add(6 * time.Hour)
	case "12h":
		return t.Add(12 * time.Hour)
	case "1w":
		return t.AddDate(0, 0, 7)
	case "1M":
		return t.AddDate(0, 1, 0)
	default:
		return t.AddDate(0, 0, 1)
	}
}

func trendBucketLabel(t time.Time, granularity string) string {
	switch granularity {
	case "1m", "30m":
		return t.Format("2006-01-02 15:04")
	case "1h", "6h", "12h":
		return t.Format("2006-01-02 15")
	case "1M":
		return t.Format("2006-01")
	default:
		return t.Format("2006-01-02")
	}
}

func bucketLabels(from, to time.Time, granularity string, tzOffset int) []string {
	start := floorTrendBucket(trendLocalTime(from, tzOffset), granularity)
	end := floorTrendBucket(trendLocalTime(to, tzOffset), granularity)
	labels := make([]string, 0)
	for cur := start; !cur.After(end); cur = addTrendBucket(cur, granularity) {
		labels = append(labels, trendBucketLabel(cur, granularity))
		if len(labels) >= 5000 {
			break
		}
	}
	return labels
}

func buildTrendCompareSeries(current, previous []storage.TrendSeriesPoint, currentLabels, previousLabels []string) []trendComparePoint {
	currentMap := make(map[string]storage.TrendSeriesPoint, len(current))
	for _, p := range current {
		currentMap[p.Date] = p
	}
	previousMap := make(map[string]storage.TrendSeriesPoint, len(previous))
	for _, p := range previous {
		previousMap[p.Date] = p
	}

	n := len(currentLabels)
	if len(previousLabels) > n {
		n = len(previousLabels)
	}
	result := make([]trendComparePoint, 0, n)
	for i := 0; i < n; i++ {
		var currentLabel, previousLabel string
		if i < len(currentLabels) {
			currentLabel = currentLabels[i]
		}
		if i < len(previousLabels) {
			previousLabel = previousLabels[i]
		}
		result = append(result, trendComparePoint{
			Label:         currentLabel,
			PreviousLabel: previousLabel,
			Current:       trendSeriesValueFromPoint(currentMap[currentLabel]),
			Previous:      trendSeriesValueFromPoint(previousMap[previousLabel]),
		})
	}
	return result
}

func trendSeriesValueFromPoint(p storage.TrendSeriesPoint) trendSeriesValue {
	return trendSeriesValue{
		Cost:     p.Cost,
		Tokens:   p.Tokens,
		Calls:    p.Calls,
		Sessions: p.Sessions,
	}
}

func mergeTrendBreakdowns(current, previous []storage.TrendBreakdownValue, limit int) []trendBreakdownItem {
	type pair struct {
		current  storage.TrendBreakdownValue
		previous storage.TrendBreakdownValue
	}
	itemsByName := map[string]*pair{}
	for _, item := range current {
		if _, ok := itemsByName[item.Name]; !ok {
			itemsByName[item.Name] = &pair{}
		}
		itemsByName[item.Name].current = item
	}
	for _, item := range previous {
		if _, ok := itemsByName[item.Name]; !ok {
			itemsByName[item.Name] = &pair{}
		}
		itemsByName[item.Name].previous = item
	}

	result := make([]trendBreakdownItem, 0, len(itemsByName))
	for name, pair := range itemsByName {
		item := trendBreakdownItem{
			Name:           name,
			CurrentCost:    pair.current.Cost,
			PreviousCost:   pair.previous.Cost,
			DeltaCost:      pair.current.Cost - pair.previous.Cost,
			CurrentTokens:  pair.current.Tokens,
			PreviousTokens: pair.previous.Tokens,
			DeltaTokens:    pair.current.Tokens - pair.previous.Tokens,
			CurrentCalls:   pair.current.Calls,
			PreviousCalls:  pair.previous.Calls,
			DeltaCalls:     pair.current.Calls - pair.previous.Calls,
		}
		if pair.previous.Cost != 0 {
			pct := (item.DeltaCost / pair.previous.Cost) * 100
			item.DeltaCostPct = &pct
		}
		if math.Abs(item.DeltaCost) < trendCostEpsilon {
			continue
		}
		result = append(result, item)
	}

	sort.Slice(result, func(i, j int) bool {
		ai := math.Abs(result[i].DeltaCost)
		aj := math.Abs(result[j].DeltaCost)
		if ai == aj {
			return result[i].CurrentCost > result[j].CurrentCost
		}
		return ai > aj
	})
	if limit > 0 && len(result) > limit {
		result = result[:limit]
	}
	return result
}
