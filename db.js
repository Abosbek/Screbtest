// ============================================================
// D1 bazasi bilan ishlash uchun yordamchi funksiyalar
// ============================================================

export async function getUser(env, telegramId) {
  const row = await env.DB.prepare("SELECT * FROM users WHERE telegram_id = ?")
    .bind(telegramId)
    .first();
  return row || null;
}

export async function ensureUser(env, telegramId) {
  let user = await getUser(env, telegramId);
  if (!user) {
    await env.DB.prepare(
      "INSERT INTO users (telegram_id, registered, state) VALUES (?, 0, 'reg_name')"
    )
      .bind(telegramId)
      .run();
    user = await getUser(env, telegramId);
  } else {
    await env.DB.prepare("UPDATE users SET last_seen = datetime('now') WHERE telegram_id = ?")
      .bind(telegramId)
      .run();
  }
  return user;
}

export async function setState(env, telegramId, state, stateData = null) {
  await env.DB.prepare("UPDATE users SET state = ?, state_data = ? WHERE telegram_id = ?")
    .bind(state, stateData ? JSON.stringify(stateData) : null, telegramId)
    .run();
}

export function getStateData(user) {
  try {
    return user.state_data ? JSON.parse(user.state_data) : {};
  } catch {
    return {};
  }
}

export async function updateUserFields(env, telegramId, fields) {
  const keys = Object.keys(fields);
  if (keys.length === 0) return;
  const setClause = keys.map((k) => `${k} = ?`).join(", ");
  const values = keys.map((k) => fields[k]);
  await env.DB.prepare(`UPDATE users SET ${setClause} WHERE telegram_id = ?`)
    .bind(...values, telegramId)
    .run();
}

export async function isAdmin(env, telegramId) {
  if (String(telegramId) === String(env.OWNER_ID)) return "owner";
  const row = await env.DB.prepare("SELECT role FROM admins WHERE telegram_id = ?")
    .bind(telegramId)
    .first();
  return row ? row.role : null;
}

export async function isWhitelisted(env, telegramId) {
  if (String(telegramId) === String(env.OWNER_ID)) return true;
  const row = await env.DB.prepare(
    "SELECT is_whitelisted FROM users WHERE telegram_id = ? AND is_whitelisted = 1"
  )
    .bind(telegramId)
    .first();
  return !!row;
}

export async function getSetting(env, key) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first();
  return row ? row.value : null;
}

export async function setSetting(env, key, value) {
  await env.DB.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  )
    .bind(key, value)
    .run();
}

export async function getChannels(env, type) {
  const { results } = await env.DB.prepare("SELECT * FROM channels WHERE type = ?")
    .bind(type)
    .all();
  return results || [];
}

export async function getTestByCode(env, code) {
  return env.DB.prepare("SELECT * FROM tests WHERE code = ?").bind(code).first();
}

export async function getActiveTests(env) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM tests WHERE is_closed = 0 AND datetime('now') <= datetime(end_time) ORDER BY start_time"
  ).all();
  return results || [];
}

export async function getSubmission(env, testId, telegramId) {
  return env.DB.prepare("SELECT * FROM submissions WHERE test_id = ? AND telegram_id = ?")
    .bind(testId, telegramId)
    .first();
}

export async function getRanking(env, testId) {
  const { results } = await env.DB.prepare(
    "SELECT s.*, u.first_name, u.last_name, u.region, u.grade FROM submissions s JOIN users u ON u.telegram_id = s.telegram_id WHERE s.test_id = ? ORDER BY s.score DESC, s.submitted_at ASC"
  )
    .bind(testId)
    .all();
  return results || [];
}

export async function countUsers(env) {
  const row = await env.DB.prepare("SELECT COUNT(*) as c FROM users WHERE registered = 1").first();
  return row ? row.c : 0;
}

export async function countUsersToday(env) {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) as c FROM users WHERE registered = 1 AND date(created_at) = date('now')"
  ).first();
  return row ? row.c : 0;
}

export async function getAllUserIds(env) {
  const { results } = await env.DB.prepare(
    "SELECT telegram_id FROM users WHERE registered = 1"
  ).all();
  return (results || []).map((r) => r.telegram_id);
}
