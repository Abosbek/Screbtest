import {
  setState,
  getStateData,
  countUsers,
  countUsersToday,
  getSetting,
  setSetting,
  getChannels,
  getAllUserIds,
  isAdmin,
} from "./db.js";
import { sendMessage } from "./telegram.js";
import {
  adminMenuKeyboard,
  channelsMenuKeyboard,
  pointsModeKeyboard,
} from "./keyboards.js";
import { generateTestCode, parseUserDateTime, formatDateTime } from "./utils.js";

export async function showAdminMenu(env, chatId, role) {
  await sendMessage(env, chatId, "👑 <b>Admin panel</b>\n\nKerakli bo'limni tanlang:", adminMenuKeyboard(role));
}

export async function handleAdminCallback(env, user, data, role) {
  const chatId = user.telegram_id;

  if (data === "admin:back") {
    await showAdminMenu(env, chatId, role);
    return true;
  }

  if (data === "admin:stats") {
    const total = await countUsers(env);
    const today = await countUsersToday(env);
    await sendMessage(
      env,
      chatId,
      `📊 <b>Statistika</b>\n\n👥 Jami o'quvchilar: <b>${total}</b>\n🆕 Bugun qo'shilganlar: <b>${today}</b>`,
      adminMenuKeyboard(role)
    );
    return true;
  }

  if (data === "admin:addtest") {
    const baseChannels = await getChannels(env, "base");
    if (baseChannels.length === 0) {
      await sendMessage(
        env,
        chatId,
        "⚠️ Avval Baza kanalini belgilang (📢 Kanallarni boshqarish bo'limi orqali)."
      );
      return true;
    }
    await setState(env, chatId, "admin_awaiting_file");
    await sendMessage(
      env,
      chatId,
      `📤 Test faylini (PDF yoki rasm) <b>${baseChannels[0].title || baseChannels[0].chat_id}</b> Baza kanaliga yuboring.\n\nFaylni kanalga tashlaganingizdan so'ng, bot avtomatik kodni yaratadi.`
    );
    return true;
  }

  if (data === "admin:mytests") {
    const { results } = await env.DB.prepare(
      "SELECT * FROM tests WHERE created_by = ? ORDER BY created_at DESC LIMIT 15"
    )
      .bind(chatId)
      .all();
    if (!results || results.length === 0) {
      await sendMessage(env, chatId, "Sizda hali testlar yo'q.", adminMenuKeyboard(role));
      return true;
    }
    let msg = "📋 <b>Sizning testlaringiz:</b>\n\n";
    for (const t of results) {
      const subCount = await env.DB.prepare("SELECT COUNT(*) as c FROM submissions WHERE test_id = ?")
        .bind(t.id)
        .first();
      msg += `• ${t.subject || "Test"} — Kodi: <b>${t.code}</b>\n  ⏰ ${formatDateTime(t.start_time)} — ${formatDateTime(
        t.end_time
      )}\n  ✍️ Ishlaganlar: ${subCount.c}${t.is_closed ? " (yopilgan)" : ""}\n\n`;
    }
    await sendMessage(env, chatId, msg, adminMenuKeyboard(role));
    return true;
  }

  if (data === "admin:channels" && role === "owner") {
    await sendMessage(env, chatId, "📢 <b>Kanallarni boshqarish</b>", channelsMenuKeyboard());
    return true;
  }

  if (data.startsWith("chan:add:") && role === "owner") {
    const type = data.split(":")[2]; // required | base | results
    await setState(env, chatId, "admin_channel_add", { type });
    await sendMessage(
      env,
      chatId,
      `Kanal qo'shish uchun:\n1) Botni o'sha kanalga admin qiling.\n2) Kanaldan istalgan xabarni shu chatga forward qiling, YOKI kanal username'ini @ bilan yuboring (masalan: @mening_kanalim).`
    );
    return true;
  }

  if (data === "chan:list" && role === "owner") {
    const required = await getChannels(env, "required");
    const base = await getChannels(env, "base");
    const results = await getChannels(env, "results");
    let msg = "📋 <b>Kanallar:</b>\n\n<b>Majburiy kanallar:</b>\n";
    msg += required.length ? required.map((c) => `• ${c.title || c.chat_id}`).join("\n") : "yo'q";
    msg += "\n\n<b>Baza kanali:</b>\n";
    msg += base.length ? base.map((c) => `• ${c.title || c.chat_id}`).join("\n") : "belgilanmagan";
    msg += "\n\n<b>Natijalar kanali:</b>\n";
    msg += results.length ? results.map((c) => `• ${c.title || c.chat_id}`).join("\n") : "belgilanmagan";
    await sendMessage(env, chatId, msg, channelsMenuKeyboard());
    return true;
  }

  if (data === "admin:broadcast" && role === "owner") {
    await setState(env, chatId, "admin_broadcast_waiting");
    await sendMessage(env, chatId, "✉️ Barcha foydalanuvchilarga yuboriladigan xabar matnini kiriting:");
    return true;
  }

  if (data === "admin:maintenance" && role === "owner") {
    const current = await getSetting(env, "maintenance");
    const newVal = current === "1" ? "0" : "1";
    await setSetting(env, "maintenance", newVal);
    await sendMessage(
      env,
      chatId,
      newVal === "1"
        ? "🔴 Texnik rejim YOQILDI. Oddiy foydalanuvchilar botdan foydalana olmaydi."
        : "🟢 Texnik rejim O'CHIRILDI. Bot barchaga ishlayapti.",
      adminMenuKeyboard(role)
    );
    return true;
  }

  if (data === "admin:teachers" && role === "owner") {
    const { results } = await env.DB.prepare("SELECT * FROM admins WHERE role = 'teacher'").all();
    let msg = "👨‍🏫 <b>Sub-adminlar (o'qituvchilar)</b>\n\n";
    msg += results && results.length ? results.map((r) => `• ${r.name || r.telegram_id} (ID: ${r.telegram_id})`).join("\n") : "Hozircha yo'q";
    msg += "\n\nYangi qo'shish uchun Telegram ID raqamini yuboring:";
    await setState(env, chatId, "admin_teacher_add");
    await sendMessage(env, chatId, msg);
    return true;
  }

  if (data.startsWith("addtest:points:")) {
    const mode = data.split(":")[2];
    const stateData = getStateData(user);
    if (mode === "equal") {
      await setState(env, chatId, "admin_test_points_equal", stateData);
      await sendMessage(env, chatId, "Har bir savol uchun ballni kiriting (masalan: 1):");
    } else {
      await setState(env, chatId, "admin_test_points_custom", stateData);
      await sendMessage(
        env,
        chatId,
        "Har bir savol uchun ballarni vergul bilan kiriting (masalan: 1,1,2,1,3,...). Savollar soni javob kaliti bilan bir xil bo'lishi kerak."
      );
    }
    return true;
  }

  return false;
}

// Baza kanaliga fayl kelganda chaqiriladi (index.js dagi channel_post handleri orqali)
export async function handleBaseChannelFile(env, chatId, waitingAdminId, fileId, fileType) {
  const code = await generateTestCode(env);
  const res = await env.DB.prepare(
    `INSERT INTO tests (code, file_id, file_type, created_by, start_time, end_time, answer_key, points, is_closed)
     VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), '', '[]', 1)`
  )
    .bind(code, fileId, fileType, waitingAdminId)
    .run();
  const testId = res.meta.last_row_id;

  await setState(env, waitingAdminId, "admin_test_subject", { testId });
  await sendMessage(
    env,
    waitingAdminId,
    `✅ Fayl qabul qilindi. Test kodi: <b>${code}</b>\n\nEndi test nomini (fan nomini) kiriting (masalan: "Matematika 5-sinf"):`
  );
}

// Matnli qadamlar: subject -> start -> end -> answer_key -> points
export async function handleAddTestText(env, user, text) {
  const chatId = user.telegram_id;
  const data = getStateData(user);
  const t = text.trim();

  if (user.state === "admin_test_subject") {
    await env.DB.prepare("UPDATE tests SET subject = ? WHERE id = ?").bind(t, data.testId).run();
    await setState(env, chatId, "admin_test_start", data);
    await sendMessage(env, chatId, "⏰ Boshlanish vaqtini kiriting (format: KK.OO.YYYY SS:DD, masalan 10.08.2026 14:00):");
    return true;
  }

  if (user.state === "admin_test_start") {
    const iso = parseUserDateTime(t);
    if (!iso) {
      await sendMessage(env, chatId, "❗️ Format noto'g'ri. Masalan: 10.08.2026 14:00");
      return true;
    }
    await env.DB.prepare("UPDATE tests SET start_time = ? WHERE id = ?").bind(iso, data.testId).run();
    await setState(env, chatId, "admin_test_end", data);
    await sendMessage(env, chatId, "⏰ Tugash vaqtini kiriting (format: KK.OO.YYYY SS:DD, masalan 15.08.2026 18:00):");
    return true;
  }

  if (user.state === "admin_test_end") {
    const iso = parseUserDateTime(t);
    if (!iso) {
      await sendMessage(env, chatId, "❗️ Format noto'g'ri. Masalan: 15.08.2026 18:00");
      return true;
    }
    await env.DB.prepare("UPDATE tests SET end_time = ? WHERE id = ?").bind(iso, data.testId).run();
    await setState(env, chatId, "admin_test_key", data);
    await sendMessage(env, chatId, "🔑 To'g'ri javoblar kalitini kiriting (masalan: ABCDABCD...):");
    return true;
  }

  if (user.state === "admin_test_key") {
    const key = t.replace(/[^a-zA-Z]/g, "").toUpperCase();
    if (key.length === 0) {
      await sendMessage(env, chatId, "❗️ Iltimos, faqat harflardan iborat kalit kiriting.");
      return true;
    }
    await env.DB.prepare("UPDATE tests SET answer_key = ? WHERE id = ?").bind(key, data.testId).run();
    await setState(env, chatId, "admin_test_points_mode", { ...data, keyLen: key.length });
    await sendMessage(env, chatId, `Ballarni qanday belgilaymiz? (${key.length} ta savol)`, pointsModeKeyboard());
    return true;
  }

  if (user.state === "admin_test_points_equal") {
    const val = parseFloat(t.replace(",", "."));
    if (isNaN(val) || val <= 0) {
      await sendMessage(env, chatId, "❗️ Iltimos, musbat son kiriting (masalan: 1):");
      return true;
    }
    const test = await env.DB.prepare("SELECT answer_key FROM tests WHERE id = ?").bind(data.testId).first();
    const points = new Array(test.answer_key.length).fill(val);
    await finalizeTest(env, chatId, data.testId, points);
    return true;
  }

  if (user.state === "admin_test_points_custom") {
    const test = await env.DB.prepare("SELECT answer_key FROM tests WHERE id = ?").bind(data.testId).first();
    const points = t
      .split(",")
      .map((x) => parseFloat(x.trim()))
      .filter((x) => !isNaN(x));
    if (points.length !== test.answer_key.length) {
      await sendMessage(
        env,
        chatId,
        `❗️ Ballar soni (${points.length}) savollar soniga (${test.answer_key.length}) mos kelmadi. Qaytadan kiriting:`
      );
      return true;
    }
    await finalizeTest(env, chatId, data.testId, points);
    return true;
  }

  if (user.state === "admin_broadcast_waiting") {
    await setState(env, chatId, null);
    await sendMessage(env, chatId, "⏳ Xabar yuborilmoqda...");
    const ids = await getAllUserIds(env);
    let sent = 0;
    const batchSize = 25;
    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, i + batchSize);
      await Promise.allSettled(batch.map((id) => sendMessage(env, id, t)));
      sent += batch.length;
    }
    await sendMessage(env, chatId, `✅ Xabar ${sent} ta foydalanuvchiga yuborildi.`);
    return true;
  }

  if (user.state === "admin_channel_add") {
    // matn orqali @username kiritilgan bo'lishi mumkin (forward alohida index.js da ushlanadi)
    if (t.startsWith("@")) {
      await env.DB.prepare("INSERT INTO channels (chat_id, title, type, added_by) VALUES (?, ?, ?, ?)")
        .bind(t, t, data.type, chatId)
        .run();
      await setState(env, chatId, null);
      await sendMessage(env, chatId, `✅ Kanal qo'shildi: ${t}`, channelsMenuKeyboard());
      return true;
    }
  }

  if (user.state === "admin_teacher_add") {
    const id = parseInt(t.replace(/\D/g, ""), 10);
    if (!id) {
      await sendMessage(env, chatId, "❗️ Iltimos, to'g'ri Telegram ID raqamini yuboring:");
      return true;
    }
    await env.DB.prepare(
      "INSERT INTO admins (telegram_id, role, added_by) VALUES (?, 'teacher', ?) ON CONFLICT(telegram_id) DO NOTHING"
    )
      .bind(id, chatId)
      .run();
    await setState(env, chatId, null);
    await sendMessage(env, chatId, `✅ ID ${id} sub-admin (o'qituvchi) sifatida qo'shildi.`);
    return true;
  }

  return false;
}

async function finalizeTest(env, chatId, testId, points) {
  await env.DB.prepare("UPDATE tests SET points = ?, is_closed = 0 WHERE id = ?")
    .bind(JSON.stringify(points), testId)
    .run();
  const test = await env.DB.prepare("SELECT * FROM tests WHERE id = ?").bind(testId).first();
  await setState(env, chatId, null);
  await sendMessage(
    env,
    chatId,
    `🎉 <b>Test faollashtirildi!</b>\n\n📘 ${test.subject}\n🔑 Kod: <b>${test.code}</b>\n⏰ ${formatDateTime(
      test.start_time
    )} — ${formatDateTime(test.end_time)}\n📊 Savollar: ${test.answer_key.length}`,
    adminMenuKeyboard("owner")
  );
}

// Forward orqali kanal qo'shish (index.js channel forward handling uchun)
export async function handleChannelForward(env, chatId, forwardChat, type) {
  await env.DB.prepare("INSERT INTO channels (chat_id, title, type, added_by) VALUES (?, ?, ?, ?)")
    .bind(String(forwardChat.id), forwardChat.title || forwardChat.username || String(forwardChat.id), type, chatId)
    .run();
  await setState(env, chatId, null);
  await sendMessage(
    env,
    chatId,
    `✅ Kanal qo'shildi: ${forwardChat.title || forwardChat.username}`,
    channelsMenuKeyboard()
  );
}
