-- 拿货屏订单表（Cloudflare D1）
CREATE TABLE IF NOT EXISTS orders (
  id      TEXT PRIMARY KEY,          -- 收银端生成的订单 id
  no      TEXT NOT NULL,             -- 当日流水号，如 #001
  ts      INTEGER NOT NULL,          -- 下单时间（毫秒时间戳）
  total   INTEGER NOT NULL,          -- 合计（日元）
  status  TEXT NOT NULL DEFAULT 'done',   -- done / cancelled
  pay     TEXT,                      -- JSON：{m}
  items   TEXT NOT NULL,             -- JSON：[{n,q,p}]
  picked  INTEGER NOT NULL DEFAULT 0 -- 拿货端已处理 = 1
);
CREATE INDEX IF NOT EXISTS idx_orders_ts ON orders(ts);
