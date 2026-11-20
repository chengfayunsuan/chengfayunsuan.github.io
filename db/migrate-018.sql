-- 018 · 自建流量日志
-- Pages 项目的 Metrics 只给请求数，看不出「谁来了、看了哪些页」。
-- 这里在中间件里落一行，够看 PV / UV / 热门页面 / 来源 / 国家。
-- 只存指纹（IP+UA 的哈希），不存原始 IP。保留 90 天，查询时顺手清理过期行。
CREATE TABLE IF NOT EXISTS visits (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  at      TEXT    NOT NULL DEFAULT (datetime('now','+8 hours')),
  path    TEXT    NOT NULL DEFAULT '',
  vid     TEXT    NOT NULL DEFAULT '',   -- 访客指纹：sha256(ip|ua)，用来算 UV
  uid     INTEGER NOT NULL DEFAULT 0,
  country TEXT    NOT NULL DEFAULT '',
  ref     TEXT    NOT NULL DEFAULT '',   -- 来源域名，空 = 直接访问
  ua      TEXT    NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_visits_at ON visits (at);
CREATE INDEX IF NOT EXISTS idx_visits_path ON visits (path);
CREATE INDEX IF NOT EXISTS idx_visits_vid ON visits (vid);
