# 🛵 WimaKit — di makit na you phone

> Freetown's hyper-local mobile marketplace. Connect buyers with local vendors, deliver in hours, and pay via Orange Money, Afrimoney, MoneyMi, or cash.

---

## 📱 App Screenshots

| Home | Product | Cart | COD Bill | Profile + QR |
|------|---------|------|----------|--------------|
| Browse local sellers | Full details + reviews | 4 payment methods | Auto-generated bill | Shareable QR profile |

---

## 🏗 Architecture

```
wimakit/              ← Expo (React Native) — iOS, Android, Web
wimakit-backend/      ← Node.js + Express + MongoDB API
```

### Tech Stack
| Layer | Technology |
|-------|-----------|
| Mobile / Web | Expo SDK 53, React Native 0.76, Expo Router v4 |
| State | Zustand (global), React local state |
| Backend | Node.js 20, Express 4, Mongoose 8 |
| Database | MongoDB Atlas |
| Images | Cloudinary |
| Payments | Orange Money · Afrimoney · MoneyMi · COD |
| Deployment | Fly.io + Render (backend), EAS (mobile) |
| CI/CD | GitHub Actions |

---

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- MongoDB Atlas account (or local MongoDB)
- Expo CLI (`npm install -g expo-cli eas-cli`)

### 1. Clone & Install
```bash
git clone https://github.com/your-org/wimakit.git
cd wimakit

# Install mobile app deps
cd wimakit && npm install

# Install backend deps
cd ../wimakit-backend && npm install
```

### 2. Configure Environment
```bash
# Backend
cp wimakit-backend/.env.example wimakit-backend/.env
# Fill in MONGODB_URI, JWT_SECRET, JWT_REFRESH_SECRET at minimum

# Frontend — create wimakit/.env.local
echo "EXPO_PUBLIC_API_URL=http://localhost:5000" > wimakit/.env.local
```

### 3. Seed Database
```bash
cd wimakit-backend
npm run seed
# Creates: admin@wimakit.sl / AdminPass123!
#          aminata@wimakit.sl / Test1234!  (seller)
#          buyer@wimakit.sl  / Test1234!   (buyer)
```

### 4. Run Development Servers
```bash
# Terminal 1 — Backend
cd wimakit-backend && npm run dev
# API running at http://localhost:5000

# Terminal 2 — Mobile/Web
cd wimakit && npx expo start
# Press 'a' for Android, 'i' for iOS, 'w' for web
```

---

## 💳 Payment Integration

### Current Status

| Gateway | Status | Integration |
|---------|--------|-------------|
| 🟠 Orange Money | ⏳ Awaiting API keys | Stub ready — dial *144# instructions shown |
| 💚 Afrimoney | ⏳ Awaiting API keys | Stub ready — dial *222# instructions shown |
| 💙 MoneyMi | ⏳ Awaiting API keys | Stub ready — dial *454# instructions shown |
| 💵 Cash on Delivery | ✅ Live | Auto-generates printable + shareable bill |

### Activating a Gateway (when keys arrive)

**Orange Money:**
1. Get keys from https://developer.orange.com/apis/orange-money-webpay-sl
2. Add to backend `.env`:
   ```
   ORANGE_MERCHANT_ID=your_merchant_id
   ORANGE_API_KEY=your_api_key
   ORANGE_WEBHOOK_SECRET=your_webhook_secret
   ```
3. In `wimakit/constants/payments.ts`, set `available: true` for orange_money
4. Uncomment the live API block in `initiatePayment()` for orange_money
5. Register webhook URL in Orange Money dashboard:
   `https://wimakit-api.fly.dev/api/webhooks/orange-money`

**Afrimoney:**
1. Contact developer@afrimoney.sl for merchant credentials
2. Add to `.env`: `AFRIMONEY_MERCHANT_ID`, `AFRIMONEY_API_KEY`, `AFRIMONEY_WEBHOOK_SECRET`
3. Set `available: true` for afrimoney in payments.ts
4. Uncomment live block, register: `https://wimakit-api.fly.dev/api/webhooks/afrimoney`

**MoneyMi:**
1. Contact api@moneymi.sl for merchant credentials
2. Add to `.env`: `MONEYMI_MERCHANT_CODE`, `MONEYMI_API_KEY`, `MONEYMI_WEBHOOK_SECRET`
3. Set `available: true` for moneymi in payments.ts
4. Uncomment live block, register: `https://wimakit-api.fly.dev/api/webhooks/moneymi`

### COD Bill
Cash on Delivery automatically generates a **bilingual HTML + plain-text bill** that:
- Shows itemised order with seller info, delivery address, and total due
- Can be **shared via WhatsApp/SMS** as plain text
- Renders as a **print-quality HTML receipt** in-app via WebView
- Contains order reference, estimated delivery time, and payment instructions

---

## 🌍 Deployment

### Option A — Fly.io (Recommended)

**First-time setup:**
```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Login
flyctl auth login

# Deploy backend (from wimakit-backend/)
cd wimakit-backend
flyctl launch --name wimakit-api --region mad --no-deploy
flyctl secrets set \
  MONGODB_URI="mongodb+srv://..." \
  JWT_SECRET="$(openssl rand -hex 64)" \
  JWT_REFRESH_SECRET="$(openssl rand -hex 64)"
flyctl deploy

# Deploy web frontend (from wimakit/)
cd ../wimakit
flyctl launch --name wimakit-web --region mad --no-deploy
flyctl deploy
```

**Subsequent deploys:**
```bash
flyctl deploy   # from respective directory
```

**Scale up:**
```bash
flyctl scale vm shared-cpu-2x --memory 512   # backend
flyctl scale count 2                           # 2 instances
```

### Option B — Render

1. Fork this repo to your GitHub account
2. Go to https://dashboard.render.com → **New Blueprint**
3. Select your forked repo — Render auto-detects `render.yaml`
4. Set environment secrets in the Render dashboard:
   - `MONGODB_URI`
   - `JWT_SECRET` (auto-generated by Render)
   - `JWT_REFRESH_SECRET` (auto-generated)
   - `CLOUDINARY_*` keys
5. Click **Apply** — both services deploy automatically

**Auto-deploy:** Every push to `main` triggers a new deploy on both services.

### Option C — Manual VPS (Ubuntu)

```bash
# Install Node 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone and build
git clone https://github.com/your-org/wimakit.git /opt/wimakit
cd /opt/wimakit/wimakit-backend
npm install --production
cp .env.example .env  # fill in values

# Install PM2 process manager
npm install -g pm2
pm2 start src/server.js --name wimakit-api
pm2 startup && pm2 save

# Nginx reverse proxy
sudo apt install nginx
# Configure nginx to proxy_pass to localhost:5000
```

---

## 📱 Mobile App Builds (EAS)

```bash
cd wimakit

# Development build (for physical device testing)
eas build --profile development --platform android

# Preview APK (shareable .apk)
eas build --profile preview --platform android

# Production (Play Store / App Store)
eas build --profile production --platform all
eas submit --platform all
```

---

## 🔗 Shareable Profiles & QR Codes

Every user gets a unique profile URL:
- **Sellers:** `wimakit.sl/profile/aminata-fresh-market`
- **Buyers:** `wimakit.sl/profile/mohamed-kamara-abc12345`

Features:
- **QR code** generated in-app (tap to expand, share, or save)
- **Deep link** opens the WimaKit app directly
- **Web fallback** shows profile in browser for non-app users
- **Share sheet** integration (WhatsApp, SMS, copy link)

---

## 🗂 Project Structure

```
wimakit/
├── app/
│   ├── (auth)/         # Welcome, Login, Register
│   ├── (tabs)/         # Home, Explore, Cart, Orders, Profile, Seller Dashboard
│   ├── product/[id]    # Product detail
│   ├── profile/[slug]  # Public shareable profile
│   ├── order/[id]      # Order tracking
│   ├── cart.tsx        # Cart + Checkout + Payment + COD Bill
│   ├── search.tsx      # Search with filters
│   └── seller/         # Add/edit products
├── components/
│   ├── ui/             # Button, Badge, Avatar, StarRating, Toast
│   └── product/        # ProductCard
├── constants/
│   ├── theme.ts        # Colors, spacing, typography
│   ├── data.ts         # Types, mock data, helpers
│   └── payments.ts     # Payment gateway stubs + COD bill generator
└── store/              # Zustand stores (auth, cart, orders, wishlist)

wimakit-backend/
├── src/
│   ├── models/         # User, Product, Order, Review, Category
│   ├── routes/         # auth, products, orders, profiles, webhooks
│   ├── middleware/     # auth guard, error handler
│   └── utils/          # logger, seed script
├── Dockerfile
├── fly.toml
└── render.yaml
```

---

## 🤝 Contributing

1. Branch from `develop`: `git checkout -b feature/my-feature`
2. Make changes + write tests
3. Open a PR against `develop`
4. CI runs automatically — must pass before merge

---

## 📞 Contact

**WimaKit Team · Freetown, Sierra Leone**
- 🌐 wimakit.sl
- 📧 hello@wimakit.sl
- 📱 WhatsApp: +232 76 WIMAKIT

*di makit na you phone* 🇸🇱
