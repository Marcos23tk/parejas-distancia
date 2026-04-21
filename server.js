import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Octokit } from '@octokit/rest';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const IS_VERCEL = Boolean(process.env.VERCEL);

const REQUIRED_GITHUB_VARS = ['GITHUB_TOKEN', 'GITHUB_OWNER', 'GITHUB_REPO'];
const missingGithubVars = REQUIRED_GITHUB_VARS.filter((key) => !process.env[key]);
const githubReady = missingGithubVars.length === 0;

const LOCAL_FALLBACK = !IS_VERCEL && !githubReady;

const BRANCH = process.env.GITHUB_BRANCH || 'main';
const DATA_DIR = (process.env.GITHUB_DATA_DIR || 'rooms').replace(/^\/+|\/+$/g, '');

const octokit = githubReady ? new Octokit({ auth: process.env.GITHUB_TOKEN }) : null;
const localStorageDir = path.join(process.cwd(), 'storage');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function ensureStorageConfigured() {
  if (IS_VERCEL && !githubReady) {
    throw new Error(`Faltan variables de GitHub: ${missingGithubVars.join(', ')}`);
  }
}

function normalizeRoomCode(code = '') {
  return String(code).trim().toUpperCase();
}

function generateRoomCode() {
  return `SALA-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
}

function baseRoom(playerName, theme, roomCode) {
  const id = randomUUID();
  return {
    roomCode,
    theme,
    status: 'waiting',
    phase: 'waiting_player_2',
    players: [{ id, name: playerName, score: 0 }],
    currentTurn: {},
    round: 1,
    maxRounds: 5
  };
}

async function githubRead(roomCode) {
  const filePath = `${DATA_DIR}/${roomCode}.json`;

  const res = await octokit.repos.getContent({
    owner: process.env.GITHUB_OWNER,
    repo: process.env.GITHUB_REPO,
    path: filePath,
    ref: BRANCH
  });

  const content = Buffer.from(res.data.content, 'base64').toString();
  return { data: JSON.parse(content), sha: res.data.sha };
}

async function githubWrite(roomCode, data, sha) {
  const filePath = `${DATA_DIR}/${roomCode}.json`;

  await octokit.repos.createOrUpdateFileContents({
    owner: process.env.GITHUB_OWNER,
    repo: process.env.GITHUB_REPO,
    path: filePath,
    message: `update ${roomCode}`,
    content: Buffer.from(JSON.stringify(data, null, 2)).toString('base64'),
    branch: BRANCH,
    sha
  });
}

async function readRoom(roomCode) {
  ensureStorageConfigured();
  return (await githubRead(roomCode)).data;
}

async function writeRoom(room) {
  ensureStorageConfigured();

  let sha;
  try {
    sha = (await githubRead(room.roomCode)).sha;
  } catch {}

  await githubWrite(room.roomCode, room, sha);
}

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    mode: 'github',
    isVercel: IS_VERCEL,
    githubConfigured: githubReady,
    missingGithubVars
  });
});

app.post('/api/rooms', async (req, res) => {
  const { playerName, theme = 'romantico' } = req.body;
  const roomCode = generateRoomCode();

  const room = baseRoom(playerName, theme, roomCode);
  await writeRoom(room);

  res.json(room);
});

app.post('/api/rooms/:roomCode/join', async (req, res) => {
  const room = await readRoom(req.params.roomCode);

  if (room.players.length >= 2) {
    return res.status(400).json({ error: 'Sala llena' });
  }

  room.players.push({
    id: randomUUID(),
    name: req.body.playerName,
    score: 0
  });

  room.status = 'playing';
  await writeRoom(room);

  res.json(room);
});

app.get('/api/rooms/:roomCode', async (req, res) => {
  const room = await readRoom(req.params.roomCode);
  res.json(room);
});

/* ================== NUEVA RUTA ABANDONAR ================== */
app.post('/api/rooms/:roomCode/leave', async (req, res, next) => {
  try {
    const room = await readRoom(req.params.roomCode);
    const { playerId } = req.body;

    const index = room.players.findIndex(p => p.id === playerId);

    if (index === -1) {
      return res.status(404).json({ error: 'Jugador no encontrado' });
    }

    room.players.splice(index, 1);

    if (room.players.length === 0) {
      return res.json({ ok: true, message: 'Sala vacia' });
    }

    if (room.players.length === 1) {
      const jugador = room.players[0];

      room.status = 'waiting';
      room.phase = 'waiting_player_2';
      room.currentTurn = {};
      room.round = 1;
    }

    await writeRoom(room);
    res.json({ ok: true, room });

  } catch (error) {
    next(error);
  }
});
/* ========================================================== */

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint no encontrado.' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error del servidor', details: err.message });
});

if (!IS_VERCEL) {
  app.listen(PORT, () => {
    console.log(`Servidor en http://localhost:${PORT}`);
  });
}

export default app;
