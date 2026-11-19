-- 012 · 等级规则（LV 可为负）与问卷参与审核
--
-- users.lv_bonus_on：最后一次「每日登录 +1 LV」的日期（北京时间 YYYY-MM-DD），
--   同一天重复登录不会重复加，跨天自动再给一次。
-- survey_joins.status：pending / approved / rejected，后台审核后写 approved 或 rejected，
--   审核通过 +1 LV、驳回 -8 LV。
ALTER TABLE users ADD COLUMN lv_bonus_on TEXT NOT NULL DEFAULT '';
ALTER TABLE survey_joins ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE survey_joins ADD COLUMN reviewed_at TEXT;

CREATE INDEX IF NOT EXISTS idx_joins_status ON survey_joins (status, created_at DESC);
