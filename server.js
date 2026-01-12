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
            players: [{ id: socket.id, username: username }],
            turnIndex: 0 // First player starts
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
            rooms[roomId].players.push({ id: socket.id, username: username });

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