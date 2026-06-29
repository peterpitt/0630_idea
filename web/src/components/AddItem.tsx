// 拍照登錄食材元件 — 拍冰箱/收據 → AI 辨識 → 顯示新增結果
import { useState } from "react";
import { addItemsByPhoto } from "../lib/supabase";

interface Props {
  householdId: string;
}

export default function AddItem({ householdId }: Props) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError(null);
    setItems([]);
    try {
      const data = await addItemsByPhoto(file, householdId);
      setItems(data.items ?? []);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: "0 auto", fontFamily: "system-ui" }}>
      <h2>🧊 拍照登錄食材</h2>
      <label style={{
        display: "block", padding: "2rem", border: "2px dashed #888",
        borderRadius: 12, textAlign: "center", cursor: "pointer",
      }}>
        {loading ? "AI 辨識中…" : "拍冰箱內容物或採買收據"}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFile}
          style={{ display: "none" }}
          disabled={loading}
        />
      </label>

      {error && <p style={{ color: "crimson" }}>錯誤：{error}</p>}

      {items.length > 0 && (
        <div style={{ marginTop: 16, padding: 16, background: "#f5f5f5", borderRadius: 12 }}>
          <h3>已新增 {items.length} 項食材</h3>
          <ul>
            {items.map((it, i) => (
              <li key={i}>
                {it.name}（{it.category}）× {it.qty}{it.unit} — 估到期 {it.expire_date}
              </li>
            ))}
          </ul>
          <p style={{ color: "#666", fontSize: 13 }}>
            ✓ 到期前我們會用 LINE 提醒你，並推薦一道用得上的菜
          </p>
        </div>
      )}
    </div>
  );
}
