const express = require("express");
const path = require("path");

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/test", (req, res) => {
  res.json({ ok: true, mensaje: "Servidor funcionando" });
});

module.exports = app;
