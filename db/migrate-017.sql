-- 017 · 实验台改成「上传问卷 → 答题 → 出结果」
-- 结局不再由按钮指定，而是答题时选到的那个选项决定（选项上带 outcome）。
-- 打回不再立刻冲正：先入账，等 due_at 到了才结算。

ALTER TABLE lab_run ADD COLUMN due_at TEXT;    -- 打回生效时间（只有 reject 用）
ALTER TABLE lab_run ADD COLUMN answers TEXT;   -- 答题记录，JSON 文本，便于回看

CREATE TABLE IF NOT EXISTS lab_paper (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL DEFAULT '',
  body       TEXT NOT NULL DEFAULT '{}',   -- {title, questions:[{q, options:[string | {label,outcome}]}]}
  created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours'))
);
