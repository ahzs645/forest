CREATE TABLE IF NOT EXISTS practitioners (
    client_id           INTEGER PRIMARY KEY,
    client_roster_id    INTEGER,
    name                TEXT,
    designation         TEXT,
    city                TEXT,
    status              TEXT,
    profile_url         TEXT,
    directory_page      INTEGER,
    directory_scraped_at TEXT,
    profile_scraped_at  TEXT,
    has_discipline      INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS discipline_entries (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id       INTEGER NOT NULL,
    section         TEXT NOT NULL,
    text_content    TEXT,
    link_text       TEXT,
    link_url        TEXT,
    scraped_at      TEXT,
    FOREIGN KEY (client_id) REFERENCES practitioners(client_id)
);

CREATE INDEX IF NOT EXISTS idx_discipline_client  ON discipline_entries(client_id);
CREATE INDEX IF NOT EXISTS idx_practitioners_disc ON practitioners(has_discipline);
