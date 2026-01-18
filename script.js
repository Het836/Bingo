console.log("Bingo Game Loaded");
const socket = io();

// --- PWA Service Worker ---
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
    .then(() => console.log('SW Registered'))
    .catch((err) => console.log('SW Failed', err));
}

// --- Elements ---
const views = {
  landing: document.getElementById('landingPage'),
  room: document.getElementById('roomPage'),
  game: document.getElementById('gameArea')
};
const inputs = {
  username: document.getElementById('username'),
  room: document.getElementById('roomInput')
};
const btns = {
  single: document.getElementById('btnSingle'),
  multi: document.getElementById('btnMulti'),
  create: document.getElementById('btnCreate'),
  join: document.getElementById('btnJoin'),
  back: document.getElementById('btnBack'),
  gameBack: document.getElementById('btnGameBack')
};
const sounds = {
  start: new Audio('sounds/game-start.wav'),
  click: new Audio('sounds/game-click.mp3'),
  win: new Audio('sounds/small-win.wav'),
  bingo: new Audio('sounds/big-win.wav'),
  buzz: new Audio('sounds/buzz.mp3')
};

let boxtexts = document.querySelectorAll('.boxtext');
let boxes = document.querySelectorAll('.box');
let letters = document.querySelectorAll('.letter');
let random = document.getElementById('random');
let manual = document.getElementById('manual');
let reset = document.getElementById('reset');

let displayRoomID = document.getElementById('displayRoomID');
let playerCountSpan = document.getElementById('playerCount');
let turnIndicator = document.getElementById('turnIndicator');

let winModal = document.getElementById('winModal');
let closeModal = document.getElementById('closeModal');
let lossModal = document.getElementById('lossModal');
let closeLossModal = document.getElementById('closeLossModal');
let winnerNameText = document.getElementById('winnerNameText');
let tieModel = document.getElementById('tieModal');
let tieNameText = document.getElementById('tieNameText');
let closeTieModal = document.getElementById('closeTieModal');
let noneModal = document.getElementById('noneModal');

// --- State ---
let arr = Array.from({ length: 25 }, (_, i) => i + 1);
let isLocked = false;
let isMultiplayer = false;
let isMyTurn = true;
let myUsername = "";
let gameEnded = false;
let currentRoomId = null;
let previousLineCount = 0;
let isGameActive = false;

const winPatterns = [
  [0, 1, 2, 3, 4], [5, 6, 7, 8, 9], [10, 11, 12, 13, 14], [15, 16, 17, 18, 19], [20, 21, 22, 23, 24], 
  [0, 5, 10, 15, 20], [1, 6, 11, 16, 21], [2, 7, 12, 17, 22], [3, 8, 13, 18, 23], [4, 9, 14, 19, 24], 
  [0, 6, 12, 18, 24], [4, 8, 12, 16, 20]
];

// --- Socket Listeners ---
socket.on('room_created', (roomId) => setupGame(roomId));
socket.on('update_players', (players) => playerCountSpan.innerText = `Players: ${players.length}`);
socket.on('update_turn', (username) => updateTurnUI(username));
socket.on('error_message', (msg) => alert(msg));

socket.on('number_marked', ({ number, nextTurnUser }) => {
  boxes.forEach(box => {
    if (box.innerText.trim() == number) box.classList.add('marked');
  });
  playSound('click');
  checkWin();
  updateTurnUI(nextTurnUser);
});

socket.on('game_over', ({ winnerList }) => {
  gameEnded = true;
  isLocked = false;

    console.log("winnerList:",winnerList);
  //FORCE HIDE ALL MODALS FIRST (Fixes overlapping issues)
  winModal.classList.add('hidden');
  lossModal.classList.add('hidden');
  tieModel.classList.add('hidden');
  noneModal.classList.add('hidden');
  
  if(winnerList.length > 1){
    if(winnerList.includes(myUsername)){
        // show tie model
        const remainingNames = winnerList.filter(name => name !== myUsername);
        tieNameText.innerText = "You tied with " + remainingNames.join(",'");
        tieModel.classList.remove('hidden');
        triggerConfetti();
        playSound('bingo');
    }
    else{
        winnerNameText.innerText = `${winnerList.join(" & ")} Won!`;
        lossModal.classList.remove('hidden');
    }
  }
  else{
      if (winnerList.includes(myUsername)) {
        winModal.classList.remove('hidden');
        triggerConfetti();
        playSound('bingo');
      } else {
        winnerNameText.innerText = `${winnerList[0]} Won!`;
        lossModal.classList.remove('hidden');
      }
  }
});

socket.on('game_reset', ({ startTurn }) => {
  alert("Host has restarted the game!");
  performSoftReset();
  updateTurnUI(startTurn);
});

socket.on('game_started', ({ startTurn }) => {
  isGameActive = true;
  playSound('start');
  manual.innerText = "Game On!";
  manual.style.backgroundColor = "var(--marked-color)";
  updateTurnUI(startTurn);
});

// --- Logic ---
function setupGame(roomId) {
  currentRoomId = roomId;
  displayRoomID.innerText = `Room: ${roomId}`;
  displayRoomID.style.cursor = "pointer";
  displayRoomID.title = "Click to copy";
  displayRoomID.onclick = () => {
    navigator.clipboard.writeText(roomId).then(() => alert("Copied!"));
  };
  showView('game');
  isMultiplayer = true;
  gameEnded = false;
}

function updateTurnUI(username) {
  if (username === myUsername) {
    isMyTurn = true;
    turnIndicator.innerText = "YOUR TURN";
    turnIndicator.style.backgroundColor = "#4ade80";
  } else {
    isMyTurn = false;
    turnIndicator.innerText = `${username}'s Turn`;
    turnIndicator.style.backgroundColor = "#fbbf24";
  }
}

function playSound(type) {
  if (sounds[type]) {
    sounds[type].currentTime = 0;
    sounds[type].play().catch(e => console.log("Audio failed:", e));
  }
}

// --- Event Listeners ---
btns.create.addEventListener('click', () => {
  myUsername = inputs.username.value;
  if (!myUsername) return alert("Enter Name");
  socket.emit('create_room', myUsername);
});

btns.join.addEventListener('click', () => {
  myUsername = inputs.username.value;
  const room = inputs.room.value.trim().toUpperCase();
  if (!myUsername || !room) return alert("Enter Name & Room ID");
  socket.emit('join_room', { username: myUsername, roomId: room });
  setupGame(room);
});

btns.single.addEventListener('click', () => {
  if (!inputs.username.value) return alert("Enter Name");
  myUsername = inputs.username.value;
  showView('game');
  displayRoomID.innerText = "Mode: Single Player";
  isMultiplayer = false;
  isMyTurn = true;
  isGameActive = true;
  turnIndicator.innerText = "Your Turn";
  playSound('start');
});

btns.multi.addEventListener('click', () => {
  if (!inputs.username.value) return alert("Enter Name");
  showView('room');
});

if (btns.back) btns.back.addEventListener('click', () => showView('landing'));

btns.gameBack.addEventListener('click', () => {
  if (isLocked && !confirm("Leave game?")) return;
  performSoftReset();
  showView('landing');
});

// --- Gameplay ---
function checkWin() {
  if (gameEnded) return;
  let lineCompleted = 0;
  
  winPatterns.forEach(pattern => {
    if (pattern.every(idx => boxes[idx].classList.contains('marked'))) lineCompleted++;
  });

  letters.forEach((letter, index) => {
    if (index < lineCompleted) letter.classList.add('active');
    else letter.classList.remove('active');
  });

  if (lineCompleted > previousLineCount && lineCompleted < 5) playSound('win');
  previousLineCount = lineCompleted;

  if (lineCompleted === 5) {
    gameEnded = true;
    isLocked = false;
    noneModal.classList.remove('hidden');
    if (isMultiplayer){
      socket.emit('bingo_win', { roomId: currentRoomId, username: myUsername });
    } 
    else{
      noneModal.classList.add('hidden');
      winModal.classList.remove('hidden');
      triggerConfetti();
      playSound('bingo');
    }
  }
}

boxes.forEach(box => {
  box.addEventListener('click', () => {
    if (!isLocked || gameEnded || box.classList.contains('marked')) return;
    
    if (isMultiplayer) {
      if (!isGameActive) return alert("Wait for others...");
      if (!isMyTurn) { playSound('buzz'); return alert("Wait for your turn!"); }
      socket.emit('click_number', { roomId: currentRoomId, number: box.innerText });
    } else {
      playSound('click');
      box.classList.add('marked');
      checkWin();
    }
  });
});

function performSoftReset() {
  isLocked = false; gameEnded = false; previousLineCount = 0;
  boxtexts.forEach(span => span.innerText = '');
  boxes.forEach(box => { box.style.backgroundColor = ''; box.classList.remove('marked'); });
  letters.forEach(l => l.classList.remove('active'));
  winModal.classList.add('hidden');
  lossModal.classList.add('hidden');
  manual.innerText = "Enter";
  manual.style.backgroundColor = "var(--primary-blue)";
  arr = Array.from({ length: 25 }, (_, i) => i + 1);
}

reset.addEventListener('click', () => {
  if (isMultiplayer) {
    if (confirm("Reset game for ALL players?")) socket.emit('reset_game', currentRoomId);
  } else {
    performSoftReset();
    isMyTurn = true;
    turnIndicator.innerText = "Your Turn";
  }
});

random.addEventListener('click', () => {
  if (isLocked) return;
  for (let i = arr.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  boxtexts.forEach((span, i) => span.innerText = arr[i]);
});

manual.addEventListener('click', () => {
  if (boxtexts[0].innerText === "") return alert("Fill boxes first!");
  isLocked = true;
  if (isMultiplayer) {
    manual.innerText = "Getting Start...";
    manual.style.backgroundColor = "grey";
    socket.emit('player_ready', currentRoomId);
  } else {
    manual.innerText = "Game Started!";
    manual.style.backgroundColor = "var(--marked-color)";
    isGameActive = true;
  }
});

function showView(viewName) {
  Object.values(views).forEach(v => v.classList.add('hidden'));
  views[viewName].classList.remove('hidden');
}

function triggerConfetti() {
  confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, colors: ['#0ea5e9', '#f59e0b', '#ffffff'] });
}

closeModal.addEventListener('click', () => winModal.classList.add('hidden'));
closeLossModal.addEventListener('click', () => lossModal.classList.add('hidden'));
closeTieModal.addEventListener('click',() => tieModel.classList.add('hidden'));

window.addEventListener('beforeunload', (e) => {
  if (isMultiplayer && !gameEnded) { e.preventDefault(); e.returnValue = ''; }
});