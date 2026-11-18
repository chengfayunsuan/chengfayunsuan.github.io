-- 010 · 用户状态变更记录
-- 每次封禁 / 冻结 / 解封都留一条，用户可以在设置页看到自己的「封禁记录」。
-- 只记状态真的发生变化的那一次，重复点同一个状态不留痕。
CREATE TABLE IF NOT EXISTS user_bans (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  uid         INTEGER NOT NULL,                    -- 被操作的用户
  from_status TEXT    NOT NULL DEFAULT '',         -- 改之前的状态
  to_status   TEXT    NOT NULL,                    -- 改之后的状态
  reason      TEXT    NOT NULL DEFAULT '',         -- 操作者在后台填的原因，可为空
  by_uid      INTEGER NOT NULL DEFAULT 0,          -- 操作者 uid
  by_role     TEXT    NOT NULL DEFAULT '',         -- 操作者角色，决定显示「站长」还是「管理员」
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (uid) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_bans_uid ON user_bans (uid, id DESC);
