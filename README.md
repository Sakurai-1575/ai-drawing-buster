# AI絵描き歌バスター / AI Drawing Buster

Real-time sketch quiz: guess what the AI is drawing before the 10-second timer runs out.
React 18 + TypeScript + Vite + Tailwind CSS. Sound effects are Web Audio oscillators and all drawings are code; the only asset files are the BGM tracks in `public/audio/bgm/` (see `src/audio/BgmManager.ts` for the track list and original titles).

```bash
npm install
npm run dev      # http://localhost:1420
npm run build    # typecheck + production build to dist/
```

## Controls
| Key | Action |
| --- | --- |
| `1` `2` `3` `4` / `Q` `W` `E` `R` | Answer |
| `Esc` | Pause / resume |
| `Space` / `Enter` | Open the solo mode picker (title) / retry the same mode (result) |
| `1` `2` `3` (mode picker) | Score Attack / Sudden Death / Time Attack |
| `M` | Mute |

## Solo modes
| Mode | Rules | Personal best (localStorage) |
| --- | --- | --- |
| 🃏 Score Attack | 10 random quizzes, 10s each, score = time left × combo | `adb.bestScore` (score) |
| 🔥 Sudden Death | 3 lives; a wrong answer or a 10s timeout costs one. All 200 quizzes, no repeats. The AI speeds up: Q1–10 1.0x, Q11–20 1.15x, Q21–30 1.3x, Q31+ 1.5x | `adb.best.sudden` (survived) |
| ⚡ Time Attack | One 3-minute clock, no per-question limit. Wrong answer = 1.5s input lock; 0.3s to the next drawing after a hit. Score = (1,000 + speed bonus) × combo | `adb.best.timeattack` (correct) |

Every correct answer in any mode registers in the Buster Dex.

## Layout
```
src/
  data/quizzes.ts        200 AI line-drawing quizzes, tagged with a genre, each with a Buster Dex comment (normalized stroke data + shape helpers)
  data/drawTopics.ts     105 Mode B draw-only topics (15 per genre); Mode B draws from both = 305
  data/genres.ts         The 7 genres and their JA/EN labels
  audio/SoundManager.ts  Web Audio synth SFX
  game/engine.ts         Game rules, scoring, ranks (pure state + sounds)
  game/useGameEngine.ts  requestAnimationFrame loop
  net/protocol.ts        Online wire protocol (message types, room codes, limits like MAX_PLAYERS)
  net/room.ts            PeerJS transport: HostRoom / GuestRoom
  multiplayer/           Online Mode A: host-authoritative match hook + lobby/game/result UI
  components/            Screens and UI pieces
  hooks/                 16:9 stage scaling, language persistence
```

## Online multiplayer (Mode A)
Title → Multiplayer. The host creates a room (code like `BUST-1234`); up to 3 guests join with the code.
Peers connect over WebRTC data channels, brokered by the free public PeerServer (`0.peerjs.com`).
The host is authoritative: it picks the questions, times each round, judges answers and broadcasts results.
There is no TURN relay, so players behind some strict NATs / corporate networks may fail to connect.
Invite links (`?room=BUST-1234&mode=a|b`) open straight into that room; they're only shareable when the game is served over http(s), not from the packaged Tauri app.

## Building a Windows .exe with Tauri
The Vite config already follows Tauri's recommendations (port 1420, relative `base`, `TAURI_ENV_*` env prefix),
and `@tauri-apps/cli` is a dev dependency. With Rust installed:

```bash
npm run tauri init   # dev URL: http://localhost:1420, dist dir: ../dist, dev cmd: npm run dev, build cmd: npm run build
npm run tauri dev
npm run tauri build  # produces the .exe / installer
```
