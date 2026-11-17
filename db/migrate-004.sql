-- 工单表：用户反馈与后台处置
-- 提交人 uid 与 username 由服务端写入，前端不提供输入框
CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid INTEGER NOT NULL DEFAULT 0,
  username TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL,
  detail TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  reply TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_tickets_uid ON tickets(uid);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status, id DESC);
