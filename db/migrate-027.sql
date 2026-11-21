-- 统一验证码：验证邮箱 / 忘记密码 / 更改密码 三处共用一套
--
-- 旧表 email_codes 只按 uid 存一条、只服务「验证邮箱」。改成按 (uid, purpose)
-- 各存一条，三个场景互不覆盖；一天 3 封的配额单独记流水，不靠覆盖式计数。
--
-- purpose:
--   verify   —— 设置页验证注册邮箱
--   reset    —— 登录页「忘记密码」重置
--   password —— 设置页更改登录密码前确认身份

CREATE TABLE IF NOT EXISTS mail_codes (
  uid      INTEGER NOT NULL,
  purpose  TEXT    NOT NULL,               -- verify / reset / password
  email    TEXT    NOT NULL DEFAULT '',    -- 发往哪个邮箱，取码时比对换绑
  code     TEXT    NOT NULL DEFAULT '',
  tries    INTEGER NOT NULL DEFAULT 0,
  sent_at  TEXT    NOT NULL DEFAULT (datetime('now','+8 hours')),
  PRIMARY KEY (uid, purpose)
);

CREATE INDEX IF NOT EXISTS idx_mail_codes_sent ON mail_codes (sent_at);

-- 发信流水：配额与「60 秒才能重发」都从这里算，发一封记一行
CREATE TABLE IF NOT EXISTS mail_log (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  uid     INTEGER NOT NULL,
  email   TEXT    NOT NULL DEFAULT '',
  purpose TEXT    NOT NULL DEFAULT '',
  ip      TEXT    NOT NULL DEFAULT '',
  sent_at TEXT    NOT NULL DEFAULT (datetime('now','+8 hours'))
);

CREATE INDEX IF NOT EXISTS idx_mail_log_uid_time ON mail_log (uid, sent_at);
