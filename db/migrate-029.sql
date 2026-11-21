-- 029 · 回调原始流水（调试用，长期保留）
-- 服务商打过来的每一个回调都留一条：参数名、非敏感值、token 长度、我们回了什么。
-- 以后用户说「答完了没到账」，先查这张表就知道是没打进来、打进来了被拒、还是入账了。
CREATE TABLE IF NOT EXISTS hook_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  provider   TEXT    NOT NULL DEFAULT '',
  method     TEXT    NOT NULL DEFAULT '',
  params     TEXT    NOT NULL DEFAULT '',
  token_len  INTEGER NOT NULL DEFAULT 0,
  token_ok   INTEGER NOT NULL DEFAULT 0,
  result     TEXT    NOT NULL DEFAULT '',
  ip         TEXT    NOT NULL DEFAULT '',
  created_at TEXT    NOT NULL DEFAULT (datetime('now','+8 hours'))
);

CREATE INDEX IF NOT EXISTS idx_hook_log_time ON hook_log (id DESC);
