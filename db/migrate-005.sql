-- 汇率缓存：单行记录，后端每小时更新一次
CREATE TABLE IF NOT EXISTS fx_rate (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  usd_cny REAL NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
