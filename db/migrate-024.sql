-- 风控：设备指纹 + 风险事件
-- 指纹只用来「同一台设备在同一份问卷上只能出现一次」，不存任何可反查个人的东西。
ALTER TABLE survey_joins ADD COLUMN fp TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_joins_fp ON survey_joins (survey_id, fp);
CREATE INDEX IF NOT EXISTS idx_joins_judged ON survey_joins (reviewed_at);

-- 每次命中规则都留一条，事后能查是谁、因为什么被拦
CREATE TABLE IF NOT EXISTS risk_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  at         TEXT    NOT NULL DEFAULT (datetime('now','+8 hours')),
  uid        INTEGER NOT NULL DEFAULT 0,
  ip         TEXT    NOT NULL DEFAULT '',
  fp         TEXT    NOT NULL DEFAULT '',
  survey_id  INTEGER NOT NULL DEFAULT 0,
  kind       TEXT    NOT NULL DEFAULT '',
  score      INTEGER NOT NULL DEFAULT 0,
  detail     TEXT    NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_risk_at ON risk_events (at);
CREATE INDEX IF NOT EXISTS idx_risk_uid ON risk_events (uid);
CREATE INDEX IF NOT EXISTS idx_risk_kind ON risk_events (kind);
