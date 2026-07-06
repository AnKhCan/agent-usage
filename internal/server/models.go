package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"github.com/briqt/agent-usage/internal/pricing"
	"github.com/briqt/agent-usage/internal/storage"
)

type modelsStatusResponse struct {
	MissingPriceCount int `json:"missing_price_count"`
	AliasCount        int `json:"alias_count"`
	CandidateCount    int `json:"candidate_count"`
	BadgeCount        int `json:"badge_count"`
}

type modelAliasRequest struct {
	CanonicalModel string `json:"canonical_model"`
	Note           string `json:"note"`
}

func countPendingAliasCandidates(candidates []storage.ModelAliasCandidate) int {
	count := 0
	for _, candidate := range candidates {
		canonical := strings.TrimSpace(candidate.CanonicalModel)
		if canonical == "" {
			continue
		}
		for _, variant := range candidate.Variants {
			if !variant.AliasConfigured && strings.TrimSpace(variant.Model) != canonical {
				count++
				break
			}
		}
	}
	return count
}

func (s *Server) handleModelsStatus(w http.ResponseWriter, r *http.Request) {
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
	aliasCount, err := s.db.CountModelAliases()
	if err != nil {
		serverError(w, err)
		return
	}
	candidates, err := s.db.GetModelAliasCandidates()
	if err != nil {
		serverError(w, err)
		return
	}
	pendingCandidateCount := countPendingAliasCandidates(candidates)
	status := modelsStatusResponse{
		MissingPriceCount: len(missing),
		AliasCount:        aliasCount,
		CandidateCount:    pendingCandidateCount,
		BadgeCount:        len(missing) + pendingCandidateCount,
	}
	writeJSON(w, status)
}

func (s *Server) handleModelAliases(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, http.MethodGet)
		return
	}
	aliases, err := s.db.GetModelAliases()
	if err != nil {
		serverError(w, err)
		return
	}
	if aliases == nil {
		aliases = []storage.ModelAlias{}
	}
	writeJSON(w, aliases)
}

func (s *Server) handleModelAliasCandidates(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, http.MethodGet)
		return
	}
	candidates, err := s.db.GetModelAliasCandidates()
	if err != nil {
		serverError(w, err)
		return
	}
	if candidates == nil {
		candidates = []storage.ModelAliasCandidate{}
	}
	writeJSON(w, candidates)
}

func (s *Server) handleModelAlias(w http.ResponseWriter, r *http.Request) {
	alias, err := modelAliasFromPath(r.URL.Path)
	if err != nil {
		badRequest(w, err)
		return
	}
	switch r.Method {
	case http.MethodPut:
		s.handleModelAliasPut(w, r, alias)
	case http.MethodDelete:
		s.handleModelAliasDelete(w, alias)
	default:
		methodNotAllowed(w, http.MethodPut+", "+http.MethodDelete)
	}
}

func modelAliasFromPath(path string) (string, error) {
	raw := strings.TrimPrefix(path, "/api/models/aliases/")
	if raw == "" {
		return "", fmt.Errorf("alias is required")
	}
	alias, err := url.PathUnescape(raw)
	if err != nil {
		return "", fmt.Errorf("invalid alias path")
	}
	alias = strings.TrimSpace(alias)
	if alias == "" {
		return "", fmt.Errorf("alias is required")
	}
	return alias, nil
}

func (s *Server) handleModelAliasPut(w http.ResponseWriter, r *http.Request, alias string) {
	var req modelAliasRequest
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(&req); err != nil {
		badRequest(w, fmt.Errorf("invalid model alias JSON: %w", err))
		return
	}
	canonical := strings.TrimSpace(req.CanonicalModel)
	if canonical == "" {
		badRequest(w, fmt.Errorf("canonical model is required"))
		return
	}
	if err := s.db.UpsertModelAlias(storage.ModelAlias{
		Alias:          alias,
		CanonicalModel: canonical,
		Note:           req.Note,
		Source:         "manual",
	}); err != nil {
		badRequest(w, err)
		return
	}
	if err := s.applyAliasesAndRecalcForRawModels([]string{alias}); err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, map[string]string{"status": "ok"})
}

func (s *Server) handleModelAliasDelete(w http.ResponseWriter, alias string) {
	if err := s.db.DeleteModelAlias(alias); err != nil {
		serverError(w, err)
		return
	}
	if err := s.applyAliasesAndRecalcForRawModels([]string{alias}); err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, map[string]string{"status": "ok"})
}

func (s *Server) applyAliasesAndRecalcForRawModels(rawModels []string) error {
	if err := s.db.ApplyModelAliasesForRawModels(rawModels); err != nil {
		return err
	}
	prices, err := s.db.GetAllPricing()
	if err != nil {
		return err
	}
	return s.db.RecalcAllCostsForRawModels(prices, pricing.CalcCost, rawModels)
}
