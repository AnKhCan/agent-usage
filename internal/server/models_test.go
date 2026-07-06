package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/briqt/agent-usage/internal/storage"
)

func TestModelsStatusCountsBadgeInputs(t *testing.T) {
	db := tempServerDB(t)
	ts := time.Date(2025, 1, 1, 12, 0, 0, 0, time.UTC)
	if err := db.UpsertModelAlias(storage.ModelAlias{Alias: "provider/model-a", CanonicalModel: "model-a"}); err != nil {
		t.Fatalf("UpsertModelAlias: %v", err)
	}
	records := []*storage.UsageRecord{
		{Source: "codex", SessionID: "s1", Model: "model-a", InputTokens: 100, OutputTokens: 50, Timestamp: ts},
		{Source: "codex", SessionID: "s2", Model: "provider/model-a", InputTokens: 200, OutputTokens: 50, Timestamp: ts.Add(time.Second)},
	}
	if err := db.InsertUsageBatch(records); err != nil {
		t.Fatalf("InsertUsageBatch: %v", err)
	}

	s := &Server{db: db}
	req := httptest.NewRequest(http.MethodGet, "/api/models/status", nil)
	rec := httptest.NewRecorder()
	s.handleModelsStatus(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body.String())
	}
	var resp modelsStatusResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.MissingPriceCount != 1 || resp.AliasCount != 1 || resp.CandidateCount != 0 || resp.BadgeCount != 1 {
		t.Fatalf("unexpected status: %+v", resp)
	}
}

func TestModelsStatusIgnoresConfiguredManualAliasCandidate(t *testing.T) {
	db := tempServerDB(t)
	ts := time.Date(2025, 1, 1, 12, 0, 0, 0, time.UTC)
	records := []*storage.UsageRecord{
		{Source: "codex", SessionID: "s1", Model: "glm-5.1", InputTokens: 100, OutputTokens: 50, Timestamp: ts},
		{Source: "codex", SessionID: "s2", Model: "zai-org/GLM-5.1", InputTokens: 200, OutputTokens: 50, Timestamp: ts.Add(time.Second)},
	}
	if err := db.InsertUsageBatch(records); err != nil {
		t.Fatalf("InsertUsageBatch: %v", err)
	}
	if err := db.UpsertModelAlias(storage.ModelAlias{Alias: "zai-org/GLM-5.1", CanonicalModel: "custom-glm"}); err != nil {
		t.Fatalf("UpsertModelAlias: %v", err)
	}
	if err := db.ApplyModelAliasesForRawModels([]string{"zai-org/GLM-5.1"}); err != nil {
		t.Fatalf("ApplyModelAliasesForRawModels: %v", err)
	}
	if err := db.UpsertPricing("glm-5.1", 0.001, 0.002, 0, 0); err != nil {
		t.Fatalf("UpsertPricing glm-5.1: %v", err)
	}
	if err := db.UpsertPricing("custom-glm", 0.001, 0.002, 0, 0); err != nil {
		t.Fatalf("UpsertPricing custom-glm: %v", err)
	}

	s := &Server{db: db}
	req := httptest.NewRequest(http.MethodGet, "/api/models/status", nil)
	rec := httptest.NewRecorder()
	s.handleModelsStatus(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body.String())
	}
	var resp modelsStatusResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.MissingPriceCount != 0 || resp.CandidateCount != 0 || resp.BadgeCount != 0 {
		t.Fatalf("unexpected status: %+v", resp)
	}
}

func TestModelAliasCRUD(t *testing.T) {
	db := tempServerDB(t)
	ts := time.Date(2025, 1, 1, 12, 0, 0, 0, time.UTC)
	if err := db.InsertUsage(&storage.UsageRecord{Source: "codex", SessionID: "s1", Model: "provider/model-z", InputTokens: 100, Timestamp: ts}); err != nil {
		t.Fatalf("InsertUsage: %v", err)
	}
	s := &Server{db: db}

	putReq := httptest.NewRequest(http.MethodPut, "/api/models/aliases/provider%2Fmodel-z", bytes.NewBufferString(`{"canonical_model":"model-z","note":"same model"}`))
	putRec := httptest.NewRecorder()
	s.handleModelAlias(putRec, putReq)
	if putRec.Code != http.StatusOK {
		t.Fatalf("put status %d: %s", putRec.Code, putRec.Body.String())
	}
	stats, err := db.GetDashboardStats(ts.Add(-time.Hour), ts.Add(time.Hour), "", "model-z")
	if err != nil {
		t.Fatalf("GetDashboardStats: %v", err)
	}
	if stats.TotalCalls != 1 {
		t.Fatalf("expected canonical model-z after put, got %d calls", stats.TotalCalls)
	}

	listReq := httptest.NewRequest(http.MethodGet, "/api/models/aliases", nil)
	listRec := httptest.NewRecorder()
	s.handleModelAliases(listRec, listReq)
	if listRec.Code != http.StatusOK {
		t.Fatalf("list status %d: %s", listRec.Code, listRec.Body.String())
	}
	var aliases []storage.ModelAlias
	if err := json.Unmarshal(listRec.Body.Bytes(), &aliases); err != nil {
		t.Fatalf("decode aliases: %v", err)
	}
	if len(aliases) != 1 || aliases[0].Alias != "provider/model-z" || aliases[0].CanonicalModel != "model-z" {
		t.Fatalf("unexpected aliases: %+v", aliases)
	}
	if aliases[0].UsageCount != 1 || aliases[0].TotalTokens != 100 {
		t.Fatalf("unexpected alias usage stats: %+v", aliases[0])
	}

	delReq := httptest.NewRequest(http.MethodDelete, "/api/models/aliases/provider%2Fmodel-z", nil)
	delRec := httptest.NewRecorder()
	s.handleModelAlias(delRec, delReq)
	if delRec.Code != http.StatusOK {
		t.Fatalf("delete status %d: %s", delRec.Code, delRec.Body.String())
	}
	stats, err = db.GetDashboardStats(ts.Add(-time.Hour), ts.Add(time.Hour), "", "provider/model-z")
	if err != nil {
		t.Fatalf("GetDashboardStats after delete: %v", err)
	}
	if stats.TotalCalls != 1 {
		t.Fatalf("expected raw model after delete, got %d calls", stats.TotalCalls)
	}
}

func TestModelAliasValidationAndMethods(t *testing.T) {
	db := tempServerDB(t)
	s := &Server{db: db}

	badPut := httptest.NewRequest(http.MethodPut, "/api/models/aliases/raw", bytes.NewBufferString(`{"canonical_model":""}`))
	badRec := httptest.NewRecorder()
	s.handleModelAlias(badRec, badPut)
	if badRec.Code != http.StatusBadRequest {
		t.Fatalf("expected bad request for empty canonical, got %d", badRec.Code)
	}

	badPath := httptest.NewRequest(http.MethodPut, "/api/models/aliases/%20", bytes.NewBufferString(`{"canonical_model":"x"}`))
	badPathRec := httptest.NewRecorder()
	s.handleModelAlias(badPathRec, badPath)
	if badPathRec.Code != http.StatusBadRequest {
		t.Fatalf("expected bad request for empty alias, got %d", badPathRec.Code)
	}

	methodReq := httptest.NewRequest(http.MethodPost, "/api/models/aliases/raw", nil)
	methodRec := httptest.NewRecorder()
	s.handleModelAlias(methodRec, methodReq)
	if methodRec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected method not allowed, got %d", methodRec.Code)
	}

	listMethodReq := httptest.NewRequest(http.MethodPost, "/api/models/aliases", nil)
	listMethodRec := httptest.NewRecorder()
	s.handleModelAliases(listMethodRec, listMethodReq)
	if listMethodRec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected method not allowed for list, got %d", listMethodRec.Code)
	}
}

func TestModelAliasCandidatesAPI(t *testing.T) {
	db := tempServerDB(t)
	ts := time.Date(2025, 1, 1, 12, 0, 0, 0, time.UTC)
	records := []*storage.UsageRecord{
		{Source: "codex", SessionID: "s1", Model: "glm-5.1", InputTokens: 100, Timestamp: ts},
		{Source: "codex", SessionID: "s2", Model: "zai-org/GLM-5.1", InputTokens: 100, Timestamp: ts.Add(time.Second)},
	}
	if err := db.InsertUsageBatch(records); err != nil {
		t.Fatalf("InsertUsageBatch: %v", err)
	}
	s := &Server{db: db}
	req := httptest.NewRequest(http.MethodGet, "/api/models/alias-candidates", nil)
	rec := httptest.NewRecorder()
	s.handleModelAliasCandidates(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body.String())
	}
	var candidates []storage.ModelAliasCandidate
	if err := json.Unmarshal(rec.Body.Bytes(), &candidates); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(candidates) != 1 || candidates[0].CanonicalModel != "glm-5.1" {
		t.Fatalf("unexpected candidates: %+v", candidates)
	}
}
