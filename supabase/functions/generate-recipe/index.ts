// 冰箱救星 — AI 食譜生成 Edge Function（取代 AWS Lambda）
// 流程：接收即將到期食材清單 → Gemini 生成一道用得上它們的食譜 → 寫入 recipes 快取
//
// 部署：supabase functions deploy generate-recipe
// 環境變數：GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "jsr:@supabase/supabase-js@2";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

function buildPrompt(items: string[]): string {
  return `你是家常料理助手。我冰箱裡有這些「快過期」的食材，請設計一道今晚就能煮、盡量用上它們的菜，只回傳 JSON：
快過期食材：${items.join("、")}
格式：
{
  "title": "菜名",
  "used_items": ["實際用到的上述食材"],
  "ingredients": [{"name":"配料","amount":"用量","have":true/false}],
  "steps": ["步驟1","步驟2","..."]
}
have=true 表示是上述食材，false 表示可能需要另外採買。不要加任何說明文字。`;
}

async function generate(items: string[]) {
  const body = {
    contents: [{ parts: [{ text: buildPrompt(items) }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.7 },
  };
  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gemini error ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  return JSON.parse(text);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  try {
    const { household_id, items } = await req.json();
    if (!household_id || !Array.isArray(items) || items.length === 0) {
      return new Response(JSON.stringify({ error: "missing household_id or items" }), { status: 400 });
    }

    const recipe = await generate(items);
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data, error } = await supabase.from("recipes").insert({
      household_id,
      title: recipe.title,
      used_items: recipe.used_items ?? [],
      ingredients: recipe.ingredients ?? [],
      steps: recipe.steps ?? [],
    }).select("id").single();
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, recipe_id: data.id, recipe }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
