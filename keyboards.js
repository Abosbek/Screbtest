// ============================================================
// Klaviaturalar va O'zbekiston viloyatlari ro'yxati
// ============================================================

export const REGIONS = [
  { code: "AND", name: "Andijon" },
  { code: "BUX", name: "Buxoro" },
  { code: "FAR", name: "Farg'ona" },
  { code: "JIZ", name: "Jizzax" },
  { code: "XOR", name: "Xorazm" },
  { code: "NAM", name: "Namangan" },
  { code: "NAV", name: "Navoiy" },
  { code: "QAS", name: "Qashqadaryo" },
  { code: "SAM", name: "Samarqand" },
  { code: "SIR", name: "Sirdaryo" },
  { code: "SUR", name: "Surxondaryo" },
  { code: "TVL", name: "Toshkent viloyati" },
  { code: "TSH", name: "Toshkent shahri" },
  { code: "QOR", name: "Qoraqalpog'iston Respublikasi" },
];

export function regionNameByCode(code) {
  const r = REGIONS.find((x) => x.code === code);
  return r ? r.name : code;
}

export function regionKeyboard() {
  const rows = [];
  for (let i = 0; i < REGIONS.length; i += 2) {
    const row = [{ text: REGIONS[i].name, callback_data: `reg:region:${REGIONS[i].code}` }];
    if (REGIONS[i + 1]) {
      row.push({ text: REGIONS[i + 1].name, callback_data: `reg:region:${REGIONS[i + 1].code}` });
    }
    rows.push(row);
  }
  return { inline_keyboard: rows };
}

export function levelKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "🏫 Maktab o'quvchisi", callback_data: "reg:level:maktab" },
        { text: "🎓 Talaba", callback_data: "reg:level:talaba" },
      ],
    ],
  };
}

export function gradeKeyboard() {
  const rows = [];
  for (let i = 1; i <= 11; i += 4) {
    const row = [];
    for (let g = i; g < i + 4 && g <= 11; g++) {
      row.push({ text: `${g}-sinf`, callback_data: `reg:grade:${g}` });
    }
    rows.push(row);
  }
  return { inline_keyboard: rows };
}

export function courseKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "1-kurs", callback_data: "reg:grade:1-kurs" },
        { text: "2-kurs", callback_data: "reg:grade:2-kurs" },
      ],
      [
        { text: "3-kurs", callback_data: "reg:grade:3-kurs" },
        { text: "4-kurs", callback_data: "reg:grade:4-kurs" },
      ],
    ],
  };
}

export function studentMainMenu() {
  return {
    keyboard: [
      [{ text: "📝 Test tekshirish" }],
      [{ text: "📋 Faol testlar" }, { text: "⚙️ Profilni tahrirlash" }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

export function profileEditKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "✏️ Ismni o'zgartirish", callback_data: "profile:name" }],
      [{ text: "✏️ Familiyani o'zgartirish", callback_data: "profile:lastname" }],
      [{ text: "🌍 Viloyatni o'zgartirish", callback_data: "profile:region" }],
      [{ text: "🎓 Sinf/kursni o'zgartirish", callback_data: "profile:grade" }],
    ],
  };
}

export function adminMenuKeyboard(role) {
  const rows = [
    [{ text: "📊 Statistika", callback_data: "admin:stats" }],
    [{ text: "➕ Yangi test qo'shish", callback_data: "admin:addtest" }],
    [{ text: "📋 Mening testlarim", callback_data: "admin:mytests" }],
  ];
  if (role === "owner") {
    rows.push([{ text: "📢 Kanallarni boshqarish", callback_data: "admin:channels" }]);
    rows.push([{ text: "✉️ Xabar tarqatish", callback_data: "admin:broadcast" }]);
    rows.push([{ text: "👨‍🏫 Sub-adminlar", callback_data: "admin:teachers" }]);
    rows.push([{ text: "🔴/🟢 Texnik rejim", callback_data: "admin:maintenance" }]);
  }
  return { inline_keyboard: rows };
}

export function channelsMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "➕ Majburiy kanal qo'shish", callback_data: "chan:add:required" }],
      [{ text: "🗄 Baza kanalini belgilash", callback_data: "chan:add:base" }],
      [{ text: "🏆 Natijalar kanalini belgilash", callback_data: "chan:add:results" }],
      [{ text: "📋 Kanallar ro'yxati", callback_data: "chan:list" }],
      [{ text: "⬅️ Orqaga", callback_data: "admin:back" }],
    ],
  };
}

export function pointsModeKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "Barchasiga bir xil ball", callback_data: "addtest:points:equal" }],
      [{ text: "Har biriga alohida ball", callback_data: "addtest:points:custom" }],
    ],
  };
}
