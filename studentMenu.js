import {
  setState,
  getStateData,
  updateUserFields,
  getTestByCode,
  getSubmission,
  getActiveTests,
  getRanking,
  getChannels,
} from "./db.js";
import { sendMessage, sendDocument, sendPhoto } from "./telegram.js";
import {
  studentMainMenu,
  profileEditKeyboard,
  regionKeyboard,
  levelKeyboard,
  gradeKeyboard,
  courseKeyboard,
} from "./keyboards.js";
import { checkSubscription, subscriptionKeyboard, formatDateTime, minutesUntil, scoreAnswers } from "./utils.js";

export async function handleMainMenuText(env, user, text) {
  const chatId = user.telegram_id;
  const t = text.trim();

  if (t === "📝 Test tekshirish") {
    await setState(env, chatId, "waiting_test_code");
    await sendMessage(env, chatId, "🔑 Test kodini yuboring (masalan: 1234):");
    return true;
  }

  if (t === "📋 Faol testlar") {
    await showActiveTests(env, chatId);
    return true;
  }

  if (t === "⚙️ Profilni tahrirlash") {
    await setState(env, chatId, "profile_menu");
    await sendMessage(env, chatId, "Nimani o'zgartiramiz?", profileEditKeyboard());
    return true;
  }

  return false;
}

async function showActiveTests(env, chatId) {
  const tests = await getActiveTests(env);
  if (tests.length === 0) {
    await sendMessage(env, chatId, "Hozircha faol testlar yo'q.");
    return;
  }
  let msg = "📋 <b>Faol testlar:</b>\n\n";
  tests.forEach((t, i) => {
    msg += `${i + 1}. ${t.subject || "Test"} (Kodi: <b>${t.code}</b>)\n   ⏰ Tugash: ${formatDateTime(
      t.end_time
    )}\n\n`;
  });
  await sendMessage(env, chatId, msg);
}

// Test kodi kiritilganda ishlaydi
export async function handleTestCode(env, user, code) {
  const chatId = user.telegram_id;
  const cleanCode = code.trim();
  const test = await getTestByCode(env, cleanCode);

  if (!test) {
    await sendMessage(env, chatId, "❌ Bunday kodli test topilmadi. Qaytadan urinib ko'ring:");
    return;
  }

  const now = new Date();
  const start = new Date(test.start_time.includes("T") ? test.start_time : test.start_time.replace(" ", "T") + "Z");
  const end = new Date(test.end_time.includes("T") ? test.end_time : test.end_time.replace(" ", "T") + "Z");

  if (test.is_closed || now > end) {
    await sendMessage(env, chatId, "⛔️ Bu testning muddati allaqachon tugagan.");
    await setState(env, chatId, null);
    return;
  }
  if (now < start) {
    await sendMessage(env, chatId, `⏳ Bu test hali boshlanmagan. Boshlanish vaqti: ${formatDateTime(test.start_time)}`);
    return;
  }

  const existing = await getSubmission(env, test.id, chatId);
  if (existing) {
    await sendMessage(env, chatId, "⚠️ Siz bu testni allaqachon ishlagansiz. Qayta ishlash imkoni yo'q.");
    await setState(env, chatId, null);
    return;
  }

  const sub = await checkSubscription(env, chatId);
  if (!sub.ok) {
    await sendMessage(
      env,
      chatId,
      "📢 Testni olishdan oldin quyidagi kanallarga a'zo bo'ling:",
      subscriptionKeyboard(sub.missing)
    );
    await setState(env, chatId, "waiting_test_code", { pendingCode: cleanCode });
    return;
  }

  // Faylni yuborish
  const minsLeft = Math.max(0, Math.round((end - now) / 60000));
  const caption = `📄 Sizga test taqdim etildi.\n⏰ Muddat tugashiga <b>${formatMinutes(
    minsLeft
  )}</b> qoldi.\n\n✏️ Javoblaringizni bitta xabar qilib yuboring (masalan: <code>abcdabcd...</code>)`;

  if (test.file_type === "photo") {
    await sendPhoto(env, chatId, test.file_id, caption);
  } else {
    await sendDocument(env, chatId, test.file_id, caption);
  }

  await setState(env, chatId, `waiting_answers:${test.id}`);
}

function formatMinutes(mins) {
  if (mins < 60) return `${mins} daqiqa`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h} soat ${m} daqiqa`;
}

// A'zolik "✅ A'zo bo'ldim" tugmasi bosilganda
export async function handleCheckSubCallback(env, user) {
  const chatId = user.telegram_id;
  const sub = await checkSubscription(env, chatId);
  if (!sub.ok) {
    return { ok: false };
  }
  const data = getStateData(user);
  if (data.pendingCode) {
    await handleTestCode(env, user, data.pendingCode);
  } else {
    await sendMessage(env, chatId, "✅ Rahmat! Endi test kodini qayta yuboring.");
    await setState(env, chatId, "waiting_test_code");
  }
  return { ok: true };
}

// Javoblarni qabul qilish va baholash
export async function handleAnswerSubmission(env, user, testId, answerText) {
  const chatId = user.telegram_id;
  const test = await env.DB.prepare("SELECT * FROM tests WHERE id = ?").bind(testId).first();
  if (!test) {
    await setState(env, chatId, null);
    return;
  }

  const now = new Date();
  const end = new Date(test.end_time.includes("T") ? test.end_time : test.end_time.replace(" ", "T") + "Z");
  if (test.is_closed || now > end) {
    await sendMessage(env, chatId, "⛔️ Afsuski, testning muddati tugagan. Javob qabul qilinmadi.");
    await setState(env, chatId, null);
    return;
  }

  const existing = await getSubmission(env, testId, chatId);
  if (existing) {
    await sendMessage(env, chatId, "⚠️ Siz allaqachon javob yubordingiz.");
    await setState(env, chatId, null);
    return;
  }

  const cleaned = answerText.replace(/[^a-zA-Z]/g, "");
  if (cleaned.length === 0) {
    await sendMessage(env, chatId, "❗️ Iltimos, javoblarni harflar bilan yuboring (masalan: abcd...).");
    return;
  }

  const points = JSON.parse(test.points || "[]");
  const result = scoreAnswers(cleaned, test.answer_key, points);

  await env.DB.prepare(
    `INSERT INTO submissions (test_id, telegram_id, answers, correct_count, total_count, score, max_score)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(testId, chatId, cleaned.toUpperCase(), result.correctCount, result.total, result.score, result.maxScore)
    .run();

  await setState(env, chatId, null);

  const ranking = await getRanking(env, testId);
  const place = ranking.findIndex((r) => r.telegram_id === chatId) + 1;
  const percent = result.maxScore > 0 ? Math.round((result.score / result.maxScore) * 100) : 0;

  const wrongList = result.wrongQuestions.length > 0 ? result.wrongQuestions.join(", ") : "yo'q 🎉";

  const resultMsg =
    `✅ <b>Natijangiz tayyor!</b>\n\n` +
    `📊 Ball: <b>${result.score} / ${result.maxScore}</b> (${percent}%)\n` +
    `✔️ To'g'ri javoblar: ${result.correctCount} / ${result.total}\n` +
    `❌ Xato savollar: ${wrongList}\n` +
    `🏆 Reyting: <b>${place}-o'rin</b> (${ranking.length} qatnashuvchidan)`;

  await sendMessage(env, chatId, resultMsg, studentMainMenu());

  // Natijalar kanaliga va admin(ownere)ga jo'natish
  const resultsChannels = await getChannels(env, "results");
  const channelMsg =
    `🆕 <b>Yangi natija</b>\n` +
    `👤 ${user.first_name} ${user.last_name}\n` +
    `🌍 ${user.region} | ${user.grade}\n` +
    `📘 Test: ${test.subject || test.code} (${test.code})\n` +
    `📊 Ball: ${result.score}/${result.maxScore} (${percent}%)\n` +
    `🏆 O'rin: ${place}\n` +
    `🕒 ${formatDateTime(new Date().toISOString())}`;

  for (const ch of resultsChannels) {
    await sendMessage(env, ch.chat_id, channelMsg);
  }
  await sendMessage(env, env.OWNER_ID, channelMsg);
}

// ---- Profil tahrirlash ----
export async function handleProfileCallback(env, user, data) {
  const chatId = user.telegram_id;
  if (data === "profile:name") {
    await setState(env, chatId, "profile_edit_name");
    await sendMessage(env, chatId, "Yangi ismingizni kiriting:");
    return true;
  }
  if (data === "profile:lastname") {
    await setState(env, chatId, "profile_edit_lastname");
    await sendMessage(env, chatId, "Yangi familiyangizni kiriting:");
    return true;
  }
  if (data === "profile:region") {
    await setState(env, chatId, "profile_edit_region");
    await sendMessage(env, chatId, "Yangi hududingizni tanlang:", regionKeyboard());
    return true;
  }
  if (data === "profile:grade") {
    await setState(env, chatId, "profile_edit_level");
    await sendMessage(env, chatId, "Ta'lim darajangizni tanlang:", levelKeyboard());
    return true;
  }
  return false;
}

export async function handleProfileEditText(env, user, text) {
  const chatId = user.telegram_id;
  const t = text.trim();
  if (user.state === "profile_edit_name") {
    await updateUserFields(env, chatId, { first_name: t, state: null, state_data: null });
    await sendMessage(env, chatId, "✅ Ism yangilandi.", studentMainMenu());
    return true;
  }
  if (user.state === "profile_edit_lastname") {
    await updateUserFields(env, chatId, { last_name: t, state: null, state_data: null });
    await sendMessage(env, chatId, "✅ Familiya yangilandi.", studentMainMenu());
    return true;
  }
  return false;
}

export async function handleProfileEditCallback(env, user, data) {
  const chatId = user.telegram_id;
  const { regionNameByCode } = await import("./keyboards.js");

  if (user.state === "profile_edit_region" && data.startsWith("reg:region:")) {
    const code = data.split(":")[2];
    await updateUserFields(env, chatId, { region: regionNameByCode(code), state: null, state_data: null });
    await sendMessage(env, chatId, "✅ Hudud yangilandi.", studentMainMenu());
    return true;
  }
  if (user.state === "profile_edit_level" && data.startsWith("reg:level:")) {
    const level = data.split(":")[2];
    await updateUserFields(env, chatId, { level });
    await setState(env, chatId, "profile_edit_grade");
    if (level === "maktab") {
      await sendMessage(env, chatId, "Sinfingizni tanlang:", gradeKeyboard());
    } else {
      await sendMessage(env, chatId, "Kursingizni tanlang:", courseKeyboard());
    }
    return true;
  }
  if (user.state === "profile_edit_grade" && data.startsWith("reg:grade:")) {
    const grade = data.split(":")[2];
    await updateUserFields(env, chatId, { grade, state: null, state_data: null });
    await sendMessage(env, chatId, "✅ Sinf/kurs yangilandi.", studentMainMenu());
    return true;
  }
  return false;
}
