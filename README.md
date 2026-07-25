# 🇺🇿 Test Bot — Cloudflare Workers + D1

O'zbek tilidagi test topshirish Telegram boti. Arxitektura: Cloudflare Workers (server), Cloudflare D1 (SQL baza), Telegram webhook orqali ishlaydi.

## 📁 Loyiha tuzilishi

```
uzbot/
├── wrangler.toml          # Cloudflare sozlamalari
├── schema.sql              # D1 bazasi jadval tuzilishi
└── src/
    ├── index.js            # Asosiy router (webhook + cron)
    ├── db.js               # Baza bilan ishlash funksiyalari
    ├── telegram.js         # Telegram Bot API wrapper
    ├── keyboards.js        # Klaviaturalar, viloyatlar ro'yxati
    ├── utils.js            # Yordamchi funksiyalar (baholash, vaqt, obuna tekshirish)
    ├── registration.js     # Ro'yxatdan o'tish (ism, familiya, viloyat, sinf)
    ├── studentMenu.js      # O'quvchi menyusi: test topshirish, natija, profil
    └── adminPanel.js       # Admin panel: test qo'shish, kanallar, broadcast
```

## 🚀 O'rnatish qadamlari

### 1. Talablar
- [Node.js](https://nodejs.org) (18+ versiya)
- Cloudflare akkaunt
- Telegram bot tokeni ([@BotFather](https://t.me/BotFather) orqali oling)
- Sizning shaxsiy Telegram ID raqamingiz ([@userinfobot](https://t.me/userinfobot) orqali bilib oling)

### 2. Wrangler CLI o'rnatish va login qilish

```bash
npm install -g wrangler
wrangler login
```

### 3. D1 bazasini yaratish

```bash
cd uzbot
wrangler d1 create uzbek-test-bot-db
```

Buyruq natijasida chiqqan `database_id` qiymatini `wrangler.toml` fayliga qo'ying:

```toml
[[d1_databases]]
binding = "DB"
database_name = "uzbek-test-bot-db"
database_id = "BU YERGA_QO'YING"
```

### 4. Jadvallarni yaratish (schema)

```bash
wrangler d1 execute uzbek-test-bot-db --remote --file=./schema.sql
```

### 5. `wrangler.toml` dagi o'zgaruvchilarni to'ldiring

```toml
[vars]
BOT_TOKEN = "123456:ABC-DEF..."      # BotFather'dan olingan token
OWNER_ID = "123456789"                # Sizning Telegram ID raqamingiz (bosh admin)
WEBHOOK_SECRET = "istalgan-tasodifiy-satr"
```

### 6. Deploy qilish

```bash
wrangler deploy
```

Deploy tugagach, sizga quyidagicha manzil beriladi: `https://uzbek-test-bot.<username>.workers.dev`

### 7. Webhookni faollashtirish

Brauzerda quyidagi manzilni oching (bir marta kifoya):

```
https://uzbek-test-bot.<username>.workers.dev/setup
```

`"ok": true` degan javob chiqsa — bot ishga tushdi! Botga `/start` yozib tekshiring.

## ⚙️ Botni sozlash (birinchi ishga tushirishda)

1. Botga o'zingiz `/admin` buyrug'ini yuboring (siz `OWNER_ID` bo'lganingiz uchun admin panel ochiladi).
2. **📢 Kanallarni boshqarish** bo'limiga kiring:
   - **Baza kanalini belgilang** — bu yashirin kanal bo'lib, testlar shu yerga yuklanadi. Botni o'sha kanalga **admin** qiling, so'ng botga kanaldan bir xabarni forward qiling (yoki `@kanal_username` yuboring).
   - **Majburiy kanal(lar)ni qo'shing** — o'quvchilar test olishdan oldin a'zo bo'lishi shart bo'lgan kanallar (bot shu yerga ham admin bo'lishi kerak).
   - **Natijalar kanalini belgilang** — bu ochiq kanal bo'lib, har bir natija shu yerga avtomatik chiqadi.
3. **➕ Yangi test qo'shish** orqali birinchi testingizni yarating:
   - Bot sizdan Baza kanaliga fayl (PDF/rasm) tashlashni so'raydi.
   - Fayl kelgach, bot avtomatik 4 xonali kod beradi va sizdan fan nomi, boshlanish/tugash vaqti, javoblar kaliti va ballarni so'raydi.
4. Tayyor! Endi o'quvchilar botga kirib ro'yxatdan o'tishi va test kodini kiritishi mumkin.

## 👨‍🏫 Sub-adminlar (o'qituvchilar)

Admin panel → **👨‍🏫 Sub-adminlar** orqali boshqa o'qituvchining Telegram ID raqamini kiriting. Ular ham test yarata oladi, lekin faqat o'zlari yaratgan testlarning natijalarini (**📋 Mening testlarim**) ko'radi. Kanallarni boshqarish, broadcast va texnik rejim faqat bosh admin (`OWNER_ID`) uchun ochiq.

## 🔧 Texnik eslatmalar

- **Vaqt formati**: admin test yaratganda vaqtni `KK.OO.YYYY SS:DD` formatida kiritadi (masalan `10.08.2026 14:00`). Barcha vaqtlar UTC vaqtida saqlanadi.
- **Anti-cheat**: har bir (test, foydalanuvchi) juftligi uchun `submissions` jadvalida `UNIQUE` cheklov bor — ikkinchi marta javob yuborib bo'lmaydi.
- **Eslatma va avtomatik yopish**: `wrangler.toml` dagi `[triggers] crons` sozlamasi tufayli bot har daqiqada ishga tushib, muddati tugagan testlarni yopadi va 5 daqiqa qolganlarga ogohlantirish yuboradi.
- **Texnik rejim**: yoqilganda oddiy foydalanuvchilarga bot javob bermaydi, lekin `is_whitelisted = 1` bo'lgan foydalanuvchilar va adminlar bemalol foydalanaveradi. Whitelist'ga qo'shish uchun hozircha to'g'ridan-to'g'ri bazadan foydalaning:
  ```bash
  wrangler d1 execute uzbek-test-bot-db --remote --command="UPDATE users SET is_whitelisted=1 WHERE telegram_id=123456789"
  ```

## 📌 Muhim eslatmalar

- Bot Baza kanaliga va barcha majburiy/natijalar kanallariga **admin** sifatida qo'shilishi shart, aks holda fayl yuborish va a'zolikni tekshirish ishlamaydi.
- `file_id` faqat shu botga tegishli bo'lgani uchun, boshqa botlar bilan almashtirib bo'lmaydi — bu xavfsizlik uchun yaxshi.
- Loyihani o'zgartirgandan so'ng qayta deploy qilish uchun: `wrangler deploy`.
