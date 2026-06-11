package server

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"net/url"
	"strings"

	"github.com/briqt/agent-usage/internal/pricing"
	"github.com/briqt/agent-usage/internal/storage"
)

type pricingStatusResponse struct {
	SourceURL      string `json:"source_url"`
	CachePath      string `json:"cache_path"`
	LastSyncAt     string `json:"last_sync_at"`
	LastDownloadAt string `json:"last_download_at"`
	LastError      string `json:"last_error"`
	LastModelCount string `json:"last_model_count"`
	MissingCount   int    `json:"missing_count"`
	OverrideCount  int    `json:"override_count"`
}

type pricingOverrideRequest struct {
	InputCostPerToken           float64 `json:"input_cost_per_token"`
	OutputCostPerToken          float64 `json:"output_cost_per_token"`
	CacheReadInputTokenCost     float64 `json:"cache_read_input_token_cost"`
	CacheCreationInputTokenCost float64 `json:"cache_creation_input_token_cost"`
	Note                        string  `json:"note"`
}

func methodNotAllowed(w http.ResponseWriter, allow string) {
	w.Header().Set("Allow", allow)
	http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
}

func validPrice(n float64) bool {
	return n >= 0 && !math.IsNaN(n) && !math.IsInf(n, 0)
}

func (s *Server) recalcAllCosts() error {
	prices, err := s.db.GetAllPricing()
	if err != nil {
		return err
	}
	return s.db.RecalcAllCosts(prices, pricing.CalcCost)
}

func (s *Server) handlePricingStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, http.MethodGet)
		return
	}
	prices, err := s.db.GetAllPricing()
	if err != nil {
		serverError(w, err)
		return
	}
	missing, err := s.db.GetMissingPricingModels(prices)
	if err != nil {
		serverError(w, err)
		return
	}
	overrides, err := s.db.GetPricingOverrides()
	if err != nil {
		serverError(w, err)
		return
	}
	status := pricingStatusResponse{
		SourceURL:     s.pricingOptions.SourceURL,
		CachePath:     s.pricingOptions.CachePath,
		MissingCount:  len(missing),
		OverrideCount: len(overrides),
	}
	if v, _ := s.db.GetMeta(pricing.MetaSourceURL); v != "" {
		status.SourceURL = v
	}
	if v, _ := s.db.GetMeta(pricing.MetaCachePath); v != "" {
		status.CachePath = v
	}
	status.LastSyncAt, _ = s.db.GetMeta(pricing.MetaLastSyncAt)
	status.LastDownloadAt, _ = s.db.GetMeta(pricing.MetaLastDownloadAt)
	status.LastError, _ = s.db.GetMeta(pricing.MetaLastError)
	status.LastModelCount, _ = s.db.GetMeta(pricing.MetaLastModelCount)
	writeJSON(w, status)
}

func (s *Server) handlePricingMissing(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, http.MethodGet)
		return
	}
	prices, err := s.db.GetAllPricing()
	if err != nil {
		serverError(w, err)
		return
	}
	missing, err := s.db.GetMissingPricingModels(prices)
	if err != nil {
		serverError(w, err)
		return
	}
	if missing == nil {
		missing = []storage.MissingPricingModel{}
	}
	writeJSON(w, missing)
}

func (s *Server) handlePricingOverrides(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, http.MethodGet)
		return
	}
	overrides, err := s.db.GetPricingOverrides()
	if err != nil {
		serverError(w, err)
		return
	}
	if overrides == nil {
		overrides = []storage.PricingOverride{}
	}
	writeJSON(w, overrides)
}

func (s *Server) handlePricingOverride(w http.ResponseWriter, r *http.Request) {
	model, err := overrideModelFromPath(r.URL.Path)
	if err != nil {
		badRequest(w, err)
		return
	}
	switch r.Method {
	case http.MethodPut:
		s.handlePricingOverridePut(w, r, model)
	case http.MethodDelete:
		s.handlePricingOverrideDelete(w, model)
	default:
		methodNotAllowed(w, http.MethodPut+", "+http.MethodDelete)
	}
}

func overrideModelFromPath(path string) (string, error) {
	raw := strings.TrimPrefix(path, "/api/pricing/overrides/")
	if raw == "" {
		return "", fmt.Errorf("model is required")
	}
	model, err := url.PathUnescape(raw)
	if err != nil {
		return "", fmt.Errorf("invalid model path")
	}
	model = strings.TrimSpace(model)
	if model == "" {
		return "", fmt.Errorf("model is required")
	}
	return model, nil
}

func (s *Server) handlePricingOverridePut(w http.ResponseWriter, r *http.Request, model string) {
	allowed, err := s.canSetPricingOverride(model)
	if err != nil {
		serverError(w, err)
		return
	}
	if !allowed {
		badRequest(w, fmt.Errorf("manual pricing can only be set for used models without effective pricing"))
		return
	}

	var req pricingOverrideRequest
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(&req); err != nil {
		badRequest(w, fmt.Errorf("invalid pricing override JSON: %w", err))
		return
	}
	if !validPrice(req.InputCostPerToken) || !validPrice(req.OutputCostPerToken) ||
		!validPrice(req.CacheReadInputTokenCost) || !validPrice(req.CacheCreationInputTokenCost) {
		badRequest(w, fmt.Errorf("prices must be non-negative numbers"))
		return
	}

	override := storage.PricingOverride{
		Model:                       model,
		InputCostPerToken:           req.InputCostPerToken,
		OutputCostPerToken:          req.OutputCostPerToken,
		CacheReadInputTokenCost:     req.CacheReadInputTokenCost,
		CacheCreationInputTokenCost: req.CacheCreationInputTokenCost,
		Note:                        strings.TrimSpace(req.Note),
	}
	if err := s.db.UpsertPricingOverride(override); err != nil {
		serverError(w, err)
		return
	}
	if err := s.recalcAllCosts(); err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, map[string]string{"status": "ok"})
}

func (s *Server) canSetPricingOverride(model string) (bool, error) {
	exists, err := s.db.PricingOverrideExists(model)
	if err != nil || exists {
		return exists, err
	}
	hasUsage, err := s.db.HasUsageModel(model)
	if err != nil || !hasUsage {
		return false, err
	}
	prices, err := s.db.GetAllPricing()
	if err != nil {
		return false, err
	}
	missing, err := s.db.GetMissingPricingModels(prices)
	if err != nil {
		return false, err
	}
	for _, item := range missing {
		if item.Model == model {
			return true, nil
		}
	}
	return false, nil
}

func (s *Server) handlePricingOverrideDelete(w http.ResponseWriter, model string) {
	if err := s.db.DeletePricingOverride(model); err != nil {
		serverError(w, err)
		return
	}
	if err := s.recalcAllCosts(); err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, map[string]string{"status": "ok"})
}

func (s *Server) handlePricingSync(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w, http.MethodPost)
		return
	}
	if err := pricing.Sync(s.db, s.pricingOptions); err != nil {
		serverError(w, err)
		return
	}
	if err := s.recalcAllCosts(); err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, map[string]string{"status": "ok"})
}
