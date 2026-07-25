// ============================================================
// Telegram Bot API bilan ishlash uchun yordamchi funksiyalar
// ============================================================

function apiUrl(env, method) {
  return `https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`;
}

async function call(env, method, payload) {
  const res = await fetch(apiUrl(env, method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!data.ok) {
    console.log(`Telegram API xatosi [${method}]:`, JSON.stringify(data));
  }
  return data;
}

export async function sendMessage(env, chatId, text, replyMarkup = null, extra = {}) {
  const payload = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    ...extra,
  };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  return call(env, "sendMessage", payload);
}

export async function editMessageText(env, chatId, messageId, text, replyMarkup = null) {
  const payload = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
  };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  return call(env, "editMessageText", payload);
}

export async function answerCallbackQuery(env, callbackQueryId, text = null, showAlert = false) {
  const payload = { callback_query_id: callbackQueryId };
  if (text) {
    payload.text = text;
    payload.show_alert = showAlert;
  }
  return call(env, "answerCallbackQuery", payload);
}

export async function sendDocument(env, chatId, fileId, caption = "", replyMarkup = null) {
  const payload = { chat_id: chatId, document: fileId, caption, parse_mode: "HTML" };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  return call(env, "sendDocument", payload);
}

export async function sendPhoto(env, chatId, fileId, caption = "", replyMarkup = null) {
  const payload = { chat_id: chatId, photo: fileId, caption, parse_mode: "HTML" };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  return call(env, "sendPhoto", payload);
}

export async function getChatMember(env, chatId, userId) {
  return call(env, "getChatMember", { chat_id: chatId, user_id: userId });
}

export async function setWebhook(env, url) {
  return call(env, "setWebhook", {
    url,
    secret_token: env.WEBHOOK_SECRET,
    allowed_updates: ["message", "callback_query", "channel_post"],
  });
}
