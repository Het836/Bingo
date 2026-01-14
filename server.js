const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname)));

// --- GAME STATE STORAGE ---
// rooms[roomId] = { players: [{id, username}], turnIndex: 0 }
const rooms = {}; 

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // 1. Create Room
    socket.on('create_room', (username) => {
        const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        socket.join(roomId);
        
        // Initialize Room State
        rooms[roomId] = {
            players: [{ id: socket.id, username: username, isReady: false }],
            turnIndex: 0, // First player starts
            gameState: 'waiting'
        };

        socket.emit('room_created', roomId);
        // Update player count/info immediately for the creator
        io.to(roomId).emit('update_players', rooms[roomId].players);
        io.to(roomId).emit('update_turn', rooms[roomId].players[0].username);
    });

    // 2. Join Room
    socket.on('join_room', (data) => {
        const { username, roomId } = data;
        const room = io.sockets.adapter.rooms.get(roomId);

        if (room && rooms[roomId]) {
            socket.join(roomId);
            
            // Add player to the list
            rooms[roomId].players.push({ id: socket.id, username: username, isReady: false });

            console.log(`${username} joined ${roomId}`);

            // Notify everyone of new player list & count
            io.to(roomId).emit('update_players', rooms[roomId].players);
            
            // Send current turn info to the new guy
            const currentTurnUser = rooms[roomId].players[rooms[roomId].turnIndex].username;
            io.to(roomId).emit('update_turn', currentTurnUser);

        } else {
            socket.emit('error_message', 'Room not found!');
        }
    });

    // 3. Handle Turns & Clicking
    socket.on('click_number', (data) => {
        const { roomId, number } = data;
        const roomState = rooms[roomId];
        
        if (!roomState) return;
        
        if(rooms[roomId].gameState != 'playing') return;
        
        // Validation: Is it actually this person's turn?
        const currentPlayer = roomState.players[roomState.turnIndex];
        if (socket.id !== currentPlayer.id) {
            return; // Ignore clicks if it's not their turn
        }

        // 1. Advance Turn Logic (Round Robin)
        roomState.turnIndex = (roomState.turnIndex + 1) % roomState.players.length;
        const nextPlayer = roomState.players[roomState.turnIndex];

        // 2. Broadcast Move AND Next Turn
        io.to(roomId).emit('number_marked', {
            number: number,
            nextTurnUser: nextPlayer.username
        });
    });

    // 4. Handle Winning
    socket.on('bingo_win', (data) => {
        const { roomId, username } = data;
        // Broadcast "Game Over" to everyone
        io.to(roomId).emit('game_over', { winner: username });
    });

    // ... other events ...

    // 5. Handle Game Reset (Rematch)
    socket.on('reset_game', (roomId) => {
        // Debug Log: Check if server hears the click
        console.log(`Reset requested for room: ${roomId}`);

        if (rooms[roomId]) {
            rooms[roomId].turnIndex = 0;
            const firstPlayer = rooms[roomId].players[0].username;

            io.to(roomId).emit('game_reset', { startTurn: firstPlayer });
        } else {
            // NEW: Tell client the room is dead
            socket.emit('error_message', 'Room invalid or expired (Server restarted). Please reload page.');
        }
    });

    // Handle player ready
    socket.on('player_ready', (roomId) => {
        // Step A: Get the specific room object using the ID
        const roomState = rooms[roomId];
        // Safety check: Does the room exist?
        if(roomState){
            // Step B: Find the specific player who clicked the button
            // We search the 'players' array for the one matching 'socket.id'
            const player = roomState.players.find(p => p.id === socket.id);

            // If found, mark ONLY that player as ready
            if(player){
                player.isReady = true;
            }

            // Step C: Check if EVERYONE in that room is ready
            // .every() returns true only if ALL items match the condition
            const allReady = roomState.players.every(p => p.isReady);

            // Step D: Start Game if everyone is ready (and enough players exist)
            if(allReady && roomState.players.length>1){
                roomState.gameState = 'playing' // Unlock the server side

                // Reset turns to 0 (start from beginning)
                roomState.turnIndex = 0;
                const firstPlayer = roomState.players[0].username;

                // Tell everyone: "GO!"
                io.to(roomId).emit('game_started', {startTurn: firstPlayer});
            }
        }
    })

    // ... disconnect event ...

    socket.on('disconnect', () => {
        // Cleanup logic would go here (removing player from array)
        // For now, we keep it simple.
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});