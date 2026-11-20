-- 邮箱验证：6 位码，10 分钟有效，60 秒才能重发，一天最多 10 次
CREATE TABLE IF NOT EXISTS email_codes (
  uid      INTEGER PRIMARY KEY,
  email    TEXT    NOT NULL DEFAULT '',
  code     TEXT    NOT NULL DEFAULT '',
  tries    INTEGER NOT NULL DEFAULT 0,
  hits     INTEGER NOT NULL DEFAULT 0,
  sent_at  TEXT    NOT NULL DEFAULT (datetime('now','+8 hours'))
);

CREATE INDEX IF NOT EXISTS idx_email_codes_sent ON email_codes (sent_at);
