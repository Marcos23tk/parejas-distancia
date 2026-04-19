const state = {
  room: null,
  playerId: localStorage.getItem('playerId') || '',
  roomCode: localStorage.getItem('roomCode') || ''
};

const $ = (id) => document.getElementById(id);

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Error inesperado');
  return data;
}

async function init() {
  try {
    const health = await api('/api/health');
    $('storageMode').textContent = `Almacenamiento: ${health.mode === 'github' ? 'GitHub' : 'Local'}`;
  } catch {
    $('storageMode').textContent = 'Servidor no disponible';
  }

  if (state.roomCode) {
    try {
      const room = await api(`/api/rooms/${state.roomCode}`);
      state.room = room;
      renderGame();
    } catch {
      localStorage.removeItem('roomCode');
      localStorage.removeItem('playerId');
    }
  }
}

$('createBtn').addEventListener('click', async () => {
  const playerName = $('createName').value.trim();
  const theme = $('theme').value;
  if (!playerName) return setStatus('Escribe tu nombre para crear la sala.');

  try {
    const room = await api('/api/rooms', {
      method: 'POST',
      body: JSON.stringify({ playerName, theme })
    });
    const me = room.players[0];
    state.room = room;
    state.playerId = me.id;
    state.roomCode = room.roomCode;
    saveSession();
    renderGame();
    setStatus(`Sala creada: ${room.roomCode}. Comparte este codigo con tu pareja.`);
  } catch (error) {
    setStatus(error.message);
  }
});

$('joinBtn').addEventListener('click', async () => {
  const playerName = $('joinName').value.trim();
  const roomCode = $('joinCode').value.trim().toUpperCase();
  if (!playerName || !roomCode) return setStatus('Completa nombre y codigo de sala.');

  try {
    const room = await api(`/api/rooms/${roomCode}/join`, {
      method: 'POST',
      body: JSON.stringify({ playerName })
    });
    const me = room.players.find((p) => p.name === playerName) || room.players[1];
    state.room = room;
    state.playerId = me.id;
    state.roomCode = room.roomCode;
    saveSession();
    renderGame();
    setStatus(`Te uniste a la sala ${room.roomCode}.`);
  } catch (error) {
    setStatus(error.message);
  }
});

$('refreshBtn').addEventListener('click', refreshRoom);
$('nextBtn').addEventListener('click', nextRound);

function saveSession() {
  localStorage.setItem('playerId', state.playerId);
  localStorage.setItem('roomCode', state.roomCode);
}

function setStatus(message) {
  $('setupStatus').textContent = message;
}

async function refreshRoom() {
  if (!state.roomCode) return;
  try {
    state.room = await api(`/api/rooms/${state.roomCode}`);
    renderGame();
  } catch (error) {
    alert(error.message);
  }
}

function renderGame() {
  $('setupCard').classList.add('hidden');
  $('gameCard').classList.remove('hidden');
  $('roomTitle').textContent = `Sala ${state.room.roomCode}`;
  $('roomMeta').textContent = `Tema: ${capitalize(state.room.theme)} · Ronda ${Math.min(state.room.round, state.room.maxRounds)} de ${state.room.maxRounds}`;
  renderPlayers();
  renderCurrentState();
  renderTurnCard();
  renderHistory();
  $('nextBtn').classList.toggle('hidden', state.room.phase !== 'round_result');
}

function renderPlayers() {
  $('playersBoard').innerHTML = state.room.players.map((player) => `
    <div class="player ${state.room.activePlayerId === player.id ? 'active' : ''}">
      <div><strong>${escapeHtml(player.name)}</strong></div>
      <div class="score">${player.score} pts</div>
      <div>${player.id === state.playerId ? 'Eres tu' : 'Tu pareja'}</div>
    </div>
  `).join('');
}

function renderCurrentState() {
  const me = state.room.players.find((p) => p.id === state.playerId);
  const asker = state.room.players.find((p) => p.id === state.room.currentTurn.askerId);
  const guesser = state.room.players.find((p) => p.id === state.room.currentTurn.guesserId);

  let html = `
    <p><span class="highlight">Fase:</span> ${labelPhase(state.room.phase)}</p>
    <p><span class="highlight">Te toca a ti:</span> ${state.room.activePlayerId === state.playerId ? 'Si' : 'No'}</p>
    <p><span class="highlight">Quien responde:</span> ${asker ? escapeHtml(asker.name) : '-'}</p>
    <p><span class="highlight">Quien adivina:</span> ${guesser ? escapeHtml(guesser.name) : '-'}</p>
  `;

  if (state.room.phase === 'finished') {
    const sorted = [...state.room.players].sort((a, b) => b.score - a.score);
    html += `<p class="success">Ganador: ${escapeHtml(sorted[0].name)} con ${sorted[0].score} puntos.</p>`;
  }

  if (me) $('currentState').innerHTML = html;
}

function renderTurnCard() {
  const room = state.room;
  const turn = room.currentTurn;
  const meIsAsker = state.playerId === turn.askerId;
  const meIsGuesser = state.playerId === turn.guesserId;

  if (room.phase === 'waiting_player_2') {
    $('turnCard').innerHTML = `
      <div class="turn-box">
        <h3>Esperando a tu pareja</h3>
        <p>Comparte el codigo <strong>${room.roomCode}</strong> para que la otra persona se una.</p>
      </div>
    `;
    return;
  }

  if (room.phase === 'answering') {
    $('turnCard').innerHTML = `
      <div class="turn-box">
        <h3>Pregunta de la ronda</h3>
        <p>${escapeHtml(turn.question)}</p>
        ${meIsAsker ? `
          <label>Tu respuesta real</label>
          <textarea id="answerInput" rows="3" placeholder="Escribe tu respuesta"></textarea>
          <button onclick="sendAnswer()">Guardar respuesta</button>
        ` : `
          <p>Tu pareja esta respondiendo. Pulsa actualizar cuando termine.</p>
        `}
      </div>
    `;
    return;
  }

  if (room.phase === 'guessing') {
    $('turnCard').innerHTML = `
      <div class="turn-box">
        <h3>Hora de adivinar</h3>
        <p>${escapeHtml(turn.question)}</p>
        ${meIsGuesser ? `
          <label>Tu adivinanza</label>
          <textarea id="guessInput" rows="3" placeholder="Escribe lo que crees que respondio tu pareja"></textarea>
          <button onclick="sendGuess()">Enviar adivinanza</button>
        ` : `
          <p>Tu pareja esta intentando adivinar. Pulsa actualizar para ver el resultado.</p>
        `}
      </div>
    `;
    return;
  }

  if (room.phase === 'round_result') {
    const challengedName = turn.challengeFor === 'empate'
      ? 'Ambos'
      : escapeHtml(room.players.find((p) => p.id === turn.challengeFor)?.name || 'Jugador con menos puntos');

    $('turnCard').innerHTML = `
      <div class="turn-box">
        <h3>Resultado de la ronda</h3>
        <p><strong>Pregunta:</strong> ${escapeHtml(turn.question)}</p>
        <p><strong>Respuesta real:</strong> ${escapeHtml(turn.correctAnswer)}</p>
        <p><strong>Adivinanza:</strong> ${escapeHtml(turn.guess)}</p>
        <p class="${turn.result === 'correcto' ? 'success' : 'warning'}">Resultado: ${turn.result === 'correcto' ? 'Adivino correctamente' : 'No adivino correctamente'}</p>
        <p><strong>${challengedName}</strong> recibe:</p>
        <p class="highlight">${escapeHtml(turn.challengeText)}</p>
      </div>
    `;
    return;
  }

  if (room.phase === 'finished') {
    $('turnCard').innerHTML = `
      <div class="turn-box">
        <h3>Juego terminado</h3>
        <p>Gracias por jugar. Revisen el historial y vuelvan a crear otra sala si quieren seguir.</p>
      </div>
    `;
  }
}

function renderHistory() {
  if (!state.room.history.length) {
    $('historyList').innerHTML = '<p>Aun no hay rondas completadas.</p>';
    return;
  }

  $('historyList').innerHTML = [...state.room.history].reverse().map((item) => {
    const challenged = item.challengeFor === 'empate'
      ? 'Ambos'
      : state.room.players.find((p) => p.id === item.challengeFor)?.name || 'Jugador';

    return `
      <div class="history-item">
        <strong>Ronda ${item.round}</strong>
        <p><strong>Pregunta:</strong> ${escapeHtml(item.question)}</p>
        <p><strong>Respuesta:</strong> ${escapeHtml(item.correctAnswer)}</p>
        <p><strong>Adivinanza:</strong> ${escapeHtml(item.guess)}</p>
        <p><strong>Resultado:</strong> ${escapeHtml(item.result)}</p>
        <p><strong>Reto/Pregunta para:</strong> ${escapeHtml(challenged)}</p>
        <p><strong>Contenido:</strong> ${escapeHtml(item.challengeText)}</p>
        <p><strong>Puntajes:</strong> ${item.scores.map((s) => `${escapeHtml(s.name)} ${s.score}`).join(' · ')}</p>
      </div>
    `;
  }).join('');
}

async function sendAnswer() {
  const answer = $('answerInput')?.value.trim();
  if (!answer) return alert('Escribe una respuesta.');

  try {
    state.room = await api(`/api/rooms/${state.roomCode}/answer`, {
      method: 'POST',
      body: JSON.stringify({ playerId: state.playerId, answer })
    });
    renderGame();
  } catch (error) {
    alert(error.message);
  }
}

async function sendGuess() {
  const guess = $('guessInput')?.value.trim();
  if (!guess) return alert('Escribe tu adivinanza.');

  try {
    state.room = await api(`/api/rooms/${state.roomCode}/guess`, {
      method: 'POST',
      body: JSON.stringify({ playerId: state.playerId, guess })
    });
    renderGame();
  } catch (error) {
    alert(error.message);
  }
}

async function nextRound() {
  try {
    state.room = await api(`/api/rooms/${state.roomCode}/next`, {
      method: 'POST'
    });
    renderGame();
  } catch (error) {
    alert(error.message);
  }
}

function labelPhase(phase) {
  return {
    waiting_player_2: 'Esperando al segundo jugador',
    answering: 'Responder la pregunta',
    guessing: 'Adivinar la respuesta',
    round_result: 'Resultado de la ronda',
    finished: 'Juego terminado'
  }[phase] || phase;
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

window.sendAnswer = sendAnswer;
window.sendGuess = sendGuess;
init();
