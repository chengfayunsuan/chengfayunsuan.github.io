-- 乘法 · 账户与法币表结构
-- D1 (SQLite)
--
-- 本文件为全新部署的完整结构。
-- 已有库升级请执行 db/migrate-002.sql，不要重跑本文件。

-- ============================================================
-- 用户
--
-- 金额约定：所有法币字段以「万分之一 fc」为整数单位存储，
-- 1 fc = 10000 units。整数运算可避免浮点累加误差，
-- 接口层统一换算为 4 位小数字符串输出。
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,  -- uid，从 1 起顺延，删号不回收
  username       TEXT    NOT NULL DEFAULT '',        -- 用户名，站内显示名
  email          TEXT    NOT NULL UNIQUE,            -- 注册邮箱，登录凭据，统一小写
  email_verified INTEGER NOT NULL DEFAULT 0,         -- 邮箱是否已验证：0 否，1 是
  pw_hash        TEXT    NOT NULL,
  pw_salt        TEXT    NOT NULL,
  pw_algo        TEXT    NOT NULL DEFAULT 'pbkdf2-sha256',
  pw_iter        INTEGER NOT NULL DEFAULT 4000,      -- 派生迭代次数，换算法时按行迁移
  role           TEXT    NOT NULL DEFAULT 'user',    -- owner 站长 / admin 管理员 / premium 大会员 / user 用户
  status         TEXT    NOT NULL DEFAULT 'active',  -- active 正常 / frozen 冻结 / banned 封禁
  fc_units       INTEGER NOT NULL DEFAULT 0,         -- 可用法币，单位 1/10000 fc，不得为负
  fc_frozen      INTEGER NOT NULL DEFAULT 0,         -- 冻结法币，提现审核期间不可动用
  affinity       INTEGER NOT NULL DEFAULT 0,         -- 好感度
  exp            INTEGER NOT NULL DEFAULT 0,         -- 经验值
  level          INTEGER NOT NULL DEFAULT 1,         -- 等级，由经验值结算
  bio            TEXT    NOT NULL DEFAULT '',        -- 个人简介
  avatar         TEXT    NOT NULL DEFAULT '',        -- 头像地址
  reg_ip         TEXT    NOT NULL DEFAULT '',        -- 注册 IP
  reg_net        TEXT    NOT NULL DEFAULT '',        -- 注册网络归属，形如 AS4134 CN
  last_login_at  TEXT,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  deleted_at     TEXT                                -- 注销时间，非空即视为已注销
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username COLLATE NOCASE) WHERE username <> '';
CREATE INDEX IF NOT EXISTS idx_users_role    ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status  ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_regip   ON users(reg_ip);
CREATE INDEX IF NOT EXISTS idx_users_created ON users(created_at);

-- ============================================================
-- 会话
-- ============================================================

CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT    PRIMARY KEY,
  user_id     INTEGER NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT    NOT NULL,
  ua          TEXT,
  ip          TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_exp  ON sessions(expires_at);

-- ============================================================
-- 登录失败记录，用于限制在线爆破
-- ============================================================

CREATE TABLE IF NOT EXISTS login_fails (
  email       TEXT NOT NULL,
  ts          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_fails_email ON login_fails(email, ts);

-- ============================================================
-- 法币流水
--
-- 余额不靠直接改写，每一笔变动都先写流水再落余额，
-- 出现对账差异时可据此逐笔追溯。
--
-- kind 取值：
--   signup_bonus    注册赠送
--   survey_reward   问卷奖励
--   survey_reject   问卷驳回扣回
--   withdraw_lock   提现冻结（可用 → 冻结）
--   withdraw_refund 提现驳回（冻结 → 可用）
--   withdraw_paid   提现完成（冻结扣除）
--   cdk_redeem      兑换 CDK
--   admin_adjust    人工调整
--   penalty         违规扣罚
-- ============================================================

CREATE TABLE IF NOT EXISTS fc_ledger (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  uid         INTEGER NOT NULL,
  delta       INTEGER NOT NULL,                    -- 变动量，单位 1/10000 fc，正负皆可
  balance     INTEGER NOT NULL,                    -- 变动后可用余额快照
  kind        TEXT    NOT NULL,
  ref         TEXT    NOT NULL DEFAULT '',         -- 关联单号
  memo        TEXT    NOT NULL DEFAULT '',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (uid) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ledger_uid  ON fc_ledger(uid, id DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_kind ON fc_ledger(kind, created_at);

-- ============================================================
-- 提现申请
--
-- 提交时把金额从 fc_units 划入 fc_frozen，
-- 审核通过转为 withdraw_paid，驳回转为 withdraw_refund。
-- ============================================================

CREATE TABLE IF NOT EXISTS withdrawals (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  uid          INTEGER NOT NULL,
  amount       INTEGER NOT NULL,                   -- 申请金额，单位 1/10000 fc
  channel      TEXT    NOT NULL,                   -- alipay / wechat / paypal / payoneer
  account      TEXT    NOT NULL,                   -- 收款账号
  status       TEXT    NOT NULL DEFAULT 'pending', -- pending / approved / paid / rejected
  reviewed_by  INTEGER,
  review_note  TEXT    NOT NULL DEFAULT '',
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  reviewed_at  TEXT,
  FOREIGN KEY (uid) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_withdraw_uid    ON withdrawals(uid, id DESC);
CREATE INDEX IF NOT EXISTS idx_withdraw_status ON withdrawals(status, created_at);

-- ============================================================
-- 关注关系
-- ------------------------------------------------------------
-- 有向边：follower_id 关注 followee_id。主键禁止重复关注。
-- 不存冗余计数，粉丝数与关注数一律现算。
-- ============================================================

CREATE TABLE IF NOT EXISTS follows (
  follower_id INTEGER NOT NULL,
  followee_id INTEGER NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (follower_id, followee_id),
  FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (followee_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_follows_followee ON follows(followee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id, created_at DESC);
