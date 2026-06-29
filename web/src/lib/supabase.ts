// 前端 Supabase client
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(url, anonKey);

// 上傳冰箱/收據照片並觸發食材辨識
export async function addItemsByPhoto(file: File, householdId: string) {
  const path = `${householdId}/${Date.now()}_${file.name}`;
  const { error: upErr } = await supabase.storage
    .from("fridge")
    .upload(path, file, { upsert: false });
  if (upErr) throw upErr;

  const { data: pub } = supabase.storage.from("fridge").getPublicUrl(path);
  const imageUrl = pub.publicUrl;

  const { data, error } = await supabase.functions.invoke("recognize-items", {
    body: { image_url: imageUrl, household_id: householdId },
  });
  if (error) throw error;
  return data; // { ok, added, items }
}

// 取得即將到期食材
export async function getSoonItems(householdId: string) {
  const { data, error } = await supabase
    .from("items")
    .select("id, name, category, expire_date, status")
    .eq("household_id", householdId)
    .order("expire_date", { ascending: true });
  if (error) throw error;
  return data;
}
