-- 009 · Moonetix 广告墙任务流水
-- 一条 postback 一条记录，transaction_id 唯一，回调重复打过来靠它去重。
-- 冲正（status 2）不新建行，回写原行的 status 与 reversed_at。
CREATE TABLE IF NOT EXISTS mo_task (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  uid            INTEGER NOT NULL,
  transaction_id TEXT    NOT NULL UNIQUE,
  event_id       TEXT    NOT NULL DEFAULT '',
  offer_id       TEXT    NOT NULL DEFAULT '',
  offer_name     TEXT    NOT NULL DEFAULT '',
  reward_units   INTEGER NOT NULL DEFAULT 0,
  payout_usd     TEXT    NOT NULL DEFAULT '',
  currency       TEXT    NOT NULL DEFAULT '',
  status         INTEGER NOT NULL DEFAULT 1,
  ip             TEXT    NOT NULL DEFAULT '',
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  reversed_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_mo_task_uid ON mo_task (uid, id DESC);
