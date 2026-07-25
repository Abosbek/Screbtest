import { getChannels } from "./db.js";
import { getChatMember } from "./telegram.js";

// 4 xonali noyob test kodi generatsiya qilish
export async function generateTestCode(env) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = String(Math.floor(1000 + Math.random() * 9000));
    const exists = await env.DB.prepare("SELECT id FROM tests WHERE code = ?").bind(code).first();
    if (!exists) return code;
  }
  throw new Error("Noyob kod generatsiya qilib bo'lmadi");
}

// Foydalanuvchi barcha majburiy kanallarga a'zoligini tekshiradi
// Qaytaradi: { ok: true } yoki { ok: false, missing: [ {chat_id, title} ... ] }
export async function checkSubscription(env, telegramId) {
  const required = await getChannels(env, "required");
  if (required.length === 0) return { ok: true, missing: [] };
  const missing = [];
  for (const ch of required) {
    try {
      const res = await getChatMember(env, ch.chat_id, telegramId);
      const status = res?.result?.status;
      if (!res.ok || ["left", "kicked"].includes(status)) {
        missing.push(ch);
      }
    } catch {
      missing.push(ch);
    }
  }
  return { ok: missing.length === 0, missing };
}

export function subscriptionKeyboard(missing) {
  const rows = missing.map((ch) => [
    { text: `➕ ${ch.title || "Kanalga o'tish"}`, url: channelUrl(ch.chat_id) },
  ]);
  rows.push([{ text: "✅ A'zo bo'ldim", callback_data: "check_sub" }]);
  return { inline_keyboard: rows };
}

function channelUrl(chatId) {
  const id = String(chatId);
  if (id.startsWith("@")) return `https://t.me/${id.slice(1)}`;
  if (id.startsWith("https://") || id.startsWith("t.me/")) return id.startsWith("t.me") ? `https://${id}` : id;
  return `https://t.me/${id}`;
}

// "2026-08-10T14:00" kabi ISO satrni yaratadi hozirgi vaqt bilan solishtirish uchun
export function parseUserDateTime(str) {
  // Kutilgan format: KK.OO.YYYY SS:DD  (masalan 10.08.2026 14:00)
  const m = str.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const [, d, mo, y, h, mi] = m;
  const iso = `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}T${h.padStart(2, "0")}:${mi}:00`;
  const date = new Date(iso);
  if (isNaN(date.getTime())) return null;
  return iso;
}

export function formatDateTime(iso) {
  if (!iso) return "-";
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()} ${pad(
    d.getUTCHours()
  )}:${pad(d.getUTCMinutes())}`;
}

export function minutesUntil(iso) {
  const target = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z").getTime();
  return Math.round((target - Date.now()) / 60000);
}

// Javoblarni tekshirish: userAnswers va key bir xil uzunlikda solishtiriladi (katta-kichik harf farqsiz)
export function scoreAnswers(userAnswers, key, points) {
  const ua = userAnswers.toUpperCase().replace(/[^A-Z]/g, "");
  const k = key.toUpperCase();
  const pts = points; // array of numbers, length == k.length
  let score = 0;
  let maxScore = 0;
  let correctCount = 0;
  const wrongQuestions = [];
  for (let i = 0; i < k.length; i++) {
    const p = pts[i] !== undefined ? pts[i] : 1;
    maxScore += p;
    if (ua[i] && ua[i] === k[i]) {
      score += p;
      correctCount++;
    } else {
      wrongQuestions.push(i + 1);
    }
  }
  return { score, maxScore, correctCount, total: k.length, wrongQuestions };
}
