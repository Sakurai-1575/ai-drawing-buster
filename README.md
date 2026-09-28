# AIお絵描きバスター / AI Drawing Buster

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
| 🃏 Score Attack | 10 random quizzes, 10s each, score = time left × combo. Wrong answer: −3,000 / −4,000 / −5,000 (1st/2nd/3rd miss on a question, total floored at 0) + 3s answer lock while the AI keeps drawing | `adb.bestScore` (score) |
| 🔥 Sudden Death | 3 lives; a wrong answer or a 10s timeout costs one. All 500 quizzes, no repeats (plus a 2s answer lock). The AI speeds up: Q1–10 1.0x, Q11–20 1.15x, Q21–30 1.3x, Q31+ 1.5x | `adb.best.sudden` (survived) |
| ⚡ Time Attack | One 3-minute clock, no per-question limit. Wrong answer = −5s off the clock + 2s input lock; 0.3s to the next drawing after a hit. Score = (1,000 + speed bonus) × combo | `adb.best.timeattack` (correct) |

Every correct answer in any mode registers in the Buster Dex.

## Layout
```
src/
  data/quizzes.ts        QUIZZES (all 500) + text helpers (quizOptions, quizComment, …) and translation merging
  data/quizTypes.ts      Quiz types/constants only (no runtime deps)
  data/quizzesVol1.ts    Quizzes 1–200 (ja/en text, stroke data), tagged with a genre and a Buster Dex comment
  data/quizzesVol2.ts    Quizzes 201–300
  data/quizzesVol3.ts    Quizzes 301–500
  data/shapes.ts         Stroke helpers for the drawings (line, arc, curve, bumpy, roundRect, …)
  data/drawTopics.ts     18 Mode B draw-only topics; Mode B draws from these + all 500 quizzes = 518
  data/quizI18n/         Quiz + Mode B topic translations per language (zh-CN / zh-TW / ko), loaded on demand
  data/genres.ts         The 10 genres (incl. fashion, fantasy & sci-fi, world culture & landmarks) and their labels in all 5 languages
  i18n/lang.ts           Supported languages (ja, en, zh-CN, zh-TW, ko), fallback rules, browser-language detection
  i18n/strings/          UI strings, one file per language (ja.ts is the source; the compiler enforces every key)
  audio/SoundManager.ts  Web Audio synth SFX
  game/engine.ts         Game rules, scoring, ranks (pure state + sounds)
  game/useGameEngine.ts  requestAnimationFrame loop
  net/protocol.ts        Online wire protocol (message types, room codes, limits like MAX_PLAYERS)
  net/room.ts            PeerJS transport: HostRoom / GuestRoom
  multiplayer/           Online Mode A: host-authoritative match hook + lobby/game/result UI
  components/            Screens and UI pieces
  hooks/                 16:9 stage scaling, language persistence
```

## Languages
UI strings, achievements, genres and Buster-kun's lines exist in all 5 languages (missing keys are compile errors).
All 500 quizzes and every Mode B draw-only topic are translated into every language (`src/data/quizI18n/<lang>.ts`: `label`, three `misleads`, `comment`).
Only Japanese is built into the main bundle; the other languages' UI strings and quiz packs are separate chunks,
fetched before the UI switches to them (`src/i18n/loadLanguage.ts`). Online multiplayer is a lazily loaded chunk too.
When adding a quiz, add it to each of those files too — dev builds warn in the console about untranslated quizzes.
If one slips through, it falls back to English (Japanese for `en`), and a quiz's answer and decoys always fall back
together so the options never mix languages.
Fonts are per-language system stacks in `src/index.css` (switched by the `lang` attribute); nothing is downloaded.

## Online multiplayer (Mode A)
Title → Multiplayer. The host creates a room (code like `BUST-1234`); up to 7 guests join with the code (8 players, `MAX_PLAYERS`). Above 4 players the lobby, scoreboard and standings switch to compact layouts (`COMPACT_PLAYERS`).
Peers connect over WebRTC data channels, brokered by the free public PeerServer (`0.peerjs.com`).
A wrong answer locks that player out for 3s. The host is authoritative: it picks the questions, times each round, judges answers and broadcasts results.
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
