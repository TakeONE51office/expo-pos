# 展会收银台 expo-pos · 交接说明（给接手的人 / Claude 看）

2026-11-19 打包。

## 是什么
手办白模展会摊位用的**离线收银 + 库存**网页（PWA），展会在日本，金额为日元。
- 线上地址：https://takeone51office.github.io/expo-pos/ （GitHub Pages）
- 仓库：github.com/TakeONE51office/expo-pos（公开）
- 更新流程：改 `index.html` → `git commit` → `git push`，Pages 自动上线
- 包里带了 `.git`，`git log` 可看完整修改历史

## 文件
| 文件 | 作用 |
|---|---|
| `index.html` | 收银主程序（单文件，含全部 HTML/CSS/JS，约 1300 行） |
| `picker.html` | 拿货屏：第二台 iPad 用 Safari 打开，3 秒轮询云端显示新订单 |
| `sw.js` | Service Worker 离线缓存（网络优先、断网回退缓存）。改了页面若要强制更新，改 `CACHE` 版本号 |
| `.gitignore` | 忽略 `artifact.html`（旧的预览版）、`node_modules`、`.wrangler`、`.dev.vars` |
| `worker/` | 拿货屏同步接口（Cloudflare Worker + D1），见下文 |

## 数据存在哪（重要）
1. **销售/库存真实数据只在收银 iPad 的浏览器 localStorage 里**，key = `expo_pos_v1`，结构：
   ```
   products: [{id,name,price,cap(库存上限),stock(余量),warn(提醒阈值)}]
   orders:   [{id,no,ts,items,total,status,pay:{m,recv,chg}}]   // status 含已取消；取消会返还库存
   settings: {shop,foot,paper,pmode,auto,copies,lastPay,lang}
   seq:      {date,n}   // 当日流水号
   ```
   电脑上拿不到，要在那台 iPad 上：设置页 → 📤 数据导出 → 「订单明细 CSV」「库存汇总 CSV」。
2. **云端同步副本**：Cloudflare Worker + D1（2026-11-19 从 Supabase 迁移过来；Supabase 免费版长期不用会被暂停删除，Cloudflare 不会）。
   - 代码在 `worker/`：`src/index.js`（接口）、`schema.sql`（orders 表）、`wrangler.toml`
   - 所有请求带请求头 `X-Token` = 同步口令。口令存在 Worker 的 secret 里，**不进仓库**；收银台在「设置 → 拿货屏同步」填，拿货屏在开始页填，两边一致
   - 前端地址常量 `API_URL` 在 `index.html` / `picker.html`；在 localhost 打开时自动连本地 `http://127.0.0.1:8787`
   - 只允许 `https://takeone51office.github.io` 和 localhost 跨域访问

## 部署 / 更新接口
```
cd worker
npm install
npx wrangler login                     # 首次：浏览器里授权 Cloudflare
npx wrangler d1 create expo-pos        # 首次：把输出的 database_id 填进 wrangler.toml
npm run db:init:remote                 # 首次：建表
npx wrangler secret put TOKEN          # 设置/修改同步口令（手动输入，不留在记录里）
npm run deploy                         # 发布，输出的 workers.dev 地址填进两个 html 的 API_URL
```
本地测试：`worker/.dev.vars` 写 `TOKEN=localtest`，`npm run db:init:local` 后 `npm run dev`，再用 http.server 开页面。

## 功能要点
- 商品约 22 款、固定价；库存上限 + 余量醒目提醒；取消订单自动返还库存
- 收款：现金(默认)/PayPay/支付宝；找零计算
- 中日双语（顶栏🌐，`I18N` 字典），日文小票用 合計/お支払い/お預かり/お釣り
- 小票打印：Web Bluetooth（BLE ESC/POS），打印机 优库 Yokoscan 80HB（80mm）
  - iPhone/iPad 必须用 **Bluefy** 浏览器（Safari 不支持 Web Bluetooth）
  - 文本模式：用 `TextDecoder('gbk')` 反查生成 GBK 编码；字形不对可切「图片模式」（canvas 光栅图 GS v 0）
  - 「每单打印份数」=2 时一张给客人一张给拿货（拿货屏的保底方案）
- 拿货屏：收银端离线时订单排队，联网后补传；拿货端出货完成标 picked=true、取消单红色警示、新单提示音

## 本地调试
```
py -3 -m http.server 8734
```
浏览器开 http://localhost:8734 。蓝牙需要 HTTPS 或 localhost；手机真机测可用 `cloudflared tunnel --url http://localhost:8734` 开临时 HTTPS 隧道。
claude.ai 的 Artifact 沙箱会拦截蓝牙权限，不能用来托管。
