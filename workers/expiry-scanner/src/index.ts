// 冰箱救星 — 每日到期掃描 Worker（取代 AWS Fargate / EventBridge）
// Cloudflare Worker，由 Cron Triggers 每日觸發
// 流程：更新所有 items 狀態 → 找出 3 天內到期且未通知者 → 生成食譜 → LINE 推播
//
// 部署：npx wrangler deploy
// Secrets：SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LINE_CHANNEL_ACCESS_TOKEN, GENERATE_RECIPE_URL

import { createClient } from "@supabase/supabase-js";

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  LINE_CHANNEL_ACCESS_TOKEN: string;
  GENERATE_RECIPE_URL: string;   // generate-recipe Edge Function 的 URL
  SERVICE_AUTH: string;          // 呼叫 Edge Function 用的 service role key
}

const SOON_DAYS = 3;

// 依到期日算狀態
function statusOf(expire: string, today: string): "fresh" | "soon" | "expired" {
  const exp = new Date(expire).getTime();
  const now = new Date(today).getTime();
  const diffDays = Math.floor((exp - now) / 86_400_000);
  if (diffDays < 0) return "expired";
  if (diffDays <= SOON_DAYS) return "soon";
  return "fresh";
}

async function pushLine(token: string, lineUserId: string, text: string) {
  await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to: lineUserId, messages: [{ type: "text", text }] }),
  });
}

async function getRecipe(env: Env, householdId: string, items: string[]) {
  try {
    const res = await fetch(env.GENERATE_RECIPE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.SERVICE_AUTH}` },
      body: JSON.stringify({ household_id: householdId, items }),
    });
    if (!res.ok) return null;
    const j = await res.json() as any;
    return j.recipe ?? null;
  } catch { return null; }
}

async function runScan(env: Env) {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const today = new Date().toISOString().slice(0, 10);

  // 1. 撈出所有食材，更新狀態
  const { data: items } = await supabase
    .from("items")
    .select("id, household_id, name, expire_date, status, notified");
  if (!items?.length) return { scanned: 0 };

  const soonByHousehold: Record<string, string[]> = {};
  for (const it of items) {
    const st = statusOf(it.expire_date, today);
    if (st !== it.status) {
      await supabase.from("items").update({ status: st }).eq("id", it.id);
    }
    // 即期且尚未通知 → 收集
    if (st === "soon" && !it.notified) {
      (soonByHousehold[it.household_id] ??= []).push(it.name);
    }
  }

  // 2. 每個有即期食材的家庭：生成食譜 + 推播給成員
  let pushed = 0;
  for (const [householdId, names] of Object.entries(soonByHousehold)) {
    const recipe = await getRecipe(env, householdId, names);
    const recipeLine = recipe?.title ? `\n今晚試試：${recipe.title} 🍳` : "";
    const msg = `🧊 提醒：這 ${names.length} 樣食材快過期囉 — ${names.join("、")}。${recipeLine}\n打開冰箱救星看食譜與採買清單。`;

    // 找出該家庭所有成員
    const { data: members } = await supabase
      .from("users").select("id, line_user_id").eq("household_id", householdId);

    for (const m of members ?? []) {
      if (m.line_user_id) {
        await pushLine(env.LINE_CHANNEL_ACCESS_TOKEN, m.line_user_id, msg);
        await supabase.from("notifications").insert({
          user_id: m.id, type: "expiry", channel: "line",
          payload: { items: names, recipe: recipe?.title ?? null },
        });
        pushed++;
      }
    }

    // 標記已通知，避免重複轟炸
    await supabase.from("items").update({ notified: true })
      .eq("household_id", householdId).in("name", names);
  }

  return { scanned: items.length, households_notified: Object.keys(soonByHousehold).length, pushed };
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runScan(env).then((r) => console.log("expiry-scan", r)));
  },
  async fetch(_req: Request, env: Env) {
    const r = await runScan(env);
    return new Response(JSON.stringify(r), { headers: { "Content-Type": "application/json" } });
  },
};
