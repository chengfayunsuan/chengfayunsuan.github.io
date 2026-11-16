-- 002 · 用户资料与法币
--
-- 用于已存在的库，保留现有记录。全新部署请直接执行 schema.sql。
-- 执行：npx wrangler d1 execute chengfa-db --remote --file=db/migrate-002.sql

-- ---------- 积分改为法币 ----------
-- 旧积分 1 分 = 1 fc，转成以万分之一为单位的整数。
ALTER TABLE users RENAME COLUMN points TO fc_units;
UPDATE users SET fc_units = fc_units * 10000;

-- ---------- 用户资料 ----------
ALTER TABLE users ADD COLUMN username       TEXT    NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN pw_algo        TEXT    NOT NULL DEFAULT 'pbkdf2-sha256';
ALTER TABLE users ADD COLUMN pw_iter        INTEGER NOT NULL DEFAULT 4000;
ALTER TABLE users ADD COLUMN role           TEXT    NOT NULL DEFAULT 'user';
ALTER TABLE users ADD COLUMN fc_frozen      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN affinity       INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN exp            INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN level          INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN bio            TEXT    NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN avatar         TEXT    NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN reg_ip         TEXT    NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN reg_net        TEXT    NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN last_login_at  TEXT;
ALTER TABLE users ADD COLUMN updated_at     TEXT    NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN deleted_at     TEXT;

-- 旧记录补默认用户名与更新时间
UPDATE users SET username = '用户' || id WHERE username = '';
UPDATE users SET updated_at = created_at WHERE updated_at = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username COLLATE NOCASE) WHERE username <> '';
CREATE INDEX IF NOT EXISTS idx_users_role    ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status  ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_regip   ON users(reg_ip);
CREATE INDEX IF NOT EXISTS idx_users_created ON users(created_at);

-- ---------- 会话补 IP ----------
ALTER TABLE sessions ADD COLUMN ip TEXT;

-- ---------- 法币流水 ----------
CREATE TABLE IF NOT EXISTS fc_ledger (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  uid         INTEGER NOT NULL,
  delta       INTEGER NOT NULL,
  balance     INTEGER NOT NULL,
  kind        TEXT    NOT NULL,
  ref         TEXT    NOT NULL DEFAULT '',
  memo        TEXT    NOT NULL DEFAULT '',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (uid) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ledger_uid  ON fc_ledger(uid, id DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_kind ON fc_ledger(kind, created_at);

-- ---------- 提现申请 ----------
CREATE TABLE IF NOT EXISTS withdrawals (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  uid          INTEGER NOT NULL,
  amount       INTEGER NOT NULL,
  channel      TEXT    NOT NULL,
  account      TEXT    NOT NULL,
  status       TEXT    NOT NULL DEFAULT 'pending',
  reviewed_by  INTEGER,
  review_note  TEXT    NOT NULL DEFAULT '',
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  reviewed_at  TEXT,
  FOREIGN KEY (uid) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_withdraw_uid    ON withdrawals(uid, id DESC);
CREATE INDEX IF NOT EXISTS idx_withdraw_status ON withdrawals(status, created_at);
