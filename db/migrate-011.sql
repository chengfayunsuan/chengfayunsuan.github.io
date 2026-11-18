-- 011 · 存量时间统一为北京时间（UTC+8）
-- 执行后所有 *_at 列（含 login_fails.ts）都是北京时间，
-- 与代码里 datetime('now','+8 hours') 的写入保持一致。
-- 不含 sessions.expires_at：那是 JS toISOString() 写的 ISO 串，用 Date 比较，与时区无关。
-- app_meta 的 tz8 标记保证重复执行不会再加 8 小时。

CREATE TABLE IF NOT EXISTS app_meta (k TEXT PRIMARY KEY, v TEXT NOT NULL DEFAULT '');
INSERT OR IGNORE INTO app_meta (k, v) VALUES ('tz8', '');

UPDATE users SET created_at = datetime(created_at, '+8 hours') WHERE created_at IS NOT NULL AND created_at <> '' AND (SELECT v FROM app_meta WHERE k = 'tz8') = '';
UPDATE users SET last_login_at = datetime(last_login_at, '+8 hours') WHERE last_login_at IS NOT NULL AND last_login_at <> '' AND (SELECT v FROM app_meta WHERE k = 'tz8') = '';
UPDATE users SET updated_at = datetime(updated_at, '+8 hours') WHERE updated_at IS NOT NULL AND updated_at <> '' AND (SELECT v FROM app_meta WHERE k = 'tz8') = '';
UPDATE users SET deleted_at = datetime(deleted_at, '+8 hours') WHERE deleted_at IS NOT NULL AND deleted_at <> '' AND (SELECT v FROM app_meta WHERE k = 'tz8') = '';
UPDATE sessions SET created_at = datetime(created_at, '+8 hours') WHERE created_at IS NOT NULL AND created_at <> '' AND (SELECT v FROM app_meta WHERE k = 'tz8') = '';
UPDATE fc_ledger SET created_at = datetime(created_at, '+8 hours') WHERE created_at IS NOT NULL AND created_at <> '' AND (SELECT v FROM app_meta WHERE k = 'tz8') = '';
UPDATE withdrawals SET created_at = datetime(created_at, '+8 hours') WHERE created_at IS NOT NULL AND created_at <> '' AND (SELECT v FROM app_meta WHERE k = 'tz8') = '';
UPDATE withdrawals SET reviewed_at = datetime(reviewed_at, '+8 hours') WHERE reviewed_at IS NOT NULL AND reviewed_at <> '' AND (SELECT v FROM app_meta WHERE k = 'tz8') = '';
UPDATE login_fails SET ts = datetime(ts, '+8 hours') WHERE ts IS NOT NULL AND ts <> '' AND (SELECT v FROM app_meta WHERE k = 'tz8') = '';
UPDATE follows SET created_at = datetime(created_at, '+8 hours') WHERE created_at IS NOT NULL AND created_at <> '' AND (SELECT v FROM app_meta WHERE k = 'tz8') = '';
UPDATE tickets SET created_at = datetime(created_at, '+8 hours') WHERE created_at IS NOT NULL AND created_at <> '' AND (SELECT v FROM app_meta WHERE k = 'tz8') = '';
UPDATE tickets SET reviewed_at = datetime(reviewed_at, '+8 hours') WHERE reviewed_at IS NOT NULL AND reviewed_at <> '' AND (SELECT v FROM app_meta WHERE k = 'tz8') = '';
UPDATE fx_rate SET updated_at = datetime(updated_at, '+8 hours') WHERE updated_at IS NOT NULL AND updated_at <> '' AND (SELECT v FROM app_meta WHERE k = 'tz8') = '';
UPDATE surveys SET featured_at = datetime(featured_at, '+8 hours') WHERE featured_at IS NOT NULL AND featured_at <> '' AND (SELECT v FROM app_meta WHERE k = 'tz8') = '';
UPDATE surveys SET created_at = datetime(created_at, '+8 hours') WHERE created_at IS NOT NULL AND created_at <> '' AND (SELECT v FROM app_meta WHERE k = 'tz8') = '';
UPDATE surveys SET updated_at = datetime(updated_at, '+8 hours') WHERE updated_at IS NOT NULL AND updated_at <> '' AND (SELECT v FROM app_meta WHERE k = 'tz8') = '';
UPDATE store_items SET created_at = datetime(created_at, '+8 hours') WHERE created_at IS NOT NULL AND created_at <> '' AND (SELECT v FROM app_meta WHERE k = 'tz8') = '';
UPDATE store_items SET updated_at = datetime(updated_at, '+8 hours') WHERE updated_at IS NOT NULL AND updated_at <> '' AND (SELECT v FROM app_meta WHERE k = 'tz8') = '';
UPDATE orders SET created_at = datetime(created_at, '+8 hours') WHERE created_at IS NOT NULL AND created_at <> '' AND (SELECT v FROM app_meta WHERE k = 'tz8') = '';
UPDATE cdk_codes SET used_at = datetime(used_at, '+8 hours') WHERE used_at IS NOT NULL AND used_at <> '' AND (SELECT v FROM app_meta WHERE k = 'tz8') = '';
UPDATE cdk_codes SET created_at = datetime(created_at, '+8 hours') WHERE created_at IS NOT NULL AND created_at <> '' AND (SELECT v FROM app_meta WHERE k = 'tz8') = '';
UPDATE messages SET read_at = datetime(read_at, '+8 hours') WHERE read_at IS NOT NULL AND read_at <> '' AND (SELECT v FROM app_meta WHERE k = 'tz8') = '';
UPDATE messages SET created_at = datetime(created_at, '+8 hours') WHERE created_at IS NOT NULL AND created_at <> '' AND (SELECT v FROM app_meta WHERE k = 'tz8') = '';
UPDATE survey_joins SET created_at = datetime(created_at, '+8 hours') WHERE created_at IS NOT NULL AND created_at <> '' AND (SELECT v FROM app_meta WHERE k = 'tz8') = '';
UPDATE announcements SET published_at = datetime(published_at, '+8 hours') WHERE published_at IS NOT NULL AND published_at <> '' AND (SELECT v FROM app_meta WHERE k = 'tz8') = '';
UPDATE announcements SET created_at = datetime(created_at, '+8 hours') WHERE created_at IS NOT NULL AND created_at <> '' AND (SELECT v FROM app_meta WHERE k = 'tz8') = '';
UPDATE announcements SET updated_at = datetime(updated_at, '+8 hours') WHERE updated_at IS NOT NULL AND updated_at <> '' AND (SELECT v FROM app_meta WHERE k = 'tz8') = '';
UPDATE mo_task SET created_at = datetime(created_at, '+8 hours') WHERE created_at IS NOT NULL AND created_at <> '' AND (SELECT v FROM app_meta WHERE k = 'tz8') = '';
UPDATE mo_task SET reversed_at = datetime(reversed_at, '+8 hours') WHERE reversed_at IS NOT NULL AND reversed_at <> '' AND (SELECT v FROM app_meta WHERE k = 'tz8') = '';
UPDATE user_bans SET created_at = datetime(created_at, '+8 hours') WHERE created_at IS NOT NULL AND created_at <> '' AND (SELECT v FROM app_meta WHERE k = 'tz8') = '';

UPDATE app_meta SET v = 'done' WHERE k = 'tz8';
