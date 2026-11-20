-- 019 · 流量明细补字段
-- 018 只存了指纹和来源，明细看不出具体是谁、从哪个机房来的。
-- 这里把边缘节点能拿到的都落下：IP、省、市、ASN、机房名、接入节点。
-- 保留期仍是 90 天，查询时顺手清理。
ALTER TABLE visits ADD COLUMN ip TEXT NOT NULL DEFAULT '';
ALTER TABLE visits ADD COLUMN region TEXT NOT NULL DEFAULT '';
ALTER TABLE visits ADD COLUMN city TEXT NOT NULL DEFAULT '';
ALTER TABLE visits ADD COLUMN asn TEXT NOT NULL DEFAULT '';
ALTER TABLE visits ADD COLUMN org TEXT NOT NULL DEFAULT '';
ALTER TABLE visits ADD COLUMN colo TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_visits_ip ON visits (ip);
