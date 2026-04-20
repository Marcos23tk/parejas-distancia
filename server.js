const express = require("express");
const path = require("path");

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const salas = {};

app.post("/api/crear-sala", (req, res) => {
  const { nombreSala, jugador } = req.body;

  if (!nombreSala || !jugador) {
    return res.status(400).json({ error: "Faltan datos" });
  }

  if (salas[nombreSala]) {
    return res.status(400).json({ error: "La sala ya existe" });
  }

  salas[nombreSala] = {
    nombre: nombreSala,
    jugadores: [jugador],
    puntajes: {},
    preguntas: []
  };

  res.json({
    ok: true,
    mensaje: "Sala creada correctamente",
    sala: salas[nombreSala]
  });
});

app.get("/api/sala/:nombre", (req, res) => {
  const sala = salas[req.params.nombre];

  if (!sala) {
    return res.status(404).json({ error: "Sala no encontrada" });
  }

  res.json(sala);
});

module.exports = app;
