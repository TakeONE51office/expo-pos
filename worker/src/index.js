// 展会收银台 · 拿货屏同步接口（Cloudflare Worker + D1）
// 所有请求都要带请求头 X-Token（口令保存在 Worker 的 secret 里，不进仓库）
//
// GET    /ping                     检查口令
// POST   /orders                   新增订单（重复 id 忽略）       body: {id,no,ts,total,status,pay,items}
// PATCH  /orders/:id               更新状态                       body: {status:'cancelled'} 或 {picked:true}
// GET    /orders?since=<毫秒>       拿货屏轮询：since 之后未处理的订单 + 已出货数

const ALLOWED_ORIGINS = [
  'https://takeone51office.github.io',
];
const isLocal = o => /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);

function cors(req) {
  const o = req.headers.get('Origin') || '';
  const h = {
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,X-Token',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
  if (ALLOWED_ORIGINS.includes(o) || isLocal(o)) h['Access-Control-Allow-Origin'] = o;
  return h;
}

const json = (req, data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors(req) } });

function sameStr(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

const str = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max;

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });

    if (!env.TOKEN || !sameStr(req.headers.get('X-Token') || '', env.TOKEN)) {
      return json(req, { error: 'unauthorized' }, 401);
    }

    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '');

    try {
      if (req.method === 'GET' && path === '/ping') return json(req, { ok: true });

      if (req.method === 'POST' && path === '/orders') {
        const b = await req.json();
        if (!str(b.id, 64) || !str(b.no, 16) || !Number.isFinite(b.ts) || !Number.isFinite(b.total)
            || !Array.isArray(b.items) || b.items.length > 200) {
          return json(req, { error: 'bad order' }, 400);
        }
        const status = b.status === 'cancelled' ? 'cancelled' : 'done';
        const items = JSON.stringify(b.items.map(it => ({
          n: String(it.n ?? '').slice(0, 100), q: Number(it.q) || 0, p: Number(it.p) || 0,
        })));
        const pay = JSON.stringify({ m: b.pay && typeof b.pay.m === 'string' ? b.pay.m.slice(0, 16) : null });
        await env.DB.prepare(
          'INSERT OR IGNORE INTO orders (id,no,ts,total,status,pay,items) VALUES (?,?,?,?,?,?,?)'
        ).bind(b.id, b.no, Math.round(b.ts), Math.round(b.total), status, pay, items).run();
        return json(req, { ok: true }, 201);
      }

      const m = path.match(/^\/orders\/([^/]{1,64})$/);
      if (req.method === 'PATCH' && m) {
        const id = decodeURIComponent(m[1]);
        const b = await req.json();
        if (b.status === 'cancelled') {
          // 与原来一致：还没出货的单会在拿货屏变红警示；已出货的单不再弹出
          await env.DB.prepare("UPDATE orders SET status='cancelled' WHERE id=?").bind(id).run();
        } else if (b.picked === true) {
          await env.DB.prepare('UPDATE orders SET picked=1 WHERE id=?').bind(id).run();
        } else {
          return json(req, { error: 'bad patch' }, 400);
        }
        return json(req, { ok: true });
      }

      if (req.method === 'GET' && path === '/orders') {
        const since = Number(url.searchParams.get('since')) || 0;
        const { results } = await env.DB.prepare(
          'SELECT id,no,ts,total,status,items FROM orders WHERE picked=0 AND ts>=? ORDER BY ts ASC LIMIT 300'
        ).bind(since).all();
        const done = await env.DB.prepare(
          "SELECT COUNT(*) AS n FROM orders WHERE picked=1 AND status='done' AND ts>=?"
        ).bind(since).first();
        return json(req, {
          pending: results.map(r => ({ ...r, items: JSON.parse(r.items) })),
          done: done ? done.n : 0,
        });
      }

      return json(req, { error: 'not found' }, 404);
    } catch (e) {
      return json(req, { error: 'server error' }, 500);
    }
  },
};
