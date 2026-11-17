-- 问卷大厅：问卷主表
-- 价格沿用全站的「万分之一 fc」整数存储，展示时统一走 formatFc

CREATE TABLE IF NOT EXISTS surveys (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT    NOT NULL,
  provider     TEXT    NOT NULL DEFAULT '',   -- 问卷商，例如 某某调研
  price_units  INTEGER NOT NULL DEFAULT 0,    -- 单价，单位 1/10000 fc
  grade        TEXT    NOT NULL DEFAULT '',   -- 评级，站长自定：S / A / B / C
  stars        INTEGER NOT NULL DEFAULT 0,    -- 星级 0-5，和评级是两回事
  requirement  TEXT    NOT NULL DEFAULT '',   -- 参与要求，可为空
  topic        TEXT    NOT NULL DEFAULT '',   -- 主题，可为空
  duration_min INTEGER NOT NULL DEFAULT 0,    -- 预计耗时（分钟）
  entry_url    TEXT    NOT NULL DEFAULT '',   -- 答卷入口，可为空
  featured     INTEGER NOT NULL DEFAULT 0,    -- 是否进站长推荐：0 否，1 是
  featured_at  TEXT,                          -- 提拔进推荐的时间，用于推荐位排序
  status       TEXT    NOT NULL DEFAULT 'open', -- open 开放 / paused 暂停 / closed 关闭
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_surveys_status   ON surveys(status);
CREATE INDEX IF NOT EXISTS idx_surveys_featured ON surveys(featured, featured_at);
