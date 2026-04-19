let preguntas = [
  { pregunta: "¿Quién ama más?", respuesta: "" },
  { pregunta: "¿Quién fue el primero en enamorarse?", respuesta: "" }
];

export default function handler(req, res) {
  if (req.method === "GET") {
    res.status(200).json(preguntas);
  }

  if (req.method === "POST") {
    const { pregunta, respuesta } = req.body;
    preguntas.push({ pregunta, respuesta });
    res.status(200).json({ mensaje: "Guardado" });
  }
}
