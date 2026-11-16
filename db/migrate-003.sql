-- ============================================================
-- 003 关注关系
-- ------------------------------------------------------------
-- 一张表两列描述有向边：follower_id 关注 followee_id。
-- 主键天然禁止重复关注，取消关注即删行。
-- 不存冗余计数，粉丝数与关注数一律现算，避免两边对不上。
-- ============================================================

CREATE TABLE IF NOT EXISTS follows (
  follower_id INTEGER NOT NULL,
  followee_id INTEGER NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (follower_id, followee_id),
  FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (followee_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 按被关注者取粉丝列表
CREATE INDEX IF NOT EXISTS idx_follows_followee ON follows(followee_id, created_at DESC);

-- 按关注者取关注列表
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id, created_at DESC);
