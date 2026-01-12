console.log("Bingo Game Loaded");
const socket = io();

// --- 1. DOM ELEMENTS ---
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

// Game Elements
let boxtexts = document.querySelectorAll('.boxtext'); // The Numbers (Spans)
let boxes = document.querySelectorAll('.box');        // The Cells (Divs)
let letters = document.querySelectorAll('.letter');
let random = document.getElementById('random');
let manual = document.getElementById('manual');
let reset = document.getElementById('reset');

// Info Elements
let displayRoomID = document.getElementById('displayRoomID');
let playerCountSpan = document.getElementById('playerCount');
let turnIndicator = document.getElementById('turnIndicator');

// Modals
let winModal = document.getElementById('winModal');
let closeModal = document.getElementById('closeModal');
let lossModal = document.getElementById('lossModal');
let closeLossModal = document.getElementById('closeLossModal');
let winnerNameText = document.getElementById('winnerNameText'); // Ensure this ID exists in HTML

// --- 2. STATE ---
let arr = Array.from({length: boxtexts.length}, (v, i) => i + 1);
let isLocked = false;
let isMultiplayer = false;
let isMyTurn = true; 
let myUsername = ""; 
let gameEnded = false; // NEW: Prevents multiple alerts
let currentRoomId = null;

const winPatterns = [
    [0, 1, 2, 3, 4], [5, 6, 7, 8, 9], [10, 11, 12, 13, 14], 
    [15, 16, 17, 18, 19], [20, 21, 22, 23, 24], 
    [0, 5, 10, 15, 20], [1, 6, 11, 16, 21], [2, 7, 12, 17, 22], 
    [3, 8, 13, 18, 23], [4, 9, 14, 19, 24], 
    [0, 6, 12, 18, 24], [4, 8, 12, 16, 20] 
];

// --- 3. SOCKET LISTENERS ---

socket.on('room_created', (roomId) => {
    setupGame(roomId);
});

socket.on('update_players', (playersArray) => {
    playerCountSpan.innerText = `Players: ${playersArray.length}`;
});

socket.on('update_turn', (username) => {
    updateTurnUI(username);
});

socket.on('number_marked', (data) => {
    const { number, nextTurnUser } = data;

    // Mark the box
    boxes.forEach(box => {
        // Use trim() to ensure no extra whitespace causes issues
        if (box.innerText.trim() == number) {
            box.classList.add('marked');
        }
    });

    checkWin(); // Check if *I* won due to this move (rare, but possible)
    updateTurnUI(nextTurnUser);
});

socket.on('game_over', (data) => {
    const { winner } = data;
    gameEnded = true; // Stop the game for everyone
    isLocked = false;

    if (winner === myUsername) {
        // I won (Handled locally, but ensure modal is up)
        winModal.classList.remove('hidden');
    } else {
        // Someone else won
        winnerNameText.innerText = `${winner} Won!`;
        lossModal.classList.remove('hidden');
    }
});

// FIX: Reset Listener
socket.on('game_reset', (data) => {
    const { startTurn } = data;
    alert("Host has restarted the game!");
    performSoftReset();
    updateTurnUI(startTurn);
});

socket.on('error_message', (msg) => alert(msg));


// --- 4. NAVIGATION & LOGIC ---

function setupGame(roomId) {
    currentRoomId = roomId;
    displayRoomID.innerText = `Room: ${roomId}`; // Update text
    displayRoomID.style.cursor = "pointer"; // Make it look clickable
    displayRoomID.title = "Click to copy Room ID";
    
    // Add Click Listener
    displayRoomID.onclick = () => {
        navigator.clipboard.writeText(roomId).then(() => {
            alert("Room ID copied to clipboard!");
        });
    };

    showView('game');
    isMultiplayer = true;
    gameEnded = false;
}

function updateTurnUI(username) {
    if (username === myUsername) {
        isMyTurn = true;
        turnIndicator.innerText = "YOUR TURN";
        turnIndicator.style.backgroundColor = "#4ade80"; // Green
    } else {
        isMyTurn = false;
        turnIndicator.innerText = `${username}'s Turn`;
        turnIndicator.style.backgroundColor = "#fbbf24"; // Yellow
    }
}

btns.create.addEventListener('click', () => {
    myUsername = inputs.username.value;
    if(!myUsername) return alert("Enter Name");
    socket.emit('create_room', myUsername);
});

btns.join.addEventListener('click', () => {
    myUsername = inputs.username.value;
    const room = inputs.room.value.trim().toUpperCase();
    if(!myUsername || !room) return alert("Enter Name & Room ID");
    
    socket.emit('join_room', { username: myUsername, roomId: room });
    setupGame(room);
});

btns.single.addEventListener('click', () => {
    if(inputs.username.value === "") return alert("Enter Name");
    myUsername = inputs.username.value;
    showView('game');
    displayRoomID.innerText = "Mode: Single Player";
    isMultiplayer = false;
    isMyTurn = true;
    turnIndicator.innerText = "Your Turn";
});

btns.multi.addEventListener('click', () => {
    if(inputs.username.value === "") return alert("Enter Name");
    showView('room');
});

if(btns.back) btns.back.addEventListener('click', () => showView('landing'));

btns.gameBack.addEventListener('click', () => {
    if (isLocked && !confirm("Leave game?")) return;
    performSoftReset(); 
    showView('landing');
    // Note: In a real app, you'd emit 'leave_room' here
});

// --- 5. GAMEPLAY ---

function checkWin() {
    if (gameEnded) return; // Stop checking if game is over

    let lineCompleted = 0;
    for (let pattern of winPatterns) {
        const isWon = pattern.every(index => boxes[index].classList.contains('marked'));
        if (isWon) lineCompleted++;
    }

    letters.forEach((letter, index) => {
        index < lineCompleted ? letter.classList.add('active') : letter.classList.remove('active');
    });

    if (lineCompleted === 5) {
        gameEnded = true;
        isLocked = false;
        
        triggerConfetti();
        winModal.classList.remove('hidden');

        if (isMultiplayer) {
            const roomId = displayRoomID.innerText.replace('Room: ', '');
            socket.emit('bingo_win', { roomId: roomId, username: myUsername });
        }
    }
}

// Click Logic
boxes.forEach(box => {
    box.addEventListener('click', () => {
        if (!isLocked || gameEnded) return;
        if (box.classList.contains('marked')) return;

        if (isMultiplayer) {
            if (!isMyTurn) return alert("Wait for your turn!");
            const roomId = displayRoomID.innerText.replace('Room: ', '');
            socket.emit('click_number', { roomId: currentRoomId, number: box.innerText });
        } else {
            box.classList.add('marked');
            checkWin();
        }
    });
});

// --- 6. RESET LOGIC (THE FIX) ---

function performSoftReset() {
    isLocked = false;
    gameEnded = false;
    
    // FIX: Clear the SPAN text, not the DIV text
    boxtexts.forEach(span => {
        span.innerText = '';
    });

    // Reset Box Colors/Classes
    boxes.forEach(box => {
        box.style.backgroundColor = '';
        box.classList.remove('marked');
    });

    letters.forEach(l => l.classList.remove('active'));
    winModal.classList.add('hidden');
    lossModal.classList.add('hidden');
    
    manual.innerText = "Manual/Enter";
    manual.style.backgroundColor = "var(--primary-blue)";
    
    // Re-initialize array for randomizer
    arr = Array.from({length: boxtexts.length}, (v, i) => i + 1);
}

reset.addEventListener('click', () => {
    if (isMultiplayer) {
        // Use the variable, NOT innerText.replace
        if(confirm("Reset game for ALL players?")) {
            socket.emit('reset_game', currentRoomId);
        }
    } else {
        performSoftReset();
        isMyTurn = true;
        turnIndicator.innerText = "Your Turn";
    }
});

// Randomize & Manual
random.addEventListener('click', () => {
    if (isLocked) return;
    for (let i = arr.length - 1; i > 0; i--) {
        let j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    for (let i = 0; i < arr.length; i++) {
        boxtexts[i].innerText = arr[i];
    }
});

manual.addEventListener('click', () => {
    if (boxtexts[0].innerText === "") return alert("Fill boxes first!");
    isLocked = true;
    manual.innerText = "Game Started!";
    manual.style.backgroundColor = "var(--marked-color)";
});

function showView(viewName) {
    views.landing.classList.add('hidden');
    views.room.classList.add('hidden');
    views.game.classList.add('hidden');
    views[viewName].classList.remove('hidden');
}

function triggerConfetti() {
    confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, colors: ['#0ea5e9', '#f59e0b', '#ffffff'] });
}
closeModal.addEventListener('click', () => winModal.classList.add('hidden'));
closeLossModal.addEventListener('click', () => lossModal.classList.add('hidden'));

// Prevent accidental refresh/back button
window.addEventListener('beforeunload', (e) => {
    if (isMultiplayer && !gameEnded) {
        e.preventDefault();
        e.returnValue = ''; // Shows standard browser warning
    }
});