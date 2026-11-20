-- 016 · 代理 / VPN 检测缓存
-- 每查一个访客 IP 存一行，24 小时内复用，避免每次都打外部接口。
-- 判定信号三个来源：cf.asn（Cloudflare 自带）、机房 ASN 名单（代码里）、ipapi.is 免费接口。
CREATE TABLE IF NOT EXISTS ip_intel (
  ip         TEXT PRIMARY KEY,
  country    TEXT    NOT NULL DEFAULT '',
  asn        TEXT    NOT NULL DEFAULT '',
  org        TEXT    NOT NULL DEFAULT '',
  proxy      INTEGER NOT NULL DEFAULT 0,   -- 明确的代理 / VPN / Tor 特征
  dc         INTEGER NOT NULL DEFAULT 0,   -- 机房 / 数据中心网络
  src        TEXT    NOT NULL DEFAULT '',  -- asn / ipapiis / none
  hits       INTEGER NOT NULL DEFAULT 0,
  checked_at TEXT    NOT NULL DEFAULT (datetime('now','+8 hours'))
);

CREATE INDEX IF NOT EXISTS idx_ip_intel_at ON ip_intel (checked_at);
