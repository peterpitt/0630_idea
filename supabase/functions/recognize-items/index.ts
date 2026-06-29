// 冰箱救星 — 食材辨識 Edge Function（取代 AWS Lambda）
// 流程：接收冰箱/收據圖片 → Gemini 辨識食材 + 估到期日 → 寫入 items
//
// 部署：supabase functions deploy recognize-items
// 環境變數：GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "jsr:@supabase/supabase-js@2";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

// 各類別冷藏預設保存天數（估算基準，使用者可改）
const SHELF_LIFE: Record<string, number> = {
  "蔬菜": 5, "肉類": 3, "海鮮": 2, "乳製品": 7,
  "蛋": 21, "熟食": 2, "調味": 180, "其他": 7,
};

const PROMPT = `你是冰箱食材辨識助手。請從圖片中找出所有食材，只回傳 JSON：
{
  "items": [
    {
      "name": "食材名稱",
      "category": "從[蔬菜,肉類,海鮮,乳製品,蛋,熟食,調味,其他]擇一",
      "qty": 數量,
      "unit": "單位，如 份/克/盒/顆"
    }
  ]
}
不要加任何說明文字。若無法辨識數量請填 1。`;

async function fetchImageAsBase64(url: string) {
  const res = await fetch(url);
  const mime = res.headers.get("content-type") ?? "image/jpeg";
  const buf = new Uint8Array(await res.arrayBuffer());
  let binary = "";
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
  return { data: btoa(binary), mime };
}

async function recognize(imageUrl: string) {
  const { data, mime } = await fetchImageAsBase64(imageUrl);
  const body = {
    contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: mime, data } }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0 },
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

// 依類別估到期日
function estimateExpire(category: string): string {
  const days = SHELF_LIFE[category] ?? SHELF_LIFE["其他"];
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  try {
    const { image_url, household_id } = await req.json();
    if (!image_url || !household_id) {
      return new Response(JSON.stringify({ error: "missing image_url or household_id" }), { status: 400 });
    }

    const ocr = await recognize(image_url);
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    const rows = (ocr.items ?? []).map((it: any) => ({
      household_id,
      name: it.name,
      category: it.category,
      qty: it.qty ?? 1,
      unit: it.unit,
      bought_date: new Date().toISOString().slice(0, 10),
      expire_date: estimateExpire(it.category),
      image_url,
      status: "fresh",
      notified: false,
    }));

    if (rows.length) {
      const { error } = await supabase.from("items").insert(rows);
      if (error) throw error;
    }

    return new Response(JSON.stringify({ ok: true, added: rows.length, items: rows }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
