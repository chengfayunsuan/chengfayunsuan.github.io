-- 问卷参与改成按 IP 判重：同一个 IP 对同一份问卷只能参与一次，换了 IP 才能再来。
-- 原来的主键是 (uid, survey_id)，换个号就能再领一次钱，反而更容易刷。
--
-- SQLite 改不了主键，只能重建表。
CREATE TABLE survey_joins_new (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  uid        INTEGER NOT NULL,
  survey_id  INTEGER NOT NULL,
  ip         TEXT    NOT NULL DEFAULT '',
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  status     TEXT    NOT NULL DEFAULT 'pending',
  reviewed_at TEXT,
  stage      TEXT    NOT NULL DEFAULT '',
  answers    TEXT    NOT NULL DEFAULT '',
  elapsed    INTEGER NOT NULL DEFAULT 0,
  due_at     TEXT    NOT NULL DEFAULT ''
);

-- 老记录没有 IP，给个不会被重复的占位值，免得唯一索引建不起来
INSERT INTO survey_joins_new (uid, survey_id, ip, created_at, status, reviewed_at, stage, answers, elapsed, due_at)
SELECT uid, survey_id, 'legacy:' || uid, created_at, status, reviewed_at, stage, answers, elapsed, due_at
  FROM survey_joins;

DROP TABLE survey_joins;
ALTER TABLE survey_joins_new RENAME TO survey_joins;

CREATE UNIQUE INDEX idx_joins_survey_ip ON survey_joins (survey_id, ip);
CREATE INDEX idx_joins_survey ON survey_joins (survey_id);
CREATE INDEX idx_joins_uid ON survey_joins (uid);
CREATE INDEX idx_joins_status ON survey_joins (status);
