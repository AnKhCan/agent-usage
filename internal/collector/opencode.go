package collector

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/briqt/agent-usage/internal/storage"
)

// OpenCodeCollector scans OpenCode-like SQLite databases and extracts usage records.
type OpenCodeCollector struct {
	db     *storage.DB
	paths  []string // paths to SQLite database files
	source string
}

// NewOpenCodeCollector creates an OpenCodeCollector that reads the given db paths.
func NewOpenCodeCollector(db *storage.DB, paths []string) *OpenCodeCollector {
	return newOpenCodeLikeCollector(db, paths, "opencode")
}

// NewMiMoCodeCollector creates a collector for MiMo Code's SQLite database.
func NewMiMoCodeCollector(db *storage.DB, paths []string) *OpenCodeCollector {
	return newOpenCodeLikeCollector(db, paths, "mimocode")
}

func newOpenCodeLikeCollector(db *storage.DB, paths []string, source string) *OpenCodeCollector {
	return &OpenCodeCollector{db: db, paths: paths, source: source}
}

type opencodeMessageData struct {
	Role       string         `json:"role"`
	ModelID    string         `json:"modelID"`
	ProviderID string         `json:"providerID"`
	Cost       float64        `json:"cost"`
	Tokens     opencodeTokens `json:"tokens"`
	Time       opencodeTime   `json:"time"`
	Path       opencodePath   `json:"path"`
	Agent      string         `json:"agent"`
}

type opencodeTokens struct {
	Input     int64         `json:"input"`
	Output    int64         `json:"output"`
	Reasoning int64         `json:"reasoning"`
	Cache     opencodeCache `json:"cache"`
}

type opencodeCache struct {
	Read  int64 `json:"read"`
	Write int64 `json:"write"`
}

type opencodeTime struct {
	Created   int64 `json:"created"`
	Completed int64 `json:"completed"`
}

type opencodePath struct {
	CWD  string `json:"cwd"`
	Root string `json:"root"`
}

// Scan reads all configured database files and extracts new usage records.
func (c *OpenCodeCollector) Scan() error {
	for _, dbPath := range c.paths {
		if err := c.processDB(dbPath); err != nil {
			log.Printf("%s: error processing %s: %v", c.source, dbPath, err)
		}
	}
	return nil
}

func (c *OpenCodeCollector) processDB(dbPath string) error {
	// Get watermark: last processed time_created (stored as offset in file_state)
	_, lastWatermark, _, err := c.db.GetFileState(dbPath)
	if err != nil {
		return err
	}

	// Open source db read-only
	srcDB, err := sql.Open("sqlite", dbPath+"?mode=ro&_pragma=journal_mode(wal)&_pragma=busy_timeout(3000)")
	if err != nil {
		return fmt.Errorf("open %s db: %w", c.source, err)
	}
	defer srcDB.Close()

	// Query assistant messages newer than watermark
	rows, err := srcDB.Query(`
		SELECT m.data, m.session_id, m.time_created, s.directory
		FROM message m
		JOIN session s ON m.session_id = s.id
		WHERE m.time_created > ?
		ORDER BY m.time_created`,
		lastWatermark,
	)
	if err != nil {
		return fmt.Errorf("query %s messages: %w", c.source, err)
	}
	defer rows.Close()

	var records []*storage.UsageRecord
	sessions := map[string]*storage.SessionRecord{}
	var maxWatermark int64

	for rows.Next() {
		var dataJSON string
		var sessionID string
		var timeCreated int64
		var directory string
		if err := rows.Scan(&dataJSON, &sessionID, &timeCreated, &directory); err != nil {
			continue
		}

		var msg opencodeMessageData
		if err := json.Unmarshal([]byte(dataJSON), &msg); err != nil {
			continue
		}
		if msg.Role != "assistant" || msg.ModelID == "" {
			continue
		}
		// Skip zero-token entries (failed API calls)
		if msg.Tokens.Input == 0 && msg.Tokens.Output == 0 {
			continue
		}

		ts := time.UnixMilli(msg.Time.Created)
		if msg.Time.Created == 0 {
			ts = time.UnixMilli(timeCreated)
		}

		rec := &storage.UsageRecord{
			Source:                   c.source,
			SessionID:                sessionID,
			Model:                    msg.ModelID,
			Timestamp:                ts,
			Project:                  directory,
			InputTokens:              msg.Tokens.Input,
			OutputTokens:             msg.Tokens.Output,
			CacheReadInputTokens:     msg.Tokens.Cache.Read,
			CacheCreationInputTokens: msg.Tokens.Cache.Write,
			ReasoningOutputTokens:    msg.Tokens.Reasoning,
		}
		records = append(records, rec)

		if timeCreated > maxWatermark {
			maxWatermark = timeCreated
		}

		// Track session metadata
		if _, ok := sessions[sessionID]; !ok {
			sessions[sessionID] = &storage.SessionRecord{
				Source:    c.source,
				SessionID: sessionID,
				CWD:       directory,
				Project:   directory,
				StartTime: ts,
			}
		}
	}

	// Collect user prompt events with timestamps
	var promptEvents []*storage.PromptEvent
	if len(sessions) > 0 {
		promptRows, err := srcDB.Query(`
			SELECT session_id, time_created FROM message
			WHERE data LIKE '%"role":"user"%'
			ORDER BY time_created`)
		if err == nil {
			defer promptRows.Close()
			for promptRows.Next() {
				var sid string
				var timeCreated int64
				if promptRows.Scan(&sid, &timeCreated) == nil {
					if s, ok := sessions[sid]; ok {
						s.Prompts++
					}
					promptEvents = append(promptEvents, &storage.PromptEvent{
						Source:    c.source,
						SessionID: sid,
						Timestamp: time.UnixMilli(timeCreated),
					})
				}
			}
		}
	}

	if len(records) > 0 {
		if err := c.db.InsertUsageBatch(records); err != nil {
			return fmt.Errorf("insert %s usage: %w", c.source, err)
		}
	}

	if len(promptEvents) > 0 {
		if err := c.db.InsertPromptBatch(promptEvents); err != nil {
			return fmt.Errorf("insert %s prompts: %w", c.source, err)
		}
	}

	for _, sess := range sessions {
		if err := c.db.UpsertSession(sess); err != nil {
			return fmt.Errorf("upsert %s session: %w", c.source, err)
		}
	}

	if maxWatermark > lastWatermark {
		return c.db.SetFileState(dbPath, maxWatermark, maxWatermark, nil)
	}
	return nil
}
