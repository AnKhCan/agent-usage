package collector

import (
	"database/sql"
	"path/filepath"
	"testing"
	"time"
)

func TestMiMoCodeCollector_BasicScan(t *testing.T) {
	db := tempDB(t)

	srcPath := filepath.Join(t.TempDir(), "mimocode.db")
	srcDB, err := sql.Open("sqlite", srcPath)
	if err != nil {
		t.Fatalf("open source db: %v", err)
	}

	_, err = srcDB.Exec(`
		CREATE TABLE session (
			id text PRIMARY KEY,
			directory text NOT NULL
		);
		CREATE TABLE message (
			id text PRIMARY KEY,
			session_id text NOT NULL,
			time_created integer NOT NULL,
			data text NOT NULL
		);
		INSERT INTO session(id, directory) VALUES('mimo-sess-1', '/home/user/project');
		INSERT INTO message(id, session_id, time_created, data) VALUES
			('m1', 'mimo-sess-1', 1778816906000, '{"role":"user","time":{"created":1778816906000}}'),
			('m2', 'mimo-sess-1', 1778816906994, '{"role":"assistant","modelID":"mimo-v2.5-pro","providerID":"mimo","tokens":{"input":100,"output":25,"reasoning":5,"cache":{"read":10,"write":20}},"time":{"created":1778816906994,"completed":1778816907994}}');
	`)
	if err != nil {
		t.Fatalf("seed source db: %v", err)
	}
	if err := srcDB.Close(); err != nil {
		t.Fatalf("close source db: %v", err)
	}

	cx := NewMiMoCodeCollector(db, []string{srcPath})
	if err := cx.Scan(); err != nil {
		t.Fatalf("Scan: %v", err)
	}

	from := time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2100, 1, 1, 0, 0, 0, 0, time.UTC)

	sessions, err := db.GetSessions(from, to, "mimocode", "")
	if err != nil {
		t.Fatalf("GetSessions: %v", err)
	}
	if len(sessions) != 1 {
		t.Fatalf("expected 1 session, got %d", len(sessions))
	}
	if sessions[0].Source != "mimocode" {
		t.Errorf("expected source mimocode, got %s", sessions[0].Source)
	}
	if sessions[0].Prompts != 1 {
		t.Errorf("expected 1 prompt, got %d", sessions[0].Prompts)
	}

	details, err := db.GetSessionDetail("mimo-sess-1")
	if err != nil {
		t.Fatalf("GetSessionDetail: %v", err)
	}
	if len(details) != 1 {
		t.Fatalf("expected 1 detail row, got %d", len(details))
	}
	if details[0].Model != "mimo-v2.5-pro" {
		t.Errorf("expected model mimo-v2.5-pro, got %s", details[0].Model)
	}
	if details[0].InputTokens != 100 {
		t.Errorf("expected input_tokens 100, got %d", details[0].InputTokens)
	}
	if details[0].OutputTokens != 25 {
		t.Errorf("expected output_tokens 25, got %d", details[0].OutputTokens)
	}
	if details[0].CacheRead != 10 {
		t.Errorf("expected cache_read 10, got %d", details[0].CacheRead)
	}
	if details[0].CacheCreate != 20 {
		t.Errorf("expected cache_write 20, got %d", details[0].CacheCreate)
	}
}
