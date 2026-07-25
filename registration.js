import { setState, updateUserFields, getStateData } from "./db.js";
import { sendMessage } from "./telegram.js";
import {
  regionKeyboard,
  levelKeyboard,
  gradeKeyboard,
  courseKeyboard,
  studentMainMenu,
  regionNameByCode,
} from "./keyboards.js";

// Matnli qadamlarni boshqaradi: reg_name -> reg_lastname -> reg_fathername -> (tugmalar)
export async function handleRegistrationText(env, user, text) {
  const chatId = user.telegram_id;
  const t = text.trim();

  if (user.state === "reg_name") {
    if (t.length < 2) {
      await sendMessage(env, chatId, "❗️ Ismingizni to'liq kiriting:");
      return;
    }
    await updateUserFields(env, chatId, { first_name: t });
    await setState(env, chatId, "reg_lastname");
    await sendMessage(env, chatId, "Familiyangizni kiriting:");
    return;
  }

  if (user.state === "reg_lastname") {
    if (t.length < 2) {
      await sendMessage(env, chatId, "❗️ Familiyangizni to'liq kiriting:");
      return;
    }
    await updateUserFields(env, chatId, { last_name: t });
    await setState(env, chatId, "reg_fathername");
    await sendMessage(env, chatId, "Otasining ismini kiriting:");
    return;
  }

  if (user.state === "reg_fathername") {
    if (t.length < 2) {
      await sendMessage(env, chatId, "❗️ Otasining ismini to'liq kiriting:");
      return;
    }
    await updateUserFields(env, chatId, { father_name: t });
    await setState(env, chatId, "reg_region");
    await sendMessage(env, chatId, "🌍 Hududingizni tanlang:", regionKeyboard());
    return;
  }
}

// reg:region:<code>, reg:level:<maktab|talaba>, reg:grade:<n>
export async function handleRegistrationCallback(env, user, data, cb) {
  const chatId = user.telegram_id;

  if (data.startsWith("reg:region:")) {
    const code = data.split(":")[2];
    await updateUserFields(env, chatId, { region: regionNameByCode(code) });
    await setState(env, chatId, "reg_level");
    await sendMessage(env, chatId, "🎓 Ta'lim darajangizni tanlang:", levelKeyboard());
    return true;
  }

  if (data.startsWith("reg:level:")) {
    const level = data.split(":")[2];
    await updateUserFields(env, chatId, { level });
    await setState(env, chatId, "reg_grade");
    if (level === "maktab") {
      await sendMessage(env, chatId, "📚 Necha sinfda o'qiysiz?", gradeKeyboard());
    } else {
      await sendMessage(env, chatId, "📚 Necha kursda o'qiysiz?", courseKeyboard());
    }
    return true;
  }

  if (data.startsWith("reg:grade:")) {
    const grade = data.split(":")[2];
    await updateUserFields(env, chatId, { grade, registered: 1, state: null, state_data: null });
    await sendMessage(
      env,
      chatId,
      "✅ Ro'yxatdan muvaffaqiyatli o'tdingiz!\n\nEndi quyidagi menyudan foydalanishingiz mumkin 👇",
      studentMainMenu()
    );
    return true;
  }

  return false;
}
