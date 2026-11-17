-- ============================================================
-- 乘法 · 兑换中心 / 站内消息 / 问卷参与
--
-- 金额同样以「万分之一 fc」整数存储。
-- 兑换与提现都先写订单、再落余额与流水，任何一步失败整批回滚。
-- ============================================================

-- ------------------------------------------------------------
-- 商品
--
-- kind：
--   code  兑换码类，兑换时从 cdk_codes 取一个未使用的码发给用户
--   sub   订阅类，发货内容人工填写，兑换后订单置 pending 等人工发
-- stock 为 -1 表示不限量；为 0 时前台置灰不可兑换
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS store_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL,
  subtitle    TEXT    NOT NULL DEFAULT '',
  kind        TEXT    NOT NULL DEFAULT 'code',
  price_units INTEGER NOT NULL,
  stock       INTEGER NOT NULL DEFAULT -1,
  note        TEXT    NOT NULL DEFAULT '',
  deliver     TEXT    NOT NULL DEFAULT '',
  status      TEXT    NOT NULL DEFAULT 'on',
  sort        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_items_status ON store_items(status, sort, id);

-- ------------------------------------------------------------
-- 兑换订单
-- sn 对用户可见，形如 O + 时间戳 36 进制
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS orders (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  sn          TEXT    NOT NULL UNIQUE,
  uid         INTEGER NOT NULL,
  item_id     INTEGER,
  item_title  TEXT    NOT NULL DEFAULT '',
  price_units INTEGER NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'paid',
  code        TEXT    NOT NULL DEFAULT '',
  memo        TEXT    NOT NULL DEFAULT '',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (uid) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_orders_uid   ON orders(uid, id DESC);
CREATE INDEX IF NOT EXISTS idx_orders_item  ON orders(item_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_state ON orders(status, created_at);

-- ------------------------------------------------------------
-- 兑换码池
--
-- 商品码（item_id 非空）兑换时按先进先出取用；
-- 通用充值码（item_id 为空）走 value_units 直接加余额。
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cdk_codes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT    NOT NULL UNIQUE,
  item_id     INTEGER,
  value_units INTEGER NOT NULL DEFAULT 0,
  status      TEXT    NOT NULL DEFAULT 'free',
  used_by     INTEGER,
  used_at     TEXT,
  batch       TEXT    NOT NULL DEFAULT '',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cdk_free  ON cdk_codes(status, item_id, id);
CREATE INDEX IF NOT EXISTS idx_cdk_batch ON cdk_codes(batch);

-- ------------------------------------------------------------
-- 站内消息
--
-- 全员公告按用户逐条写入，每人各自的 read_at 才能独立标记已读。
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  uid         INTEGER NOT NULL,
  kind        TEXT    NOT NULL DEFAULT 'system',
  title       TEXT    NOT NULL,
  body        TEXT    NOT NULL DEFAULT '',
  read_at     TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (uid) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_msg_uid  ON messages(uid, id DESC);
CREATE INDEX IF NOT EXISTS idx_msg_unread ON messages(uid, read_at);

-- ------------------------------------------------------------
-- 问卷参与
--
-- 只记录"点进去了"，不判断是否真的答完，答完与否由问卷商回传。
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS survey_joins (
  uid         INTEGER NOT NULL,
  survey_id   INTEGER NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (uid, survey_id),
  FOREIGN KEY (uid) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_joins_survey ON survey_joins(survey_id, created_at DESC);

-- ------------------------------------------------------------
-- 初始商品：先给一组能跑通的档位，后台可随时改价或下架
-- ------------------------------------------------------------

INSERT INTO store_items (title, subtitle, kind, price_units, stock, note, deliver, status, sort)
SELECT 'Steam 充值卡 30 元', '即时发码', 'code', 300000, -1,
       '兑换后立即在订单里显示激活码，不需要等待审核。', '激活码由后台批量导入，按导入顺序发放。', 'on', 10
WHERE NOT EXISTS (SELECT 1 FROM store_items);

INSERT INTO store_items (title, subtitle, kind, price_units, stock, note, deliver, status, sort)
SELECT '京东 E 卡 50 元', '即时发码', 'code', 500000, -1,
       '电子卡密，兑换后在订单详情里查看。', '批量导入，售完为止。', 'on', 20
WHERE (SELECT COUNT(*) FROM store_items) = 1;

INSERT INTO store_items (title, subtitle, kind, price_units, stock, note, deliver, status, sort)
SELECT '视频会员月卡', '人工发货', 'sub', 250000, -1,
       '兑换后由管理员在两个工作日内开通，开通结果通过站内消息通知。', '需提供手机号或账号，兑换时在备注里填写。', 'on', 30
WHERE (SELECT COUNT(*) FROM store_items) = 2;

INSERT INTO store_items (title, subtitle, kind, price_units, stock, note, deliver, status, sort)
SELECT '支付宝提现 10 元', '转人工审核', 'cash', 100000, -1,
       '兑换后自动生成提现申请，资金进入冻结，审核通过后打款。', '收款账号需与实名信息一致。', 'on', 5
WHERE (SELECT COUNT(*) FROM store_items) = 3;
