# 冰箱救星 Fridge Saver — PRD 產品規格書

> AI 食材到期管家 + 即食食譜推薦
> 版本 v1.0｜撰寫日 2026-06-30｜Owner: peterpitt

---

## 1. 產品定位

**一句話：** 拍一張冰箱，AI 幫你管到期、想菜單，少丟食物、少花錢。

解決兩個天天發生的痛點：

1. **食物放到壞掉** — 買了忘記吃，過期才發現，等於把錢丟進垃圾桶。
2. **每天煩惱吃什麼** — 「晚餐吃什麼」是每天的決策疲勞。

冰箱救星把「省錢」與「省腦力」綁在一起：你拍食材，它管到期、到期前提醒你，並用你現有的食材推一道今晚就能煮的菜。

目標族群：自煮的上班族、雙薪家庭、租屋族、想省錢又怕浪費的人。

---

## 2. 核心功能（MVP 範圍）

### 2.1 食材登錄
- 拍冰箱內容物照片，或拍採買收據，AI（Gemini 2.5 Flash）辨識品項與數量。
- AI 依品項類型自動估算保存天數（可手動修正到期日）。
- 也支援手動快速新增。

### 2.2 到期管理
- 每樣食材顯示剩餘天數、狀態（新鮮 / 即將到期 / 已過期）。
- 每日系統自動掃描，找出 3 天內到期的食材。

### 2.3 主動提醒 + 食譜
- 到期前用 LINE 推播：「這 N 樣快壞了，今晚試試這道」。
- AI 依「即將到期的食材」生成一道可用上它們的食譜（步驟 + 缺的配料）。
- 備援管道：Email、Web 站內。

### 2.4 採買清單
- 從食譜缺料、或常買清單自動生成採買清單。
- Pro：一鍵帶到合作生鮮電商（導購分潤）。

### 2.5 帳號與方案
- LINE Login / Email 註冊。
- 免費版與付費版差異見第 5 節；Family 方案可共享同一個冰箱。

---

## 3. 資料表設計（Supabase / PostgreSQL）

```
users
  id            uuid PK
  line_user_id  text unique
  email         text
  plan          text   -- 'free' | 'pro' | 'family'
  household_id  uuid   -- 家庭共享冰箱
  created_at    timestamptz

households
  id            uuid PK
  name          text
  owner_id      uuid FK -> users.id
  created_at    timestamptz

items                      -- 食材
  id            uuid PK
  household_id  uuid FK -> households.id
  name          text
  category      text        -- 蔬菜/肉類/海鮮/乳製品/蛋/熟食/調味/其他
  qty           numeric
  unit          text        -- 份/克/盒...
  bought_date   date
  expire_date   date
  image_url     text
  status        text        -- 'fresh' | 'soon' | 'expired'（由排程更新）
  notified      boolean     -- 是否已推播提醒，避免重複
  created_at    timestamptz

recipes                    -- AI 生成的食譜（快取）
  id            uuid PK
  household_id  uuid FK
  title         text
  used_items    text[]      -- 用到的即將到期食材
  ingredients   jsonb       -- 完整配料（含缺料）
  steps         jsonb
  created_at    timestamptz

notifications
  id            uuid PK
  user_id       uuid FK
  type          text        -- 'expiry' | 'recipe'
  payload       jsonb
  channel       text        -- 'line' | 'email' | 'web'
  sent_at       timestamptz
```

RLS：所有資料以 `household_id` 綁定使用者所屬家庭；`auth.uid()` 須屬於該 household 才能讀寫。

---

## 4. 技術架構（AWS 全部已替換）

| 層級 | 採用工具 | 取代原本的 | 說明 |
|---|---|---|---|
| 前端 | Lovable / React + Vite | — | 拍照登錄、食材列表、食譜頁 |
| 部署 | Vercel | — | 前端 hosting + 自有網域 |
| DB / Auth / Storage | Supabase | — | Postgres + RLS + 食材圖片 |
| 即時運算 | **Supabase Edge Functions** | **AWS Lambda** | 辨識食材、生成食譜 |
| 每日排程 | **Cloudflare Cron + Workers** | **AWS Fargate / EventBridge** | 每日掃到期、推播提醒 |
| AI 辨識 / 食譜 | **Gemini 2.5 Flash** | 自架模型 | 中文食材辨識 + 食譜生成 |
| 金流（海外/台灣） | Stripe / ECPay | — | 訂閱收款 |
| 通知 | LINE Messaging API | — | 到期提醒 + 食譜推播 |

### 資料流
```
拍照 → Supabase Storage
     → Edge Function 呼叫 Gemini 辨識食材 + 估到期 → 寫入 items
每日 08:00 → Cloudflare Cron → 掃描 3 天內到期 items → 更新 status
          → Edge Function 依即將到期食材生成食譜
          → LINE 推播「快壞了，今晚煮這道」
```

> 全棧可跑在免費 / 低成本層，邊際成本趨近於零。

---

## 5. 變現模式與試算

| 方案 | 價格 | 內容 |
|---|---|---|
| Free | NT$0 | 追蹤 15 項食材、基本到期提醒 |
| Pro | NT$49/月 | 無限食材、AI 進階食譜、自動採買清單、優先辨識 |
| Family | NT$99/月 | Pro 全功能 + 家庭共享冰箱（最多 5 人）|

額外收入：採買清單導購生鮮電商分潤。

**保守試算（第 6 個月）**
- 註冊 6,000，付費轉換率 4% → 240 付費，平均 NT$55/人/月 → 月營收約 **NT$13,000**。
- 導購分潤抓 NT$4,000/月 → 合計約 **NT$17,000/月**。
- 成本主要為 Gemini 辨識/食譜呼叫；其餘多在免費層 → 毛利率高。

---

## 6. 畫面流程（MVP）

1. **Landing** — 價值主張、CTA「用 LINE 登入」。
2. **拍照登錄** — 拍冰箱/收據 → AI 辨識結果 → 確認存檔。
3. **食材列表** — 依到期天數排序，紅黃綠標示狀態。
4. **今晚煮什麼** — AI 食譜卡片（用到的即期食材 + 步驟 + 缺料）。
5. **採買清單** — 缺料/常買，一鍵導購。
6. **提醒** — LINE 卡片 + 站內紅點。
7. **設定** — 通知時間、家庭成員、方案。

---

## 7. 開發里程碑

| 階段 | 範圍 | 預估 |
|---|---|---|
| M1 | Schema + Auth + 拍照辨識登錄 | 第 1 週 |
| M2 | 每日到期掃描 + LINE 推播 | 第 2 週 |
| M3 | AI 食譜生成 + 採買清單 | 第 3 週 |
| M4 | 金流 + 方案限制 + 家庭共享 | 第 4 週 |
| M5 | 自有網域上線 + 內測 | 第 5 週 |

---

## 8. 風險與備註

- **保存天數估算誤差**：不同保存方式差很多，提供手動修正，並用品類預設值做基準。
- **辨識準確度**：冰箱雜亂時辨識率下降，提供逐項確認與手動新增。
- **推播疲勞**：用 `notified` 旗標避免重複轟炸，並讓使用者設定提醒時間與頻率。
- **個資**：飲食習慣屬個人資料，落實 RLS、清楚隱私政策。
