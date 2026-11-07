PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, brand TEXT, category TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY, source_id TEXT NOT NULL REFERENCES sources(id),
  external_id TEXT NOT NULL, product_id TEXT REFERENCES products(id),
  title TEXT NOT NULL, url TEXT NOT NULL, image_url TEXT, mall_name TEXT,
  brand TEXT, maker TEXT, category_json TEXT NOT NULL DEFAULT '[]',
  first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL,
  UNIQUE(source_id,external_id)
);
CREATE TABLE IF NOT EXISTS listing_observations (
  id INTEGER PRIMARY KEY, listing_id INTEGER NOT NULL REFERENCES listings(id),
  observed_at TEXT NOT NULL, price INTEGER, review_count INTEGER, rating REAL,
  payload_sha256 TEXT NOT NULL, UNIQUE(listing_id,observed_at,payload_sha256)
);
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY, listing_id INTEGER NOT NULL REFERENCES listings(id),
  external_id TEXT NOT NULL, author TEXT, rating REAL, published_at TEXT,
  source_url TEXT NOT NULL, first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL,
  current_version_id INTEGER REFERENCES review_versions(id),
  UNIQUE(listing_id,external_id)
);
CREATE TABLE IF NOT EXISTS review_versions (
  id INTEGER PRIMARY KEY, review_id INTEGER NOT NULL REFERENCES reviews(id),
  body TEXT NOT NULL, body_sha256 TEXT NOT NULL, captured_at TEXT NOT NULL,
  UNIQUE(review_id,body_sha256)
);
CREATE TABLE IF NOT EXISTS public_product_profiles (
  product_id TEXT PRIMARY KEY REFERENCES products(id),
  listing_id INTEGER NOT NULL REFERENCES listings(id), position INTEGER NOT NULL,
  profile_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS public_summaries (
  id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id),
  review_version_id INTEGER NOT NULL REFERENCES review_versions(id), position INTEGER NOT NULL,
  payload_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS review_topics (
  product_id TEXT NOT NULL REFERENCES products(id), tone TEXT NOT NULL CHECK(tone IN ('positive','negative')),
  topic_id TEXT NOT NULL, label TEXT NOT NULL, description TEXT NOT NULL, position INTEGER NOT NULL,
  PRIMARY KEY(product_id,tone,topic_id)
);
CREATE TABLE IF NOT EXISTS review_mentions (
  review_version_id INTEGER NOT NULL REFERENCES review_versions(id),
  product_id TEXT NOT NULL, tone TEXT NOT NULL, topic_id TEXT NOT NULL,
  PRIMARY KEY(review_version_id,product_id,tone,topic_id),
  FOREIGN KEY(product_id,tone,topic_id) REFERENCES review_topics(product_id,tone,topic_id)
);
CREATE TABLE IF NOT EXISTS public_excerpts (
  id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id),
  review_version_id INTEGER NOT NULL REFERENCES review_versions(id), position INTEGER NOT NULL,
  payload_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY, source_id TEXT NOT NULL REFERENCES sources(id),
  external_id TEXT NOT NULL, url TEXT NOT NULL, title TEXT NOT NULL,
  author TEXT, published_at TEXT, snippet TEXT,
  content_status TEXT NOT NULL DEFAULT 'metadata_only',
  current_version_id INTEGER REFERENCES document_versions(id),
  first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, UNIQUE(source_id,external_id)
);
CREATE TABLE IF NOT EXISTS document_versions (
  id INTEGER PRIMARY KEY, document_id INTEGER NOT NULL REFERENCES documents(id),
  body TEXT NOT NULL, body_sha256 TEXT NOT NULL, captured_at TEXT NOT NULL,
  disclosure_status TEXT NOT NULL DEFAULT 'unknown', disclosure_evidence_json TEXT NOT NULL DEFAULT '[]',
  UNIQUE(document_id,body_sha256)
);
CREATE TABLE IF NOT EXISTS collection_jobs (
  id INTEGER PRIMARY KEY, source_id TEXT NOT NULL REFERENCES sources(id), query TEXT NOT NULL,
  sort TEXT NOT NULL DEFAULT 'sim', subject_product_id TEXT REFERENCES products(id),
  next_start INTEGER NOT NULL DEFAULT 1, page_size INTEGER NOT NULL DEFAULT 100 CHECK(page_size BETWEEN 1 AND 100),
  max_results INTEGER NOT NULL DEFAULT 1000 CHECK(max_results BETWEEN 1 AND 1000),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','complete','blocked','failed')),
  last_error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(source_id,query,sort)
);
CREATE TABLE IF NOT EXISTS collection_runs (
  id INTEGER PRIMARY KEY, kind TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT,
  status TEXT NOT NULL, requests INTEGER NOT NULL DEFAULT 0,
  records INTEGER NOT NULL DEFAULT 0, error TEXT
);
CREATE TABLE IF NOT EXISTS collection_pages (
  job_id INTEGER NOT NULL REFERENCES collection_jobs(id), start INTEGER NOT NULL,
  run_id INTEGER NOT NULL REFERENCES collection_runs(id), fetched_at TEXT NOT NULL,
  item_count INTEGER NOT NULL, total_reported INTEGER, response_sha256 TEXT NOT NULL,
  raw_path TEXT NOT NULL, PRIMARY KEY(job_id,start)
);
CREATE TABLE IF NOT EXISTS search_hits (
  job_id INTEGER NOT NULL REFERENCES collection_jobs(id),
  entity_kind TEXT NOT NULL CHECK(entity_kind IN ('listing','document')),
  entity_id INTEGER NOT NULL, first_rank INTEGER NOT NULL,
  match_status TEXT NOT NULL DEFAULT 'unreviewed' CHECK(match_status IN ('unreviewed','accepted','rejected')),
  PRIMARY KEY(job_id,entity_kind,entity_id)
);
CREATE TABLE IF NOT EXISTS collection_events (
  id INTEGER PRIMARY KEY, source_id TEXT, kind TEXT NOT NULL,
  recorded_at TEXT NOT NULL, detail_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS review_listing_idx ON reviews(listing_id);
CREATE INDEX IF NOT EXISTS jobs_pending_idx ON collection_jobs(status,source_id,id);
CREATE INDEX IF NOT EXISTS documents_status_idx ON documents(content_status,source_id);
CREATE INDEX IF NOT EXISTS hits_entity_idx ON search_hits(entity_kind,entity_id);
CREATE VIEW IF NOT EXISTS mention_counts AS
SELECT m.product_id,m.tone,m.topic_id,t.label,t.description,COUNT(DISTINCT v.review_id) AS review_count
FROM review_mentions m JOIN review_topics t USING(product_id,tone,topic_id)
JOIN review_versions v ON v.id=m.review_version_id
JOIN reviews r ON r.id=v.review_id AND r.current_version_id=v.id
GROUP BY m.product_id,m.tone,m.topic_id;
PRAGMA user_version=1;
