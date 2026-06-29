# 冰箱救星 Fridge Saver 🧊

> AI 食材到期管家 + 即食食譜推薦
> 拍一張冰箱，AI 幫你管到期、想菜單，少丟食物、少花錢。

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

## 這是什麼

解決兩個天天發生的痛點：食物放到壞掉、每天煩惱「今天吃什麼」。

- 📷 **拍照登錄** — Gemini AI 辨識食材、自動估到期日
- ⏰ **到期管理** — 每日掃描，紅黃綠標示新鮮 / 即期 / 過期
- 🔔 **主動提醒** — 到期前用 LINE 推「這幾樣快壞了，今晚煮這道」
- 🍳 **AI 食譜** — 依現有即期食材生成一道菜（含步驟與缺料）
- 🛒 **採買清單** — 自動生成，一鍵導購生鮮電商

## 技術棧（不依賴 AWS）

| 用途 | 工具 |
|---|---|
| 前端 | React + Vite（可用 Lovable 產生）|
| 部署 | Vercel |
| DB / Auth / Storage | Supabase |
| 即時運算 | Supabase Edge Functions（取代 AWS Lambda）|
| 每日排程 | Cloudflare Workers + Cron Triggers（取代 AWS Fargate）|
| AI 辨識 / 食譜 | Gemini 2.5 Flash |
| 金流 | Stripe（海外）/ ECPay（台灣）|
| 通知 | LINE Messaging API |

完整規格見 [`docs/PRD.md`](./docs/PRD.md)。

## 專案結構

```
fridge-saver/
├── docs/
│   └── PRD.md                       # 產品規格書
├── supabase/
│   ├── migrations/
│   │   └── 0001_init.sql            # 資料表 + RLS
│   └── functions/
│       ├── recognize-items/
│       │   └── index.ts             # 拍照辨識食材 (Edge Function)
│       └── generate-recipe/
│           └── index.ts             # 依即期食材生成食譜 (Edge Function)
├── workers/
│   └── expiry-scanner/
│       ├── src/index.ts             # 每日掃到期 + LINE 推播
│       └── wrangler.toml
├── web/
│   ├── src/
│   │   ├── lib/supabase.ts
│   │   └── components/AddItem.tsx
│   └── package.json
├── .env.example
├── .gitignore
└── LICENSE
```

## 快速開始

```bash
# 1. Supabase
supabase link --project-ref <your-ref>
supabase db push
supabase functions deploy recognize-items
supabase functions deploy generate-recipe

# 2. Cloudflare Worker（每日到期掃描）
cd workers/expiry-scanner
npm install && npx wrangler deploy

# 3. 前端
cd web && npm install && npm run dev
```

環境變數請複製 `.env.example` 為 `.env` 並填入金鑰。

## 授權

MIT © peterpitt
