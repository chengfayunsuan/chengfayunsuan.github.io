-- 014 · 实验台：模拟问卷商的六种结局
-- 只给站长/管理员用。每次「开始 → 提交」写一条记录，
-- 落的是真账（users / fc_ledger / survey_joins），方便观察每个分支的后果。
CREATE TABLE IF NOT EXISTS lab_run (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  uid          INTEGER NOT NULL,
  survey_id    INTEGER NOT NULL DEFAULT 0,
  scenario     TEXT    NOT NULL DEFAULT '',   -- success / fail / speed / quota / kick / reject
  stage        TEXT    NOT NULL DEFAULT 'open', -- open 已开始 / done 已出结果
  result       TEXT    NOT NULL DEFAULT '',
  reward_units INTEGER NOT NULL DEFAULT 0,
  elapsed      INTEGER NOT NULL DEFAULT 0,    -- 模拟答题秒数
  note         TEXT    NOT NULL DEFAULT '',
  created_at   TEXT    NOT NULL DEFAULT (datetime('now','+8 hours')),
  done_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_lab_run_uid ON lab_run (uid, id DESC);
