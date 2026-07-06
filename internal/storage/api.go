package storage

import (
	"fmt"
	"sort"
	"strings"
	"time"
)

// sourceFilter returns a SQL clause and args for optional source filtering.
func sourceFilter(source string) (string, []interface{}) {
	if source == "" {
		return "", nil
	}
	return " AND source=?", []interface{}{source}
}

// modelFilter returns a SQL clause and args for optional model filtering.
func modelFilter(model string) (string, []interface{}) {
	return modelsFilter(splitModelFilterValues([]string{model}))
}

func splitModelFilterValues(values []string) []string {
	seen := map[string]bool{}
	var models []string
	for _, value := range values {
		for _, part := range strings.Split(value, ",") {
			model := strings.TrimSpace(part)
			if model == "" || seen[model] {
				continue
			}
			seen[model] = true
			models = append(models, model)
		}
	}
	return models
}

// modelsFilter returns a SQL clause and args for optional model filtering.
func modelsFilter(models []string) (string, []interface{}) {
	models = splitModelFilterValues(models)
	if len(models) == 0 {
		return "", nil
	}
	if len(models) == 1 {
		return " AND model=?", []interface{}{models[0]}
	}
	placeholders := make([]string, len(models))
	args := make([]interface{}, len(models))
	for i, model := range models {
		placeholders[i] = "?"
		args[i] = model
	}
	return " AND model IN (" + strings.Join(placeholders, ",") + ")", args
}

// DashboardStats holds aggregate statistics for the dashboard summary cards.
type DashboardStats struct {
	TotalCost     float64 `json:"total_cost"`
	TotalTokens   int64   `json:"total_tokens"`
	TotalSessions int     `json:"total_sessions"`
	TotalPrompts  int     `json:"total_prompts"`
	TotalCalls    int     `json:"total_calls"`
	CacheHitRate  float64 `json:"cache_hit_rate"`
}

// CostByModel represents total cost for a single model.
type CostByModel struct {
	Model string  `json:"model"`
	Cost  float64 `json:"cost"`
}

// TimeSeriesPoint represents a single data point in a daily cost time series.
type TimeSeriesPoint struct {
	Date  string  `json:"date"`
	Value float64 `json:"value"`
	Model string  `json:"model,omitempty"`
}

// TokenTimeSeriesPoint represents daily token usage broken down by category.
type TokenTimeSeriesPoint struct {
	Date         string `json:"date"`
	InputTokens  int64  `json:"input_tokens"`
	OutputTokens int64  `json:"output_tokens"`
	CacheRead    int64  `json:"cache_read"`
	CacheCreate  int64  `json:"cache_create"`
}

// TrendSeriesPoint represents usage totals for a single trend bucket.
type TrendSeriesPoint struct {
	Date     string  `json:"date"`
	Cost     float64 `json:"cost"`
	Tokens   int64   `json:"tokens"`
	Calls    int     `json:"calls"`
	Sessions int     `json:"sessions"`
}

// TrendBreakdownValue represents usage totals grouped by one dimension.
type TrendBreakdownValue struct {
	Name   string  `json:"name"`
	Cost   float64 `json:"cost"`
	Tokens int64   `json:"tokens"`
	Calls  int     `json:"calls"`
}

// SessionInfo represents a session with aggregated cost and token totals.
type SessionInfo struct {
	SessionID  string  `json:"session_id"`
	Source     string  `json:"source"`
	Project    string  `json:"project"`
	CWD        string  `json:"cwd"`
	GitBranch  string  `json:"git_branch"`
	StartTime  string  `json:"start_time"`
	UpdateTime string  `json:"update_time"`
	Prompts    int     `json:"prompts"`
	TotalCost  float64 `json:"total_cost"`
	Tokens     int64   `json:"tokens"`
}

// SessionPage represents one page of aggregated sessions plus pagination metadata.
type SessionPage struct {
	Items      []SessionInfo `json:"items"`
	Page       int           `json:"page"`
	PageSize   int           `json:"page_size"`
	Total      int           `json:"total"`
	TotalPages int           `json:"total_pages"`
}

// ProjectOption represents a canonical project filter option derived from
// session metadata. Key is stable for filtering; Label is for display.
type ProjectOption struct {
	Key      string   `json:"key"`
	Label    string   `json:"label"`
	Sessions int      `json:"sessions"`
	Sources  []string `json:"sources"`
	Cost     float64  `json:"cost"`
}

func projectBaseName(value string) string {
	v := strings.TrimSpace(value)
	if v == "" {
		return ""
	}
	v = strings.TrimRight(v, `/\`)
	v = strings.ReplaceAll(v, `\`, `/`)
	if idx := strings.LastIndex(v, "/"); idx >= 0 {
		v = v[idx+1:]
	}
	if v == "." || v == "/" {
		return ""
	}
	return strings.TrimSpace(v)
}

func canonicalProject(project, cwd string) (key, label string) {
	label = projectBaseName(cwd)
	if label == "" {
		label = projectBaseName(project)
	}
	if label == "" {
		label = strings.TrimSpace(project)
	}
	if label == "" {
		label = strings.TrimSpace(cwd)
	}
	if label == "" {
		return "", ""
	}
	return strings.ToLower(label), label
}

// GetDashboardStats returns aggregate cost, token, session, and prompt counts
// for usage records within the given time range.
func (d *DB) GetDashboardStats(from, to time.Time, source, model string) (*DashboardStats, error) {
	return d.GetDashboardStatsForModels(from, to, source, splitModelFilterValues([]string{model}))
}

// GetDashboardStatsForModels returns dashboard aggregate statistics filtered
// to any of the given models. An empty model list means all models.
func (d *DB) GetDashboardStatsForModels(from, to time.Time, source string, models []string) (*DashboardStats, error) {
	s := &DashboardStats{}
	sf, sa := sourceFilter(source)
	mf, ma := modelsFilter(models)
	args := append([]interface{}{from, to}, sa...)
	args = append(args, ma...)
	filter := sf + mf
	var cacheRead, totalInput int64
	err := d.db.QueryRow(`SELECT COALESCE(SUM(cost_usd),0),
		COALESCE(SUM(input_tokens+cache_read_input_tokens+cache_creation_input_tokens+output_tokens),0),
		COALESCE(SUM(cache_read_input_tokens),0),
		COALESCE(SUM(input_tokens+cache_read_input_tokens+cache_creation_input_tokens),0)
		FROM usage_records WHERE timestamp BETWEEN ? AND ?`+filter, args...).Scan(&s.TotalCost, &s.TotalTokens, &cacheRead, &totalInput)
	if err != nil {
		return nil, err
	}
	if totalInput > 0 {
		s.CacheHitRate = float64(cacheRead) / float64(totalInput)
	}
	d.db.QueryRow(`SELECT COUNT(DISTINCT session_id) FROM usage_records WHERE timestamp BETWEEN ? AND ?`+filter, args...).Scan(&s.TotalSessions)
	d.db.QueryRow(`SELECT COUNT(*) FROM prompt_events WHERE timestamp BETWEEN ? AND ?`+sf, append([]interface{}{from, to}, sa...)...).Scan(&s.TotalPrompts)
	d.db.QueryRow(`SELECT COUNT(*) FROM usage_records WHERE timestamp BETWEEN ? AND ?`+filter, args...).Scan(&s.TotalCalls)
	return s, nil
}

// GetCostByModel returns total cost grouped by model within the given time range.
func (d *DB) GetCostByModel(from, to time.Time, source string) ([]CostByModel, error) {
	return d.GetCostByModelForModels(from, to, source, nil)
}

// GetCostByModelForModels returns total cost grouped by model within the given
// time range, optionally restricted to a model set.
func (d *DB) GetCostByModelForModels(from, to time.Time, source string, models []string) ([]CostByModel, error) {
	sf, sa := sourceFilter(source)
	mf, ma := modelsFilter(models)
	args := append([]interface{}{from, to}, sa...)
	args = append(args, ma...)
	rows, err := d.db.Query(`SELECT model, SUM(cost_usd) as cost FROM usage_records
		WHERE timestamp BETWEEN ? AND ?`+sf+mf+` GROUP BY model ORDER BY cost DESC`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []CostByModel
	for rows.Next() {
		var r CostByModel
		if err := rows.Scan(&r.Model, &r.Cost); err != nil {
			return nil, err
		}
		result = append(result, r)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return result, nil
}

// granularityExpr returns a SQL expression that truncates a timestamp column
// to the bucket boundary for the given granularity code.
// Timestamps are stored as Go time strings like "2026-04-03 09:51:45.996 +0000 UTC",
// so we use SUBSTR-based extraction since SQLite's STRFTIME cannot parse this format.
// Supported codes: 1m, 30m, 1h, 6h, 12h, 1d, 1w, 1M.
func granularityExpr(g string, tzOffset int) string {
	// Base timestamp expression: either raw or shifted to user's local time.
	// tzOffset uses JS getTimezoneOffset() convention (UTC-local in minutes).
	// To convert UTC→local we apply -tzOffset minutes.
	ts := "timestamp"
	if tzOffset != 0 {
		ts = fmt.Sprintf("DATETIME(SUBSTR(timestamp,1,19), '%+d minutes')", -tzOffset)
	}

	switch g {
	case "1m":
		return `SUBSTR(` + ts + `,1,16)`
	case "30m":
		return `SUBSTR(` + ts + `,1,14) || PRINTF('%02d', (CAST(SUBSTR(` + ts + `,15,2) AS INTEGER)/30)*30)`
	case "1h":
		return `SUBSTR(` + ts + `,1,13)`
	case "6h":
		return `SUBSTR(` + ts + `,1,11) || PRINTF('%02d', (CAST(SUBSTR(` + ts + `,12,2) AS INTEGER)/6)*6)`
	case "12h":
		return `SUBSTR(` + ts + `,1,11) || PRINTF('%02d', (CAST(SUBSTR(` + ts + `,12,2) AS INTEGER)/12)*12)`
	case "1w":
		return `DATE(SUBSTR(` + ts + `,1,10), 'weekday 0', '-6 days')`
	case "1M":
		return `SUBSTR(` + ts + `,1,7)`
	default: // "1d" or unknown
		return `SUBSTR(` + ts + `,1,10)`
	}
}

// GetCostOverTime returns cost per model grouped by the given granularity within the time range.
func (d *DB) GetCostOverTime(from, to time.Time, granularity, source, model string, tzOffset int) ([]TimeSeriesPoint, error) {
	return d.GetCostOverTimeForModels(from, to, granularity, source, splitModelFilterValues([]string{model}), tzOffset)
}

// GetCostOverTimeForModels returns cost per model grouped by the given
// granularity within the time range, optionally restricted to a model set.
func (d *DB) GetCostOverTimeForModels(from, to time.Time, granularity, source string, models []string, tzOffset int) ([]TimeSeriesPoint, error) {
	expr := granularityExpr(granularity, tzOffset)
	sf, sa := sourceFilter(source)
	mf, ma := modelsFilter(models)
	args := append([]interface{}{from, to}, sa...)
	args = append(args, ma...)
	filter := sf + mf
	rows, err := d.db.Query(`SELECT `+expr+` as d, model, SUM(cost_usd) as cost
		FROM usage_records WHERE timestamp BETWEEN ? AND ?`+filter+`
		GROUP BY d, model ORDER BY d`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []TimeSeriesPoint
	for rows.Next() {
		var p TimeSeriesPoint
		if err := rows.Scan(&p.Date, &p.Model, &p.Value); err != nil {
			return nil, err
		}
		result = append(result, p)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return result, nil
}

// GetTokensOverTime returns token usage breakdown grouped by the given granularity within the time range.
func (d *DB) GetTokensOverTime(from, to time.Time, granularity, source, model string, tzOffset int) ([]TokenTimeSeriesPoint, error) {
	return d.GetTokensOverTimeForModels(from, to, granularity, source, splitModelFilterValues([]string{model}), tzOffset)
}

// GetTokensOverTimeForModels returns token usage grouped by the given
// granularity, optionally restricted to a model set.
func (d *DB) GetTokensOverTimeForModels(from, to time.Time, granularity, source string, models []string, tzOffset int) ([]TokenTimeSeriesPoint, error) {
	expr := granularityExpr(granularity, tzOffset)
	sf, sa := sourceFilter(source)
	mf, ma := modelsFilter(models)
	args := append([]interface{}{from, to}, sa...)
	args = append(args, ma...)
	filter := sf + mf
	rows, err := d.db.Query(`SELECT `+expr+` as d,
		SUM(input_tokens) as inp, SUM(output_tokens) as outp,
		SUM(cache_read_input_tokens) as cr, SUM(cache_creation_input_tokens) as cc
		FROM usage_records WHERE timestamp BETWEEN ? AND ?`+filter+`
		GROUP BY d ORDER BY d`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []TokenTimeSeriesPoint
	for rows.Next() {
		var p TokenTimeSeriesPoint
		if err := rows.Scan(&p.Date, &p.InputTokens, &p.OutputTokens, &p.CacheRead, &p.CacheCreate); err != nil {
			return nil, err
		}
		result = append(result, p)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return result, nil
}

// GetTrendSeries returns total cost and token usage grouped by the given granularity.
func (d *DB) GetTrendSeries(from, to time.Time, granularity, source, model string, tzOffset int) ([]TrendSeriesPoint, error) {
	return d.GetTrendSeriesForModels(from, to, granularity, source, splitModelFilterValues([]string{model}), tzOffset)
}

// GetTrendSeriesForModels returns total cost and token usage grouped by the
// given granularity, optionally restricted to a model set.
func (d *DB) GetTrendSeriesForModels(from, to time.Time, granularity, source string, models []string, tzOffset int) ([]TrendSeriesPoint, error) {
	expr := granularityExpr(granularity, tzOffset)
	sf, sa := sourceFilter(source)
	mf, ma := modelsFilter(models)
	args := append([]interface{}{from, to}, sa...)
	args = append(args, ma...)
	filter := sf + mf
	rows, err := d.db.Query(`SELECT `+expr+` as d,
		COALESCE(SUM(cost_usd),0) as cost,
		COALESCE(SUM(input_tokens+cache_read_input_tokens+cache_creation_input_tokens+output_tokens),0) as tokens,
		COUNT(*) as calls,
		COUNT(DISTINCT session_id) as sessions
		FROM usage_records WHERE timestamp BETWEEN ? AND ?`+filter+`
		GROUP BY d ORDER BY d`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []TrendSeriesPoint
	for rows.Next() {
		var p TrendSeriesPoint
		if err := rows.Scan(&p.Date, &p.Cost, &p.Tokens, &p.Calls, &p.Sessions); err != nil {
			return nil, err
		}
		result = append(result, p)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return result, nil
}

// GetTrendBreakdown returns total usage grouped by a safe dimension.
func (d *DB) GetTrendBreakdown(from, to time.Time, source, model, dimension string) ([]TrendBreakdownValue, error) {
	return d.GetTrendBreakdownForModels(from, to, source, splitModelFilterValues([]string{model}), dimension)
}

// GetTrendBreakdownForModels returns total usage grouped by a safe dimension,
// optionally restricted to a model set.
func (d *DB) GetTrendBreakdownForModels(from, to time.Time, source string, models []string, dimension string) ([]TrendBreakdownValue, error) {
	var expr string
	switch dimension {
	case "source":
		expr = "source"
	case "model":
		expr = "model"
	default:
		return nil, fmt.Errorf("unsupported trend breakdown dimension %q", dimension)
	}

	sf, sa := sourceFilter(source)
	mf, ma := modelsFilter(models)
	args := append([]interface{}{from, to}, sa...)
	args = append(args, ma...)
	filter := sf + mf
	rows, err := d.db.Query(`SELECT `+expr+` as name,
		COALESCE(SUM(cost_usd),0) as cost,
		COALESCE(SUM(input_tokens+cache_read_input_tokens+cache_creation_input_tokens+output_tokens),0) as tokens,
		COUNT(*) as calls
		FROM usage_records WHERE timestamp BETWEEN ? AND ?`+filter+`
		GROUP BY name ORDER BY cost DESC`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []TrendBreakdownValue
	for rows.Next() {
		var b TrendBreakdownValue
		if err := rows.Scan(&b.Name, &b.Cost, &b.Tokens, &b.Calls); err != nil {
			return nil, err
		}
		result = append(result, b)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return result, nil
}

// GetProjectOptions returns canonical project choices for sessions that have
// usage in the selected time range and global source/model filters.
func (d *DB) GetProjectOptions(from, to time.Time, source, model string) ([]ProjectOption, error) {
	return d.GetProjectOptionsForModels(from, to, source, splitModelFilterValues([]string{model}))
}

// GetProjectOptionsForModels returns canonical project choices for sessions
// that have usage in the selected time range and global source/model filters.
func (d *DB) GetProjectOptionsForModels(from, to time.Time, source string, models []string) ([]ProjectOption, error) {
	sf, sa := sourceFilter(source)
	mf, ma := modelsFilter(models)
	filter := sf + mf
	args := append([]interface{}{from, to}, sa...)
	args = append(args, ma...)

	rows, err := d.db.Query(`SELECT s.source, s.project, s.cwd, COALESCE(u.cost,0)
		FROM sessions s
		LEFT JOIN (SELECT session_id, SUM(cost_usd) as cost
			FROM usage_records WHERE timestamp BETWEEN ? AND ?`+filter+` GROUP BY session_id) u
		ON s.session_id = u.session_id
		WHERE u.session_id IS NOT NULL`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	type projectAgg struct {
		option  ProjectOption
		sources map[string]bool
	}
	byKey := map[string]*projectAgg{}
	for rows.Next() {
		var sourceName, project, cwd string
		var cost float64
		if err := rows.Scan(&sourceName, &project, &cwd, &cost); err != nil {
			return nil, err
		}
		key, label := canonicalProject(project, cwd)
		if key == "" {
			continue
		}
		agg := byKey[key]
		if agg == nil {
			agg = &projectAgg{
				option:  ProjectOption{Key: key, Label: label},
				sources: map[string]bool{},
			}
			byKey[key] = agg
		}
		if len(label) < len(agg.option.Label) {
			agg.option.Label = label
		}
		agg.option.Sessions++
		agg.option.Cost += cost
		if sourceName != "" {
			agg.sources[sourceName] = true
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	result := make([]ProjectOption, 0, len(byKey))
	for _, agg := range byKey {
		for src := range agg.sources {
			agg.option.Sources = append(agg.option.Sources, src)
		}
		sort.Strings(agg.option.Sources)
		result = append(result, agg.option)
	}
	sort.Slice(result, func(i, j int) bool {
		return strings.ToLower(result[i].Label) < strings.ToLower(result[j].Label)
	})
	return result, nil
}

// SessionDetail represents per-model breakdown for a single session.
type SessionDetail struct {
	Model        string  `json:"model"`
	Calls        int     `json:"calls"`
	InputTokens  int64   `json:"input_tokens"`
	OutputTokens int64   `json:"output_tokens"`
	CacheRead    int64   `json:"cache_read"`
	CacheCreate  int64   `json:"cache_create"`
	CostUSD      float64 `json:"cost_usd"`
}

// GetSessionDetail returns per-model usage breakdown for a specific session.
func (d *DB) GetSessionDetail(sessionID string) ([]SessionDetail, error) {
	rows, err := d.db.Query(`SELECT model, COUNT(*) as calls,
		SUM(input_tokens) as inp, SUM(output_tokens) as outp,
		SUM(cache_read_input_tokens) as cr, SUM(cache_creation_input_tokens) as cc,
		SUM(cost_usd) as cost
		FROM usage_records WHERE session_id=?
		GROUP BY model ORDER BY cost DESC`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []SessionDetail
	for rows.Next() {
		var d SessionDetail
		if err := rows.Scan(&d.Model, &d.Calls, &d.InputTokens, &d.OutputTokens, &d.CacheRead, &d.CacheCreate, &d.CostUSD); err != nil {
			return nil, err
		}
		result = append(result, d)
	}
	return result, rows.Err()
}

// GetSessions returns sessions with aggregated cost and token totals within the given time range.
func (d *DB) GetSessions(from, to time.Time, source, model string) ([]SessionInfo, error) {
	return d.GetSessionsForModels(from, to, source, splitModelFilterValues([]string{model}))
}

// GetSessionsForModels returns sessions with aggregated cost and token totals
// within the given time range, optionally restricted to a model set.
func (d *DB) GetSessionsForModels(from, to time.Time, source string, models []string) ([]SessionInfo, error) {
	sf, sa := sourceFilter(source)
	mf, ma := modelsFilter(models)
	filter := sf + mf
	baseArgs := append([]interface{}{from, to}, sa...)
	baseArgs = append(baseArgs, ma...)
	// prompt_events doesn't have model column, so only apply source filter there
	promptArgs := append([]interface{}{from, to}, sa...)
	args := append([]interface{}{}, baseArgs...)
	args = append(args, promptArgs...)
	rows, err := d.db.Query(`SELECT s.session_id, s.source, s.project, s.cwd, s.git_branch,
		COALESCE(s.start_time,''), COALESCE(s.update_time,''), COALESCE(p.prompts,0),
		COALESCE(u.cost,0), COALESCE(u.tokens,0)
		FROM sessions s
		LEFT JOIN (SELECT session_id, SUM(cost_usd) as cost, SUM(input_tokens+cache_read_input_tokens+cache_creation_input_tokens+output_tokens) as tokens
			FROM usage_records WHERE timestamp BETWEEN ? AND ?`+filter+` GROUP BY session_id) u
		ON s.session_id = u.session_id
		LEFT JOIN (SELECT session_id, COUNT(*) as prompts
			FROM prompt_events WHERE timestamp BETWEEN ? AND ?`+sf+` GROUP BY session_id) p
		ON s.session_id = p.session_id
		WHERE u.session_id IS NOT NULL
		ORDER BY s.start_time DESC`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []SessionInfo
	for rows.Next() {
		var s SessionInfo
		if err := rows.Scan(&s.SessionID, &s.Source, &s.Project, &s.CWD, &s.GitBranch, &s.StartTime, &s.UpdateTime, &s.Prompts, &s.TotalCost, &s.Tokens); err != nil {
			return nil, err
		}
		result = append(result, s)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return result, nil
}

func normalizePage(page, pageSize int) (int, int) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 20
	}
	if pageSize > 200 {
		pageSize = 200
	}
	return page, pageSize
}

func sessionSortExpr(sort string) string {
	switch sort {
	case "source":
		return "LOWER(s.source)"
	case "project":
		return "LOWER(COALESCE(NULLIF(s.project,''), s.cwd))"
	case "git_branch":
		return "LOWER(s.git_branch)"
	case "prompts":
		return "prompts"
	case "tokens":
		return "tokens"
	case "total_cost":
		return "total_cost"
	case "update_time":
		return "s.update_time"
	default:
		return "s.start_time"
	}
}

// GetSessionsPage returns one page of sessions with server-side project filtering,
// sorting, and pagination. It preserves GetSessions for compatibility with older API clients.
func (d *DB) GetSessionsPage(from, to time.Time, source, model, project, sort, dir string, page, pageSize int) (*SessionPage, error) {
	return d.GetSessionsPageForModels(from, to, source, splitModelFilterValues([]string{model}), project, sort, dir, page, pageSize)
}

// GetSessionsPageForModels returns one page of sessions with server-side
// project filtering, sorting, pagination, and optional multi-model filtering.
func (d *DB) GetSessionsPageForModels(from, to time.Time, source string, models []string, project, sort, dir string, page, pageSize int) (*SessionPage, error) {
	page, pageSize = normalizePage(page, pageSize)

	sf, sa := sourceFilter(source)
	mf, ma := modelsFilter(models)
	filter := sf + mf
	baseArgs := append([]interface{}{from, to}, sa...)
	baseArgs = append(baseArgs, ma...)
	promptArgs := append([]interface{}{from, to}, sa...)
	args := append([]interface{}{}, baseArgs...)
	args = append(args, promptArgs...)

	projectClause := ""
	projectKey, _ := canonicalProject(project, "")
	if projectKey != "" {
		projectClause = ` AND agent_usage_canonical_project_key(s.project, s.cwd) = ?`
		args = append(args, projectKey)
	}

	baseQuery := ` FROM sessions s
		LEFT JOIN (SELECT session_id, SUM(cost_usd) as cost, SUM(input_tokens+cache_read_input_tokens+cache_creation_input_tokens+output_tokens) as tokens
			FROM usage_records WHERE timestamp BETWEEN ? AND ?` + filter + ` GROUP BY session_id) u
		ON s.session_id = u.session_id
		LEFT JOIN (SELECT session_id, COUNT(*) as prompts
			FROM prompt_events WHERE timestamp BETWEEN ? AND ?` + sf + ` GROUP BY session_id) p
		ON s.session_id = p.session_id
		WHERE u.session_id IS NOT NULL` + projectClause

	direction := "DESC"
	if strings.EqualFold(dir, "asc") {
		direction = "ASC"
	}
	orderExpr := sessionSortExpr(sort)

	var total int
	if err := d.db.QueryRow(`SELECT COUNT(*)`+baseQuery, args...).Scan(&total); err != nil {
		return nil, err
	}

	totalPages := 1
	if total > 0 {
		totalPages = (total + pageSize - 1) / pageSize
	}
	if page > totalPages {
		page = totalPages
	}

	offset := (page - 1) * pageSize

	queryArgs := append([]interface{}{}, args...)
	queryArgs = append(queryArgs, pageSize, offset)
	rows, err := d.db.Query(`SELECT s.session_id, s.source, s.project, s.cwd, s.git_branch,
		COALESCE(s.start_time,''), COALESCE(s.update_time,''), COALESCE(p.prompts,0) as prompts,
		COALESCE(u.cost,0) as total_cost, COALESCE(u.tokens,0) as tokens`+
		baseQuery+` ORDER BY `+orderExpr+` `+direction+`, s.session_id ASC LIMIT ? OFFSET ?`, queryArgs...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := &SessionPage{
		Items:      []SessionInfo{},
		Page:       page,
		PageSize:   pageSize,
		Total:      total,
		TotalPages: totalPages,
	}
	for rows.Next() {
		var s SessionInfo
		if err := rows.Scan(&s.SessionID, &s.Source, &s.Project, &s.CWD, &s.GitBranch, &s.StartTime, &s.UpdateTime, &s.Prompts, &s.TotalCost, &s.Tokens); err != nil {
			return nil, err
		}
		result.Items = append(result.Items, s)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return result, nil
}
