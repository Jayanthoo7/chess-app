# Chess App

Full-stack chess website with login (email/phone + CAPTCHA + email OTP), online multiplayer, AI opponent (Stockfish), chess clock, and game history.

## Tech Stack

- **Frontend**: React + Vite + Tailwind CSS + Socket.io-client + chess.js + react-google-recaptcha
- **Backend**: Node.js + Express + Socket.io + sql.js (SQLite) + JWT + bcrypt + Nodemailer
- **AI**: Stockfish 10 (WebAssembly, runs in a Web Worker in the browser)

## Features

- 🔐 **Accounts** — sign up with name, email, phone (optional), and password
- ✅ **Google reCAPTCHA v2** on sign up and login
- 📧 **Email OTP verification** — a 6-digit code confirms your email at signup, and can also be used as a passwordless "Email OTP" login method
- 🪪 **Log in with email or phone number** as your identifier (password-based)
- ♟ **Online multiplayer** — share a room ID with a friend to play
- 🤖 **vs Stockfish AI** — 5 difficulty levels (Beginner → Expert), with a same-origin Web Worker fix so the engine actually loads reliably, plus a random-move fallback if it can't
- ⏱ **Chess clock** — Bullet (1min), Blitz (3/5min), Rapid (10/15min), Classical (30min)
- 💾 **Game history** — all games saved to SQLite, linked to your account, viewable from the lobby
- ✅ Full move validation via chess.js (castling, en passant, promotion, check/checkmate/stalemate/draw)
- Resign and draw offer support

## Setup

### Prerequisites
- Node.js 18+
- npm

### 1. Install dependencies

```bash
# Server
cd server
npm install

# Client
cd ../client
npm install
```

### 2. Configure environment variables

```bash
# From the project root
cp server/.env.example server/.env
cp client/.env.example client/.env
```

Then edit `server/.env` and `client/.env` — see **Authentication setup** below for how to get
the CAPTCHA and email values. If you leave `RECAPTCHA_SECRET_KEY` / `VITE_RECAPTCHA_SITE_KEY`
blank, CAPTCHA is skipped automatically (useful while developing locally). If you leave the
`SMTP_*` values blank, OTP codes are printed to the **server console** instead of emailed —
also handy for local testing without setting up email first.

Generate a `JWT_SECRET` with:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 3. Start the server

```bash
cd server
node index.js
# Server runs on http://localhost:3001
```

### 4. Start the client (new terminal)

```bash
cd client
npx vite
# Client runs on http://localhost:5173
```

### 5. Open in browser

Go to **http://localhost:5173** — you'll land on the sign-up/login page first.

## Authentication setup

### Google reCAPTCHA v2 (free)
1. Go to https://www.google.com/recaptcha/admin/create
2. Choose **reCAPTCHA v2 → "I'm not a robot" Checkbox**
3. Under **Domains**, add both `localhost` and your production domain (you can add the production one later, once you know it)
4. You'll get a **Site key** (put it in `client/.env` as `VITE_RECAPTCHA_SITE_KEY`) and a **Secret key** (put it in `server/.env` as `RECAPTCHA_SECRET_KEY`)

### Gmail SMTP for OTP emails (free)
1. Turn on 2-Step Verification on your Google account: https://myaccount.google.com/security
2. Create an App Password: https://myaccount.google.com/apppasswords
3. In `server/.env`, set:
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=465
   SMTP_USER=youraddress@gmail.com
   SMTP_PASS=the_16_character_app_password
   EMAIL_FROM="Chess App <youraddress@gmail.com>"
   ```

### Phone numbers
Phone number is captured at signup and can be used as your login identifier (alongside your
password), but it is **not SMS-verified** — real SMS OTP has no free-forever provider (Twilio,
MSG91, Fast2SMS, etc. all charge per message once trial credit runs out). If you want real phone
OTP later, `server/routes/auth.js` and `server/utils/` are the places to add it.

## How to Play

### Sign up / Log in
1. Create an account with your name, email, optional phone number, and a password (8+ characters)
2. Check your email for a 6-digit code and enter it to verify your account
3. From then on, log in with your email or phone number + password, or use "Email OTP" for a passwordless login

### Online vs Friend
1. Choose a time control
2. Click **Create Game** → share the Room ID with your friend
3. Your friend logs in, pastes the Room ID, clicks **Join**
4. Game starts automatically when both players are connected

### vs AI
1. Choose a time control
2. Click the **vs AI** tab, pick a difficulty, click **Play vs Stockfish**
3. You play White, Stockfish plays Black

### View History
1. Click the **History** tab on the home screen
2. Click any game to spectate/review it

## Project Structure

```
chess-app/
├── server/
│   ├── index.js            # Express + Socket.io server
│   ├── db.js                # SQLite (sql.js) setup + query helpers
│   ├── routes/
│   │   └── auth.js          # register / verify-email / login / OTP / me
│   ├── middleware/
│   │   └── auth.js          # JWT verification middleware
│   ├── utils/
│   │   ├── email.js         # Nodemailer (Gmail SMTP) OTP emails
│   │   └── captcha.js       # Google reCAPTCHA server-side verification
│   ├── chess.db              # SQLite database (auto-created)
│   ├── .env.example
│   └── package.json
└── client/
    ├── src/
    │   ├── App.jsx
    │   ├── context/
    │   │   └── AuthContext.jsx
    │   ├── pages/
    │   │   ├── Login.jsx
    │   │   ├── Signup.jsx
    │   │   ├── Home.jsx       # Lobby / home screen
    │   │   ├── GamePage.jsx   # Online multiplayer game
    │   │   └── AIPage.jsx     # vs Stockfish AI
    │   ├── components/
    │   │   ├── ChessBoard.jsx # Interactive board
    │   │   ├── Clock.jsx      # Chess clock display
    │   │   ├── MoveHistory.jsx
    │   │   ├── Captcha.jsx
    │   │   └── ProtectedRoute.jsx
    │   ├── hooks/
    │   │   └── useStockfish.js
    │   └── lib/
    │       ├── api.js
    │       └── socket.js
    ├── vite.config.js
    ├── tailwind.config.js
    ├── .env.example
    └── package.json
```

## Environment Variables

See `server/.env.example` and `client/.env.example` for the full list with comments. In short:

**server/.env**
```
PORT=3001
CLIENT_URL=http://localhost:5173
JWT_SECRET=...
RECAPTCHA_SECRET_KEY=...
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=...
SMTP_PASS=...
EMAIL_FROM="Chess App <...>"
```

**client/.env**
```
VITE_SERVER_URL=http://your-server:3001
VITE_RECAPTCHA_SITE_KEY=...
```

## Deployment

### Server → Render

A `render.yaml` Blueprint at the repo root already describes the service (root dir `server/`,
`npm install`, `node index.js`, free plan). To use it:

1. In the Render Dashboard: **New → Blueprint**, connect the `Jayanthoo7/chess-app` GitHub repo
2. Render reads `render.yaml` and prompts you for the env vars marked secret: `JWT_SECRET`,
   `RECAPTCHA_SECRET_KEY`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `CLIENT_URL` (your Vercel URL —
   can be filled in after the client is deployed and the service redeployed)
3. Deploy — note the resulting URL (e.g. `https://chess-app-server.onrender.com`)

If you'd rather not use the Blueprint, **New → Web Service** with the same repo, root directory
`server`, build command `npm install`, start command `node index.js`, and add the same env vars
manually works identically.

Note: `sql.js` writes `chess.db` to local disk, so on Render's free tier (ephemeral filesystem)
the database resets on redeploy/restart — fine for testing, but for production durability add a
persistent disk or move to a hosted database.

### Client → Vercel

1. In Vercel: **Add New → Project**, import the same GitHub repo
2. Set **Root Directory** to `client` (Vercel auto-detects the Vite framework preset)
3. Add environment variables: `VITE_SERVER_URL` = your Render URL from above,
   `VITE_RECAPTCHA_SITE_KEY` = your reCAPTCHA site key
4. Deploy — `client/vercel.json` is already set up so client-side routes (like `/game/:id`)
   work on refresh/direct link instead of 404ing

### After both are live

- Add your Vercel domain to the reCAPTCHA admin console's **Domains** list, or the CAPTCHA
  widget will fail to verify in production
- Update the server's `CLIENT_URL` env var (on Render) to your Vercel URL, and redeploy the server

## 📸 Application Interface & Features

### Matchmaking & Game Configuration
<img width="1440" height="900" alt="Screenshot 2026-06-29 at 19 28 10" src="https://github.com/user-attachments/assets/dcdabcbe-a2d0-4c08-949f-4b2015a648aa" />


### Game Initialization & Waiting Room
<img width="1440" height="900" alt="Screenshot 2026-06-29 at 19 28 20" src="https://github.com/user-attachments/assets/7e9ed890-39ac-46a6-928b-6fbfc4840336" />


### Active Gameplay (White's Perspective)
<img width="1440" height="900" alt="Screenshot 2026-06-29 at 19 29 01" src="https://github.com/user-attachments/assets/dac8424b-9551-4b8b-a00c-65320df4bd12" />


### Active Gameplay (Black's Perspective)
<img width="1440" height="900" alt="Screenshot 2026-06-29 at 19 29 08" src="https://github.com/user-attachments/assets/968958a5-028e-4eb6-8fbf-ef4a0803f99b" />

