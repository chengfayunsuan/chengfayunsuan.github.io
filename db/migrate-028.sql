-- 028 · mo_task 加 provider：广告墙与问卷墙共用一张任务流水表
-- 回调进来的每一笔都记在 mo_task，用 provider 区分是哪家供应商，
-- 前端「广告墙记录」只挑 moonetix 的，互不干扰。
ALTER TABLE mo_task ADD COLUMN provider TEXT NOT NULL DEFAULT 'moonetix';

CREATE INDEX IF NOT EXISTS idx_mo_task_provider ON mo_task (provider, id DESC);
