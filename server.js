import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Octokit } from "@octokit/rest";

import fs from "fs";
import path from "path";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ===== CONFIG =====
const PORT = process.env.PORT || 3000;

const OWNER = process.env.GITHUB_OWNER;
const REPO = process.env.GITHUB_REPO;
const BRANCH = process.env.GITHUB_BRANCH || "main";
const DATA_DIR = process.env.GITHUB_DATA_DIR || "rooms";

const mode = process.env.GITHUB_TOKEN ? "github" : "local";

// ===== GITHUB CLIENT =====
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

// ===== LOCAL STORAGE =====
const STORAGE_DIR = path.join(process.cwd(), "storage");

if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR);
}

// ===== HELPERS =====
function generateRoomCode() {
  return "SALA-" + Math.random().toString(36).substring(2, 8).toUpperCase();
}

// ===== GITHUB FUNCTIONS =====
async function writeRoomGitHub(room) {
  const filePath = `${DATA_DIR}/${room.code}.json`;

  const content = Buffer.from(JSON.stringify(room, null, 2)).toString("base64");

  let sha;

  try {
    const existing = await octokit.repos.getContent({
      owner: OWNER,
      repo: REPO,
      path: filePath,
      ref: BRANCH,
    });

    sha = existing.data.sha;
  } catch (err) {
    sha = undefined;
  }

  await octokit.repos.createOrUpdateFileContents({
    owner: OWNER,
    repo: REPO,
    path: filePath,
    message: `update room ${room.code}`,
    content,
    branch: BRANCH,
    sha,
  });
}

async function readRoomGitHub(code) {
  const filePath = `${DATA_DIR}/${code}.json`;

  const res = await octokit.repos.getContent({
    owner: OWNER,
    repo: REPO,
    path: filePath,
    ref: BRANCH,
  });

  const content = Buffer.from(res.data.content, "base64").toString();
  return JSON.parse(content);
}

// ===== LOCAL FUNCTIONS =====
function writeRoomLocal(room) {
  const filePath = path.join(STORAGE_DIR, `${room.code}.json`);
  fs.writeFileSync(filePath, JSON.stringify(room, null, 2));
}

function readRoomLocal(code) {
  const filePath = path.join(STORAGE_DIR, `${code}.json`);

  if (!fs.existsSync(filePath)) {
    throw new Error("Sala no encontrada");
  }

  return JSON.parse(fs.readFileSync(filePath));
}

// ===== ROUTES =====

// 🔥 HEALTH CHECK
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    mode,
  });
});

// 🔥 CREAR SALA
app.post("/api/create-room", async (req, res) => {
  try {
    const { name, theme } = req.body;

    const room = {
      code: generateRoomCode(),
      players: [{ name, score: 0 }],
      theme,
      createdAt: new Date().toISOString(),
    };

    if (mode === "github") {
      await writeRoomGitHub(room);
    } else {
      writeRoomLocal(room);
    }

    res.json(room);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error.message,
    });
  }
});

// 🔥 UNIRSE A SALA
app.post("/api/join-room", async (req, res) => {
  try {
    const { code, name } = req.body;

    let room;

    if (mode === "github") {
      room = await readRoomGitHub(code);
    } else {
      room = readRoomLocal(code);
    }

    room.players.push({ name, score: 0 });

    if (mode === "github") {
      await writeRoomGitHub(room);
    } else {
      writeRoomLocal(room);
    }

    res.json(room);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "No se pudo unir a la sala",
    });
  }
});

// ===== START SERVER SOLO LOCAL =====
if (process.env.VERCEL !== "1") {
  app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
  });
}

export default app;
