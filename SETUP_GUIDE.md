# WimaKit — Complete Setup & Deployment Guide
## From zero to running app on your PC, phone, and the internet

---

## PART 1: INSTALL EVERYTHING ON YOUR PC

### Step 1 — Install Node.js 20
1. Go to https://nodejs.org
2. Download the **LTS version (20.x)**
3. Run the installer, click Next → Next → Install
4. Verify: open a terminal and run:
   ```
   node --version    # should say v20.x.x
   npm --version     # should say 10.x.x
   ```

### Step 2 — Install VS Code
1. Go to https://code.visualstudio.com
2. Download for Windows/Mac/Linux and install
3. Open VS Code → install these extensions (Ctrl+Shift+X):
   - **React Native Tools** (Microsoft)
   - **TypeScript and JavaScript Language Features** (built-in)
   - **Prettier – Code formatter**
   - **ES7+ React/Redux/React-Native snippets**
   - **GitLens** (optional but helpful)

### Step 3 — Install Git
1. Go to https://git-scm.com
2. Download and install (accept all defaults)
3. Verify: `git --version`

### Step 4 — Install Expo CLI and EAS CLI
```bash
npm install -g expo-cli eas-cli
```
Verify:
```bash
expo --version    # should say 6.x.x or higher
eas --version
```

### Step 5 — Install Android Studio (for Android emulator)
1. Go to https://developer.android.com/studio
2. Download and install Android Studio
3. Open it → Tools → SDK Manager → install **Android SDK 34**
4. Tools → AVD Manager → Create Virtual Device → Pixel 7 → API 34 → Finish
5. Add to your system PATH (Windows):
   ```
   C:\Users\<YourName>\AppData\Local\Android\Sdk\platform-tools
   C:\Users\<YourName>\AppData\Local\Android\Sdk\emulator
   ```

### Step 6 — Install Expo Go on your phone (easiest option)
- iPhone: Search "Expo Go" on App Store
- Android: Search "Expo Go" on Play Store

---

## PART 2: SET UP ONLINE SERVICES (Free Tiers)

### Step 7 — MongoDB Atlas (Database)
1. Go to https://www.mongodb.com/atlas
2. Click **Try Free** → create account
3. Create a free **M0 cluster** (select region closest to you — Europe works well for Sierra Leone)
4. Database Access → Add Database User:
   - Username: `wimakit`
   - Password: generate a strong password → copy it somewhere safe
5. Network Access → Add IP Address → **Allow Access From Anywhere** (0.0.0.0/0)
6. Click your cluster → **Connect** → **Connect your application**
7. Copy the connection string — it looks like:
   ```
   mongodb+srv://wimakit:<password>@cluster0.abc12.mongodb.net/?retryWrites=true&w=majority
   ```
   Replace `<password>` with your actual password

### Step 8 — Cloudinary (Image uploads)
1. Go to https://cloudinary.com
2. Sign up free
3. Dashboard → copy your:
   - **Cloud name**
   - **API Key**
   - **API Secret**

### Step 9 — Create Expo Account (for mobile builds)
1. Go to https://expo.dev
2. Sign up for a free account
3. Remember your username — you'll need it

---

## PART 3: OPEN AND CONFIGURE THE PROJECT

### Step 10 — Extract and open the project
1. Download the **wimakit-complete.zip** file
2. Extract it. This will create a `wimakit-v3` folder.
3. In your terminal, navigate into the extracted folder:
   `cd path/to/wimakit-v3`
4. Open VS Code → File → Open Folder → select the `wimakit` folder inside `wimakit-v3`.
5. Open a second VS Code window → Open Folder → select `wimakit-backend` inside `wimakit-v3`.

### Step 11 — Configure the backend environment
In the `wimakit-backend` folder, open VS Code terminal (Ctrl+`` ` ``):
```bash
# Copy the example env file
cp .env.example .env
```
Now open `.env` in VS Code and fill in these values:
```env
NODE_ENV=development
PORT=5000

# From MongoDB Atlas (Step 7)
MONGODB_URI=mongodb+srv://wimakit:YOUR_PASSWORD@cluster0.abc12.mongodb.net/wimakit?retryWrites=true&w=majority

# Generate these yourself — open a terminal and run:
# node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=paste_64_character_random_string_here
JWT_REFRESH_SECRET=paste_another_64_character_random_string_here
JWT_EXPIRES_IN=30d
JWT_REFRESH_EXPIRES_IN=90d

# From Cloudinary (Step 8)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Leave these blank for now (fill in when you get the keys)
ORANGE_MERCHANT_ID=
ORANGE_API_KEY=
AFRIMONEY_MERCHANT_ID=
AFRIMONEY_API_KEY=
MONEYMI_MERCHANT_CODE=
MONEYMI_API_KEY=

RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
```

### Step 12 — Configure the frontend environment
In the `wimakit` folder, create a new file called `.env.local`:
```env
EXPO_PUBLIC_API_URL=http://localhost:5000
EXPO_PUBLIC_APP_NAME=WimaKit
```

### Step 13 — Update app.json with your Expo username
Open `wimakit/app.json`, find and update:
```json
"owner": "your_expo_username_here"
```

---

## PART 4: INSTALL DEPENDENCIES AND RUN LOCALLY

### Step 14 — Install backend dependencies
In the `wimakit-backend` VS Code terminal:
```bash
npm install
```
Wait for it to complete (downloads ~150MB of packages).

### Step 15 — Seed the database with test data
```bash
npm run seed
```
You should see:
```
✅ MongoDB connected
Seeded 8 categories
Seeded 3 sellers
Seeded 5 products
✅ Seed complete!
  Admin:  admin@wimakit.sl / AdminPass123!
  Seller: aminata@wimakit.sl / Test1234!
  Buyer:  buyer@wimakit.sl / Test1234!
```

### Step 16 — Start the backend server
```bash
npm run dev
```
You should see:
```
✅ MongoDB connected
🚀 WimaKit API running on port 5000 [development]
```

Test it: open your browser → http://localhost:5000/health
You should see: `{"status":"ok","app":"WimaKit","db":"connected"}`

### Step 17 — Install frontend dependencies
Open a new terminal in the `wimakit` folder:
```bash
npm install
```
Wait for completion (~400MB).

### Step 18 — Start the Expo development server
```bash
npx expo start
```
You'll see a QR code and menu in the terminal.

### Step 19 — Run on your phone (easiest)
1. Make sure your phone and PC are on the **same WiFi network**
2. Open **Expo Go** on your phone
3. Scan the QR code shown in the terminal
4. The app will load on your phone! 🎉

### Step 20 — Run on Android Emulator
1. First start the Android emulator: open Android Studio → AVD Manager → click Play ▶
2. Then in the Expo terminal, press **A** to open on Android emulator

### Step 21 — Run in Web Browser
In the Expo terminal, press **W** to open in your web browser.

---

## PART 5: TEST THE APP

### Test buyer flow:
1. Open app → Sign In
2. Email: `buyer@wimakit.sl` / Password: `Test1234!`
3. Browse products on Home screen
4. Tap a product → Add to Cart
5. Go to Cart → Checkout → choose COD → Place Order
6. See the delivery bill generated automatically

### Test seller flow:
1. Sign out → Sign In with `aminata@wimakit.sl` / `Test1234!`
2. Go to Profile tab → you'll see Seller Dashboard option
3. Tap Dashboard tab → see your orders and products
4. Try adding a product

### Test admin:
- `admin@wimakit.sl` / `AdminPass123!`

---

## PART 6: BUILD THE APP FOR ANDROID (APK)

### Step 22 — Log in to Expo
```bash
eas login
```
Enter your Expo username and password.

### Step 23 — Configure EAS build
In the `wimakit` folder:
```bash
eas build:configure
```
When asked "Generate a new Android Keystore?" → **Yes**

### Step 24 — Build a preview APK (for testing, no Play Store needed)
```bash
eas build --platform android --profile preview
```
- This uploads your code to Expo's build servers
- Takes about 10–15 minutes
- When done, you get a link to download the `.apk` file
- Send that `.apk` to anyone to install directly on Android

### Step 25 — Build for iOS (requires Apple Developer account — $99/year)
```bash
eas build --platform ios --profile preview
```

---

## PART 7: DEPLOY BACKEND ONLINE

### Option A — Deploy to Render (easier, has free tier)

1. Go to https://render.com → sign up with GitHub
2. Push your code to GitHub first:
   ```bash
   cd wimakit-backend
   git init
   git add .
   git commit -m "Initial WimaKit backend"
   # Create a repo on github.com, then:
   git remote add origin https://github.com/YOUR_USERNAME/wimakit-backend.git
   git push -u origin main
   ```
3. On Render: **New** → **Web Service** → Connect your GitHub repo
4. Settings:
   - **Root Directory**: leave empty
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free
5. Add Environment Variables (click Environment tab → Add from .env):
   - Copy ALL values from your `.env` file
6. Click **Create Web Service**
7. Wait ~5 minutes → you get a URL like: `https://wimakit-api.onrender.com`
8. Test: `https://wimakit-api.onrender.com/health`

### Option B — Deploy to Fly.io (faster, stays awake)

1. Install flyctl:
   ```bash
   # Windows (PowerShell as admin):
   iwr https://fly.io/install.ps1 -useb | iex
   
   # Mac/Linux:
   curl -L https://fly.io/install.sh | sh
   ```
2. Sign up and login:
   ```bash
   flyctl auth signup
   # or if you have an account:
   flyctl auth login
   ```
3. In `wimakit-backend` folder:
   ```bash
   flyctl launch --name wimakit-api --region mad --no-deploy
   ```
   When asked "Would you like to set up a Postgresql database?" → **No**
   When asked "Would you like to set up an Upstash Redis database?" → **No** (optional)

4. Set your secrets:
   ```bash
   flyctl secrets set MONGODB_URI="your_mongodb_uri_here"
   flyctl secrets set JWT_SECRET="your_jwt_secret_here"
   flyctl secrets set JWT_REFRESH_SECRET="your_refresh_secret_here"
   flyctl secrets set CLOUDINARY_CLOUD_NAME="your_cloud_name"
   flyctl secrets set CLOUDINARY_API_KEY="your_api_key"
   flyctl secrets set CLOUDINARY_API_SECRET="your_api_secret"
   flyctl secrets set NODE_ENV="production"
   ```
5. Deploy:
   ```bash
   flyctl deploy
   ```
6. Test: `https://wimakit-api.fly.dev/health`

---

## PART 8: CONNECT APP TO LIVE BACKEND

### Step 26 — Update frontend to use live API
Once your backend is deployed, update `wimakit/.env.local`:
```env
EXPO_PUBLIC_API_URL=https://wimakit-api.onrender.com
# OR
EXPO_PUBLIC_API_URL=https://wimakit-api.fly.dev
```

For EAS builds, update `wimakit/eas.json` — the `preview` and `production` profiles already have this set. Just update the URL:
```json
"EXPO_PUBLIC_API_URL": "https://wimakit-api.fly.dev"
```

Then rebuild:
```bash
eas build --platform android --profile preview
```

---

## PART 9: PAYMENT GATEWAYS (When API Keys Are Ready)

### Orange Money
1. Contact Orange Sierra Leone for merchant account: https://www.orange.sl
2. Register at: https://developer.orange.com/apis/orange-money-webpay-sl
3. Get your Merchant ID and API Key
4. Add to backend `.env`:
   ```
   ORANGE_MERCHANT_ID=your_merchant_id
   ORANGE_API_KEY=your_api_key
   ORANGE_WEBHOOK_SECRET=your_webhook_secret
   ```
5. In `wimakit/constants/payments.ts`, find `orange_money` and set `available: true`
6. In the same file, uncomment the `// ── LIVE` block inside `case 'orange_money':`
7. Register webhook URL in Orange Money dashboard:
   `https://wimakit-api.fly.dev/api/webhooks/orange-money`

### Afrimoney
1. Contact: developer@afrimoney.sl
2. Same steps as above — set `available: true` for `afrimoney`
3. Webhook URL: `https://wimakit-api.fly.dev/api/webhooks/afrimoney`

### MoneyMi
1. Contact: api@moneymi.sl
2. Same steps — set `available: true` for `moneymi`
3. Webhook URL: `https://wimakit-api.fly.dev/api/webhooks/moneymi`

---

## QUICK REFERENCE — DAILY COMMANDS

```bash
# Start backend (in wimakit-backend/ folder)
npm run dev

# Start frontend (in wimakit/ folder)
npx expo start

# Run on Android emulator only
npx expo start --android

# Run in browser only
npx expo start --web

# Reset Metro bundler cache (if app behaves strangely)
npx expo start --clear

# Re-seed database (WARNING: deletes all existing data)
cd wimakit-backend && npm run seed

# Build Android APK
eas build --platform android --profile preview

# Deploy backend to Fly.io
cd wimakit-backend && flyctl deploy

# Trigger Render re-deploy (just push to GitHub)
git push origin main
```

---

## TROUBLESHOOTING

| Problem | Solution |
|---|---|
| `npm install` fails | Run `npm install --legacy-peer-deps`. Avoid `--force` as it breaks Expo SDK versions. |
| MongoDB connection error | Check MONGODB_URI in .env, check Atlas IP whitelist (allow 0.0.0.0/0) |
| App can't connect to backend on phone | Use your PC's local IP (e.g. 192.168.1.x:5000), not localhost |
| `Cannot destructure property '__extends'` | Run `npx expo start --clear` or `npm install tslib` |
| `ENOENT: ... node:sea` | 1. `Stop-Process -Id (Get-NetTCPConnection -LocalPort 8081).OwningProcess -Force` <br> 2. `Remove-Item -Path .expo, node_modules -Recurse -Force` <br> 3. `npm install` |
| `Unable to find expo` | Your `node_modules` are missing. Run `npm install` inside the `wimakit` folder. |
| "Metro bundler error" | Run `npx expo start --clear` |
| Android emulator won't start | Open Android Studio, update HAXM, increase RAM in AVD settings |
| `eas build` fails | Run `eas whoami` to check login, then `eas build:configure` |
| Product images not uploading | Check CLOUDINARY_* env vars in backend .env |
| Expo Go shows "Something went wrong" | Check terminal for error, most common is a missing npm package |

---

## FOLDER STRUCTURE SUMMARY

```
wimakit/              ← Open this in VS Code for the mobile app
├── app/              ← All screens (Expo Router)
├── components/       ← Reusable UI components
├── constants/        ← Theme, data, payments
├── context/          ← Dark/light mode context
├── hooks/            ← React Query hooks
├── store/            ← Zustand state management
└── utils/            ← API service

wimakit-backend/      ← Open this in a second VS Code window
├── src/
│   ├── controllers/  ← Business logic
│   ├── routes/       ← API endpoints
│   ├── models/       ← MongoDB schemas
│   ├── middleware/   ← Auth, error handling
│   └── utils/        ← Logger, seed data
├── .env              ← Your secrets (never commit this!)
└── package.json
```

---

*WimaKit v1.0.0 · di makit na you phone 🇸🇱*
