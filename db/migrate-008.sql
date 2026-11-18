-- ============================================================
-- 乘法 · 行政公告
--
-- 公告是站长单方面发布、所有人可见的内容，
-- 和「站内消息」不同：消息是一对一/一对多的通知，带已读状态；
-- 公告是一份公开文本，谁都能看，不需要逐人写一条。
-- ============================================================

CREATE TABLE IF NOT EXISTS announcements (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT    NOT NULL DEFAULT '',
  body         TEXT    NOT NULL,
  level        TEXT    NOT NULL DEFAULT 'info',      -- info 普通 / warn 提醒 / critical 重要
  status       TEXT    NOT NULL DEFAULT 'draft',     -- draft 草稿 / published 已发布
  pinned       INTEGER NOT NULL DEFAULT 0,           -- 1 置顶
  published_at TEXT,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notice_status ON announcements(status, pinned DESC, published_at DESC);

-- ------------------------------------------------------------
-- 站内消息加批次号
--
-- 全员提醒只写一个批次号，后台按批次聚合成一条「提醒所有人」，
-- 不再在列表里堆出几十条一模一样的记录。
-- ------------------------------------------------------------

ALTER TABLE messages ADD COLUMN batch TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_msg_batch ON messages(batch);

-- ------------------------------------------------------------
-- 初始公告：把首页原来那句静态说明搬进来，站长可随时改
-- ------------------------------------------------------------

INSERT INTO announcements (title, body, level, status, pinned, published_at)
SELECT '内测阶段说明',
       '平台处于内测阶段，问卷大厅的问卷数量还在补充中。账户、余额、兑换与提现均已按真实规则运行。',
       'info', 'published', 1, datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM announcements);
