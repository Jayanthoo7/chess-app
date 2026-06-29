# Chess App

Full-stack chess website with online multiplayer, AI opponent (Stockfish), chess clock, and game history.

## Tech Stack

- **Frontend**: React + Vite + Tailwind CSS + Socket.io-client + chess.js
- **Backend**: Node.js + Express + Socket.io + sql.js (SQLite)
- **AI**: Stockfish 10 (WebAssembly, runs in browser)

## Features

- ♟ **Online multiplayer** — share a room ID with a friend to play
- 🤖 **vs Stockfish AI** — 5 difficulty levels (Beginner → Expert)
- ⏱ **Chess clock** — Bullet (1min), Blitz (3/5min), Rapid (10/15min), Classical (30min)
- 💾 **Game history** — all games saved to SQLite, viewable from the lobby
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

### 2. Start the server

```bash
cd server
node index.js
# Server runs on http://localhost:3001
```

### 3. Start the client (new terminal)

```bash
cd client
npx vite
# Client runs on http://localhost:5173
```

### 4. Open in browser

Go to **http://localhost:5173**

## How to Play

### Online vs Friend
1. Enter your name on the home screen
2. Choose a time control
3. Click **Create Game** → share the Room ID with your friend
4. Your friend enters their name, pastes the Room ID, clicks **Join**
5. Game starts automatically when both players are connected

### vs AI
1. Enter your name, choose time control
2. Click the **vs AI** tab, pick a difficulty, click **Play vs Stockfish**
3. You play White, Stockfish plays Black

### View History
1. Click the **History** tab on the home screen
2. Click any game to spectate/review it

## Project Structure

```
chess-app/
├── server/
│   ├── index.js       # Express + Socket.io server
│   ├── chess.db       # SQLite database (auto-created)
│   └── package.json
└── client/
    ├── src/
    │   ├── App.jsx
    │   ├── pages/
    │   │   ├── Home.jsx       # Lobby / home screen
    │   │   ├── GamePage.jsx   # Online multiplayer game
    │   │   └── AIPage.jsx     # vs Stockfish AI
    │   ├── components/
    │   │   ├── ChessBoard.jsx # Interactive board
    │   │   ├── Clock.jsx      # Chess clock display
    │   │   └── MoveHistory.jsx
    │   ├── hooks/
    │   │   └── useStockfish.js
    │   └── lib/
    │       └── socket.js
    ├── vite.config.js
    ├── tailwind.config.js
    └── package.json
```

## Environment Variables

Create `client/.env` to override the server URL (for deployment):

```
VITE_SERVER_URL=http://your-server:3001
```

## Deployment

- **Server**: Deploy `server/` to any Node.js host (Railway, Render, Fly.io)
- **Client**: Run `npm run build` in `client/`, deploy `dist/` to Netlify/Vercel
- Update `VITE_SERVER_URL` in client env to point to your deployed server

## 📸 Application Interface & Features

### Matchmaking & Game Configuration
<img width="1440" height="900" alt="Screenshot 2026-06-29 at 19 28 10" src="https://github.com/user-attachments/assets/dcdabcbe-a2d0-4c08-949f-4b2015a648aa" />


### Game Initialization & Waiting Room
<img width="1440" height="900" alt="Screenshot 2026-06-29 at 19 28 20" src="https://github.com/user-attachments/assets/7e9ed890-39ac-46a6-928b-6fbfc4840336" />


### Active Gameplay (White's Perspective)
<img width="1440" height="900" alt="Screenshot 2026-06-29 at 19 29 01" src="https://github.com/user-attachments/assets/dac8424b-9551-4b8b-a00c-65320df4bd12" />


### Active Gameplay (Black's Perspective)
<img width="1440" height="900" alt="Screenshot 2026-06-29 at 19 29 08" src="https://github.com/user-attachments/assets/968958a5-028e-4eb6-8fbf-ef4a0803f99b" />

