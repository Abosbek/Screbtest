import { sendMessage, setWebhook } from "./telegram.js";
import {
  ensureUser,
  getUser,
  setState,
  getStateData,
  isAdmin,
  isWhitelisted,
  getSetting,
  getChannels,
} from "./db.js";
import { handleRegistrationText, handleRegistrationCallback } from "./registration.js";
import {
  handleMainMenuText,
  handleTestCode,
  handleCheckSubCallback,
  handleAnswerSubmission,
  handleProfileCallback,
  handleProfileEditText,
  handleProfileEditCallback,
} from "./studentMenu.js";
import {
  showAdminMenu,
  handleAdminCallback,
  handleBaseChannelFile,
  handleAddTestText,
  handleChannelForward,
} from "./adminPanel.js";
import { studentMainMenu } from "./keyboards.js";
import { formatDateTime, minutesUntil } from "./utils.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Webhookni birinchi marta o'rnatish uchun: /setup manzilini oching
    if (url.pathname === "/setup") {
      const webhookUrl = `${url.origin}/webhook`;
      const res = await setWebhook(env, webhookUrl);
      return new Response(JSON.stringify(res, null, 2), {
        headers: { "content-type": "application/json" },
      });
    }

    if (url.pathname === "/webhook" && request.method === "POST") {
      const secret = request.headers.get("x-telegram-bot-api-secret-token");
      if (secret !== env.WEBHOOK_SECRET) {
        return new Response("Forbidden", { status: 403 });
      }
      const update = await request.json();
      ctx.waitUntil(handleUpdate(update, env));
      return new Response("ok");
    }

    return new Response("Uzbek Test Bot ishlayapti.");
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runScheduledTasks(env));
  },
};

async function handleUpdate(update, env) {
  try {
    if (update.channel_post) {
      await handleChannelPost(update.channel_post, env);
      return;
    }
    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query, env);
      return;
    }
    if (update.message) {
      await handleMessage(update.message, env);
      return;
    }
  } catch (err) {
    console.log("handleUpdate xatosi:", err.stack || err.message);
  }
}

// ================= CHANNEL POST (Baza kanaliga fayl tashlanganda) =================
async function handleChannelPost(post, env) {
  const chatId = String(post.chat.id);

  // Agar biror admin kanal qo'shish jarayonida forward kutayotgan bo'lsa - bu yerga tegishli emas
  const baseChannels = await getChannels(env, "base");
  const isBase = baseChannels.some((c) => c.chat_id === chatId);
  if (!isBase) return;

  let fileId = null;
  let fileType = null;
  if (post.document) {
    fileId = post.document.file_id;
    fileType = "document";
  } else if (post.photo && post.photo.length > 0) {
    fileId = post.photo[post.photo.length - 1].file_id;
    fileType = "photo";
  }
  if (!fileId) return;

  const { results } = await env.DB.prepare(
    "SELECT telegram_id FROM users WHERE state = 'admin_awaiting_file' LIMIT 1"
  ).all();
  if (!results || results.length === 0) return;

  await handleBaseChannelFile(env, chatId, results[0].telegram_id, fileId, fileType);
}

// ================= MESSAGE =================
async function handleMessage(msg, env) {
  const chatId = msg.chat.id;
  if (msg.chat.type !== "private") return; // guruh/kanal xabarlarini e'tiborsiz qoldiramiz

  // Texnik rejim tekshiruvi
  const maintenance = await getSetting(env, "maintenance");
  const admRole = await isAdmin(env, chatId);
  if (maintenance === "1" && !admRole) {
    const whitelisted = await isWhitelisted(env, chatId);
    if (!whitelisted) {
      await sendMessage(env, chatId, "🛠 Hozircha bot texnik ishlar tufayli ishlamayapti. Iltimos, birozdan so'ng qayta urinib ko'ring.");
      return;
    }
  }

  const text = msg.text || "";

  if (text === "/start") {
    const user = await ensureUser(env, chatId);
    if (user.registered) {
      await sendMessage(env, chatId, "🏠 Bosh menyu:", studentMainMenu());
    } else {
      await setState(env, chatId, "reg_name");
      await sendMessage(env, chatId, "👋 Botga xush kelibsiz!\n\nIsmingizni kiriting:");
    }
    return;
  }

  if (text === "/admin") {
    const role = await isAdmin(env, chatId);
    if (!role) {
      await sendMessage(env, chatId, "⛔️ Sizda admin huquqi yo'q.");
      return;
    }
    await showAdminMenu(env, chatId, role);
    return;
  }

  const user = await ensureUser(env, chatId);

  // Kanal forward orqali qo'shilishi (admin_channel_add holatida)
  if (user.state === "admin_channel_add" && msg.forward_from_chat) {
    const data = getStateData(user);
    await handleChannelForward(env, chatId, msg.forward_from_chat, data.type);
    return;
  }

  // Ro'yxatdan o'tish bosqichlari
  if (user.state && user.state.startsWith("reg_") && ["reg_name", "reg_lastname", "reg_fathername"].includes(user.state)) {
    await handleRegistrationText(env, user, text);
    return;
  }

  if (!user.registered) {
    // Ro'yxatdan o'tmagan lekin tugma bosqichida (region/level/grade) bo'lsa ham matn yozsa eslatamiz
    await sendMessage(env, chatId, "Iltimos, yuqoridagi tugmalardan birini tanlang.");
    return;
  }

  // Admin test yaratish bosqichlari
  if (user.state && user.state.startsWith("admin_")) {
    const handled = await handleAddTestText(env, user, text);
    if (handled) return;
  }

  // Profil tahrirlash matnli bosqichlari
  if (user.state === "profile_edit_name" || user.state === "profile_edit_lastname") {
    await handleProfileEditText(env, user, text);
    return;
  }

  // Test kodi kutilmoqda
  if (user.state === "waiting_test_code") {
    await handleTestCode(env, user, text);
    return;
  }

  // Javoblar kutilmoqda
  if (user.state && user.state.startsWith("waiting_answers:")) {
    const testId = parseInt(user.state.split(":")[1], 10);
    await handleAnswerSubmission(env, user, testId, text);
    return;
  }

  // Asosiy menyu tugmalari
  const handled = await handleMainMenuText(env, user, text);
  if (handled) return;

  await sendMessage(env, chatId, "Iltimos, menyudagi tugmalardan foydalaning 👇", studentMainMenu());
}

// ================= CALLBACK QUERY =================
async function handleCallbackQuery(cb, env) {
  const chatId = cb.from.id;
  const data = cb.data;
  const user = await ensureUser(env, chatId);

  const { answerCallbackQuery } = await import("./telegram.js");
  await answerCallbackQuery(env, cb.id);

  if (data.startsWith("reg:")) {
    if (user.state && user.state.startsWith("profile_edit_")) {
      await handleProfileEditCallback(env, user, data);
      return;
    }
    await handleRegistrationCallback(env, user, data, cb);
    return;
  }

  if (data === "check_sub") {
    await handleCheckSubCallback(env, user);
    return;
  }

  if (data.startsWith("profile:")) {
    await handleProfileCallback(env, user, data);
    return;
  }

  if (data.startsWith("admin:") || data.startsWith("chan:") || data.startsWith("addtest:")) {
    const role = await isAdmin(env, chatId);
    if (!role) return;
    await handleAdminCallback(env, user, data, role);
    return;
  }
}

// ================= SCHEDULED (har daqiqada) =================
async function runScheduledTasks(env) {
  try {
    // 1) Muddati tugagan testlarni yopish
    await env.DB.prepare(
      "UPDATE tests SET is_closed = 1 WHERE is_closed = 0 AND datetime('now') > datetime(end_time)"
    ).run();

    // 2) Tugashiga 5 daqiqa qolgan testlar bo'yicha hali javob yubormagan foydalanuvchilarga eslatma
    const { results: soonTests } = await env.DB.prepare(
      `SELECT * FROM tests WHERE is_closed = 0
       AND datetime(end_time) BETWEEN datetime('now') AND datetime('now', '+5 minutes')`
    ).all();

    for (const test of soonTests || []) {
      const { results: waitingUsers } = await env.DB.prepare(
        `SELECT telegram_id, state, state_data FROM users WHERE state = ?`
      )
        .bind(`waiting_answers:${test.id}`)
        .all();

      for (const u of waitingUsers || []) {
        const already = await env.DB.prepare(
          "SELECT id FROM submissions WHERE test_id = ? AND telegram_id = ?"
        )
          .bind(test.id, u.telegram_id)
          .first();
        if (already) continue;

        let sd = {};
        try {
          sd = u.state_data ? JSON.parse(u.state_data) : {};
        } catch {
          sd = {};
        }
        if (sd.reminded) continue;

        const mins = minutesUntil(test.end_time);
        await sendMessage(
          env,
          u.telegram_id,
          `⏰ Diqqat! <b>${test.subject || test.code}</b> testi muddati tugashiga <b>${Math.max(
            mins,
            0
          )} daqiqa</b> qoldi. Javoblaringizni yuborishga ulgurib qoling!`
        );
        await setState(env, u.telegram_id, `waiting_answers:${test.id}`, { ...sd, reminded: true });
      }
    }
  } catch (err) {
    console.log("Scheduled xatosi:", err.stack || err.message);
  }
}

