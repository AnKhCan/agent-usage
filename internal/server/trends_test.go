package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"testing"
	"time"

	"github.com/briqt/agent-usage/internal/storage"
)

func tempServerDB(t *testing.T) *storage.DB {
	t.Helper()
	db, err := storage.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func TestTrendCompareBreakdownsFollowCompareMode(t *testing.T) {
	db := tempServerDB(t)
	now := time.Now().UTC()

	// Pick an offset that places local "now" near noon so the elapsed and full
	// previous-period ranges have a stable gap regardless of when the test runs.
	minutesSinceUTCStart := now.Hour()*60 + now.Minute()
	tzOffset := minutesSinceUTCStart - 12*60
	queryDate := localTrendDate(now, tzOffset)

	records := []*storage.UsageRecord{
		{Source: "claude", SessionID: "current", Model: "model-a", InputTokens: 100, OutputTokens: 50, CostUSD: 10, Timestamp: now.Add(-time.Hour)},
		{Source: "claude", SessionID: "previous-elapsed", Model: "model-a", InputTokens: 100, OutputTokens: 50, CostUSD: 1, Timestamp: now.AddDate(0, 0, -1).Add(-time.Hour)},
		{Source: "codex", SessionID: "previous-full", Model: "model-b", InputTokens: 100, OutputTokens: 50, CostUSD: 5, Timestamp: now.AddDate(0, 0, -1).Add(time.Hour)},
	}
	if err := db.InsertUsageBatch(records); err != nil {
		t.Fatalf("InsertUsageBatch: %v", err)
	}

	s := &Server{db: db}
	elapsed := requestTrendCompare(t, s, queryDate, tzOffset, "elapsed")
	full := requestTrendCompare(t, s, queryDate, tzOffset, "full")

	if elapsed.CompareMode != "elapsed" {
		t.Fatalf("expected elapsed compare mode, got %q", elapsed.CompareMode)
	}
	if full.CompareMode != "full" {
		t.Fatalf("expected full compare mode, got %q", full.CompareMode)
	}
	if elapsed.CompareRange.To == full.CompareRange.To {
		t.Fatalf("expected different previous range end times, got %s", elapsed.CompareRange.To)
	}
	if itemByName(elapsed.Breakdowns.Models, "model-b") != nil {
		t.Fatalf("elapsed model breakdown should not include late previous-period data: %+v", elapsed.Breakdowns.Models)
	}
	if item := itemByName(full.Breakdowns.Models, "model-b"); item == nil || item.PreviousCost != 5 {
		t.Fatalf("full model breakdown should include late previous-period model-b cost: %+v", full.Breakdowns.Models)
	}
	if itemByName(elapsed.Breakdowns.Sources, "codex") != nil {
		t.Fatalf("elapsed source breakdown should not include late previous-period data: %+v", elapsed.Breakdowns.Sources)
	}
	if item := itemByName(full.Breakdowns.Sources, "codex"); item == nil || item.PreviousCost != 5 {
		t.Fatalf("full source breakdown should include late previous-period codex cost: %+v", full.Breakdowns.Sources)
	}
}

func TestMergeTrendBreakdownsSkipsZeroCostChanges(t *testing.T) {
	current := []storage.TrendBreakdownValue{
		{Name: "unchanged", Cost: 5, Tokens: 100, Calls: 1},
		{Name: "increased", Cost: 12, Tokens: 120, Calls: 2},
		{Name: "decreased", Cost: 1, Tokens: 10, Calls: 1},
		{Name: "free", Cost: 0, Tokens: 50, Calls: 1},
	}
	previous := []storage.TrendBreakdownValue{
		{Name: "unchanged", Cost: 5, Tokens: 80, Calls: 1},
		{Name: "increased", Cost: 2, Tokens: 20, Calls: 1},
		{Name: "decreased", Cost: 4, Tokens: 40, Calls: 2},
		{Name: "free", Cost: 0, Tokens: 10, Calls: 1},
	}

	items := mergeTrendBreakdowns(current, previous, 10)
	if itemByName(items, "unchanged") != nil {
		t.Fatalf("unchanged zero-cost delta should be filtered out: %+v", items)
	}
	if itemByName(items, "free") != nil {
		t.Fatalf("free zero-cost delta should be filtered out: %+v", items)
	}
	if len(items) != 2 {
		t.Fatalf("expected only nonzero cost changes, got %+v", items)
	}
	if items[0].Name != "increased" || items[1].Name != "decreased" {
		t.Fatalf("expected items sorted by absolute cost delta, got %+v", items)
	}

	limited := mergeTrendBreakdowns(current, previous, 1)
	if len(limited) != 1 || limited[0].Name != "increased" {
		t.Fatalf("expected limit after zero-cost filtering, got %+v", limited)
	}
}

func requestTrendCompare(t *testing.T, s *Server, date string, tzOffset int, mode string) trendCompareResponse {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/trends/compare?from="+date+"&to="+date+"&tz_offset="+strconv.Itoa(tzOffset)+"&compare_mode="+mode, nil)
	rec := httptest.NewRecorder()
	s.handleTrendCompare(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("handleTrendCompare status %d: %s", rec.Code, rec.Body.String())
	}
	var resp trendCompareResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	return resp
}

func itemByName(items []trendBreakdownItem, name string) *trendBreakdownItem {
	for i := range items {
		if items[i].Name == name {
			return &items[i]
		}
	}
	return nil
}
