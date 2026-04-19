import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Octokit } from '@octokit/rest';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const LOCAL_FALLBACK = !process.env.GITHUB_TOKEN || !process.env.GITHUB_OWNER || !process.env.GITHUB_REPO;
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const DATA_DIR = process.env.GITHUB_DATA_DIR || 'rooms';
const octokit = LOCAL_FALLBACK ? null : new Octokit({ auth: process.env.GITHUB_TOKEN });
const localStorageDir = path.join(process.cwd(), 'storage');

const PACKS = {
  romantico: [
    '¿Cual fue tu primera impresion de mi?',
    '¿Que detalle mio te hace sentir mas querido(a)?',
    '¿Que plan te gustaria vivir conmigo en persona?',
    '¿Cual es un recuerdo nuestro que te da paz?',
    '¿Que cancion te recuerda a mi?'
  ],
  divertido: [
    '¿Que comida pediria yo si pudiera elegir ahora mismo?',
    '¿Cual es mi emoji mas usado?',
    '¿Que cosa rara hago cuando estoy feliz?',
    '¿Que serie elegiria para maratonear contigo?',
    '¿Que apodo gracioso me quedaria mejor?'
  ],
  profundo: [
    '¿Que miedo personal crees que comparto contigo?',
    '¿Que valor consideras mas importante en una relacion?',
    '¿Que te gustaria que construyamos juntos en el futuro?',
    '¿Que cosa te ha hecho sentir mas comprendido(a) por mi?',
    '¿Que promesa emocional crees que deberiamos hacernos?'
  ]
};

const RETOS = [
  'Reto: envia una nota de voz de 30 segundos diciendo tres razones por las que amas a tu pareja.',
  'Reto: manda una foto de algo que te recuerde a su relacion.',
  'Reto: dedica una cancion y explica por que la elegiste.',
  'Pregunta especial: ¿que aspecto de la relacion quisieras fortalecer?',
  'Pregunta especial: ¿que es lo que mas agradeces de tu pareja hoy?',
  'Reto: escribe un mensaje romantico de minimo 5 lineas.',
  'Pregunta especial: ¿que detalle te haria sentir mas cerca a pesar de la distancia?'
];

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

async function ensureLocalDir() {
  await fs.mkdir(localStorageDir, { recursive: true });
}

function filePathForRoom(roomCode) {
  return `${DATA_DIR}/${roomCode}.json`;
}

function localFilePath(roomCode) {
  return path.join(localStorageDir, `${roomCode}.json`);
}

function sample(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function sanitizeName(name = '') {
  return String(name).trim().slice(0, 30) || 'Jugador';
}

function generateRoomCode() {
  return `SALA-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
}

function baseRoom(playerName, pack) {
  const firstPlayerId = randomUUID();
  return {
    roomCode: generateRoomCode(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'waiting',
    theme: pack,
    round: 1,
    maxRounds: 5,
    activePlayerId: firstPlayerId,
    phase: 'waiting_player_2',
    players: [
      {
        id: firstPlayerId,
        name: sanitizeName(playerName),
        score: 0
      }
    ],
    currentTurn: {
      askerId: firstPlayerId,
      guesserId: null,
      question: '',
      correctAnswer: '',
      guess: '',
      result: null,
      challengeFor: null,
      challengeText: ''
    },
    history: []
  };
}

async function githubRead(roomCode) {
  const filePath = filePathForRoom(roomCode);
  const response = await octokit.repos.getContent({
    owner: process.env.GITHUB_OWNER,
    repo: process.env.GITHUB_REPO,
    path: filePath,
    ref: BRANCH
  });

  const content = Buffer.from(response.data.content, 'base64').toString('utf8');
  return {
    data: JSON.parse(content),
    sha: response.data.sha
  };
}

async function githubWrite(roomCode, roomData, sha = undefined) {
  const filePath = filePathForRoom(roomCode);
  const content = Buffer.from(JSON.stringify(roomData, null, 2)).toString('base64');

  await octokit.repos.createOrUpdateFileContents({
    owner: process.env.GITHUB_OWNER,
    repo: process.env.GITHUB_REPO,
    path: filePath,
    message: `Actualizar sala ${roomCode}`,
    content,
    branch: BRANCH,
    sha
  });
}

async function readRoom(roomCode) {
  if (LOCAL_FALLBACK) {
    await ensureLocalDir();
    const raw = await fs.readFile(localFilePath(roomCode), 'utf8');
    return JSON.parse(raw);
  }
  const { data } = await githubRead(roomCode);
  return data;
}

async function writeRoom(roomData) {
  roomData.updatedAt = new Date().toISOString();
  if (LOCAL_FALLBACK) {
    await ensureLocalDir();
    await fs.writeFile(localFilePath(roomData.roomCode), JSON.stringify(roomData, null, 2), 'utf8');
    return;
  }

  let sha;
  try {
    const existing = await githubRead(roomData.roomCode);
    sha = existing.sha;
  } catch (error) {
    sha = undefined;
  }
  await githubWrite(roomData.roomCode, roomData, sha);
}

function getPair(room) {
  const [p1, p2] = room.players;
  return { p1, p2 };
}

function setNextTurn(room) {
  const { p1, p2 } = getPair(room);
  const isOdd = room.round % 2 === 1;
  room.currentTurn.askerId = isOdd ? p1.id : p2.id;
  room.currentTurn.guesserId = isOdd ? p2.id : p1.id;
  room.activePlayerId = room.currentTurn.askerId;
  room.currentTurn.question = sample(PACKS[room.theme]);
  room.currentTurn.correctAnswer = '';
  room.currentTurn.guess = '';
  room.currentTurn.result = null;
  room.currentTurn.challengeFor = null;
  room.currentTurn.challengeText = '';
  room.phase = 'answering';
}

function evaluateRound(room) {
  const normalizedAnswer = room.currentTurn.correctAnswer.trim().toLowerCase();
  const normalizedGuess = room.currentTurn.guess.trim().toLowerCase();
  const guesser = room.players.find((p) => p.id === room.currentTurn.guesserId);
  const asker = room.players.find((p) => p.id === room.currentTurn.askerId);

  const correct = normalizedAnswer !== '' && normalizedAnswer === normalizedGuess;
  if (correct && guesser) {
    guesser.score += 2;
  } else if (asker) {
    asker.score += 1;
  }

  const sorted = [...room.players].sort((a, b) => a.score - b.score);
  const lowest = sorted[0];
  const tie = room.players.length === 2 && room.players[0].score === room.players[1].score;
  room.currentTurn.result = correct ? 'correcto' : 'incorrecto';
  room.currentTurn.challengeFor = tie ? 'empate' : lowest?.id || null;
  room.currentTurn.challengeText = tie
    ? 'Empate: ambos deben responder una pregunta especial juntos: ¿que les mantiene unidos a pesar de la distancia?'
    : sample(RETOS);

  room.history.push({
    round: room.round,
    askerId: room.currentTurn.askerId,
    guesserId: room.currentTurn.guesserId,
    question: room.currentTurn.question,
    correctAnswer: room.currentTurn.correctAnswer,
    guess: room.currentTurn.guess,
    result: room.currentTurn.result,
    challengeFor: room.currentTurn.challengeFor,
    challengeText: room.currentTurn.challengeText,
    scores: room.players.map((p) => ({ name: p.name, score: p.score }))
  });

  room.phase = 'round_result';
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, mode: LOCAL_FALLBACK ? 'local' : 'github' });
});

app.post('/api/rooms', async (req, res) => {
  try {
    const { playerName, theme = 'romantico' } = req.body;
    if (!PACKS[theme]) {
      return res.status(400).json({ error: 'Tema no valido.' });
    }
    const room = baseRoom(playerName, theme);
    await writeRoom(room);
    res.status(201).json(room);
  } catch (error) {
    res.status(500).json({ error: 'No se pudo crear la sala.', details: error.message });
  }
});

app.post('/api/rooms/:roomCode/join', async (req, res) => {
  try {
    const room = await readRoom(req.params.roomCode);
    if (room.players.length >= 2) {
      return res.status(400).json({ error: 'La sala ya esta completa.' });
    }

    room.players.push({
      id: randomUUID(),
      name: sanitizeName(req.body.playerName),
      score: 0
    });
    room.status = 'playing';
    setNextTurn(room);
    await writeRoom(room);
    res.json(room);
  } catch (error) {
    res.status(404).json({ error: 'No se encontro la sala.', details: error.message });
  }
});

app.get('/api/rooms/:roomCode', async (req, res) => {
  try {
    const room = await readRoom(req.params.roomCode);
    res.json(room);
  } catch (error) {
    res.status(404).json({ error: 'No se encontro la sala.', details: error.message });
  }
});

app.post('/api/rooms/:roomCode/answer', async (req, res) => {
  try {
    const room = await readRoom(req.params.roomCode);
    const { playerId, answer } = req.body;
    if (room.phase !== 'answering') {
      return res.status(400).json({ error: 'La sala no esta en fase de respuesta.' });
    }
    if (playerId !== room.currentTurn.askerId) {
      return res.status(403).json({ error: 'No te toca responder.' });
    }

    room.currentTurn.correctAnswer = String(answer || '').trim();
    room.phase = 'guessing';
    room.activePlayerId = room.currentTurn.guesserId;
    await writeRoom(room);
    res.json(room);
  } catch (error) {
    res.status(500).json({ error: 'No se pudo guardar la respuesta.', details: error.message });
  }
});

app.post('/api/rooms/:roomCode/guess', async (req, res) => {
  try {
    const room = await readRoom(req.params.roomCode);
    const { playerId, guess } = req.body;
    if (room.phase !== 'guessing') {
      return res.status(400).json({ error: 'La sala no esta en fase de adivinanza.' });
    }
    if (playerId !== room.currentTurn.guesserId) {
      return res.status(403).json({ error: 'No te toca adivinar.' });
    }

    room.currentTurn.guess = String(guess || '').trim();
    evaluateRound(room);
    await writeRoom(room);
    res.json(room);
  } catch (error) {
    res.status(500).json({ error: 'No se pudo guardar la adivinanza.', details: error.message });
  }
});

app.post('/api/rooms/:roomCode/next', async (req, res) => {
  try {
    const room = await readRoom(req.params.roomCode);
    if (room.phase !== 'round_result') {
      return res.status(400).json({ error: 'La ronda aun no termina.' });
    }

    room.round += 1;
    if (room.round > room.maxRounds) {
      room.phase = 'finished';
      room.status = 'finished';
      await writeRoom(room);
      return res.json(room);
    }

    setNextTurn(room);
    await writeRoom(room);
    res.json(room);
  } catch (error) {
    res.status(500).json({ error: 'No se pudo avanzar a la siguiente ronda.', details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor en http://localhost:${PORT}`);
  console.log(`Modo de almacenamiento: ${LOCAL_FALLBACK ? 'local' : 'github'}`);
});
