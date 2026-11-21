-- 好感度每日结算账：每个北京时间自然日一行。
-- 每天北京时间 0 点结算前一天，赚分最多的人 +1 点好感度。
-- day 主键保证并发访问只结算一次；uid=0 / earned=0 表示那天没人赚分（空过）。
CREATE TABLE IF NOT EXISTS affinity_daily (
  day        TEXT    PRIMARY KEY,              -- 北京时间 YYYY-MM-DD（被结算的那个自然日）
  uid        INTEGER NOT NULL DEFAULT 0,       -- 当日赚分王；0 = 无人入账
  earned     INTEGER NOT NULL DEFAULT 0,       -- 当日入账总量，单位 1/10000 fc
  applied_at TEXT    NOT NULL DEFAULT (datetime('now','+8 hours'))
);

CREATE INDEX IF NOT EXISTS idx_affinity_daily_uid ON affinity_daily(uid, day);
