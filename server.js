const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname)));

const rooms = {};

io.on('connection', (socket) => {
  console.log('🔵 User Connected:', socket.id);

  // --- ROOM CREATION ---
  socket.on('create_room', (username) => {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    socket.join(roomId);
    rooms[roomId] = {
      players: [{ id: socket.id, username, isReady: false }],
      turnIndex: 0,
      startTurnIndex: 0,
      gameState: 'waiting',
      winners: [],
      winTimer: null
    };
    socket.emit('room_created', roomId);
    io.to(roomId).emit('update_players', rooms[roomId].players);
    io.to(roomId).emit('update_turn', rooms[roomId].players[0].username);
  });

  // --- JOIN ROOM ---
  socket.on('join_room', ({ username, roomId }) => {
    const room = rooms[roomId];

    if (room) {
      // Prevent joining if game already started
      if (room.gameState === 'playing') {
          socket.emit('error_message', 'Game already started! Please wait for the next round.');
          return;
      }

      socket.join(roomId);
      room.players.push({ id: socket.id, username, isReady: false });
      
      // Notify all players in room
      io.to(roomId).emit('update_players', room.players);
      socket.to(roomId).emit('player_joined', { username });
      
      // Sync turn info
      if(room.players[room.turnIndex]) {
          io.to(roomId).emit('update_turn', room.players[room.turnIndex].username);
      }
    } else {
      socket.emit('error_message', 'Room not found!');
    }
  });

  // --- GAMEPLAY: CLICK NUMBER ---
  socket.on('click_number', ({ roomId, number }) => {
    const room = rooms[roomId];
    if (!room || room.gameState !== 'playing') return;

    const currentPlayer = room.players[room.turnIndex];
    if (!currentPlayer || socket.id !== currentPlayer.id) return;

    // Advance turn (Round Robin)
    room.turnIndex = (room.turnIndex + 1) % room.players.length;
    const nextPlayer = room.players[room.turnIndex];

    if(nextPlayer){
        io.to(roomId).emit('number_marked', { number, nextTurnUser: nextPlayer.username });
    }
  });

  // --- GAMEPLAY: WIN CONDITION ---
  socket.on('bingo_win', ({ roomId, username }) => {    
    const room = rooms[roomId];
    if (!room) return;
    
    if (!room.winners.includes(username)) {
      room.winners.push(username);
    }
    // Small buffer to allow ties (100ms is imperceptible but allows concurrent wins)
    if (!room.winTimer) {
      room.winTimer = setTimeout(() => {
        io.to(roomId).emit('game_over', {winnerList: room.winners});
        room.winners = [];
        room.winTimer = null;
      }, 100); 
    }
  });

  // --- GAMEPLAY: RESET ---
  socket.on('reset_game', (roomId) => {
    const room = rooms[roomId];
    if (room) {
      room.gameState = 'waiting';
      // Rotate who starts next game for fairness
      room.startTurnIndex = (room.startTurnIndex + 1) % room.players.length;
      room.turnIndex = room.startTurnIndex;
      room.players.forEach(p => p.isReady = false);
      
      if(room.players[room.startTurnIndex]){
          const nextStarterName = room.players[room.startTurnIndex].username;
          io.to(roomId).emit('game_reset', { startTurn: nextStarterName });
      }
    }
  });

  // --- PRE-GAME: READY CHECK ---
  socket.on('player_ready', (roomId) => {
    const room = rooms[roomId];
    if (room) {
      const player = room.players.find(p => p.id === socket.id);
      if (player) player.isReady = true;

      // Debug Log
      console.log(`Room ${roomId}: ${room.players.filter(p=>p.isReady).length}/${room.players.length} ready`);

      // Start if everyone is ready
      if (room.players.every(p => p.isReady) && room.players.length > 1) {
        console.log(`🚀 Game Starting in Room ${roomId}`);
        room.gameState = 'playing';
        room.turnIndex = room.startTurnIndex;
        const firstPlayer = room.players[room.turnIndex].username;
        io.to(roomId).emit('game_started', { startTurn: firstPlayer });
      }
    }
  });

  // --- DISCONNECT / LEAVE LOGIC ---
  function removePlayer(socketId) {
    console.log(`🔍 Searching for player ${socketId} to remove...`);
    
    // Find the room the player is in
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const playerIndex = room.players.findIndex(p => p.id === socketId);

      if (playerIndex !== -1) {
        console.log(`✅ Found player in Room ${roomId} at index ${playerIndex}`);
        
        const removedPlayer = room.players[playerIndex];
        room.players.splice(playerIndex, 1);

        // Notify remaining players
        io.to(roomId).emit('player_left', { 
            username: removedPlayer.username, 
            players: room.players 
        });

        // Cleanup empty room
        if (room.players.length === 0) {
          console.log(`❌ Room ${roomId} empty. Deleted.`);
          delete rooms[roomId];
        } else {
          // Update player list for others
          io.to(roomId).emit('update_players', room.players);
          
          // Fix turn index if user left mid-game
          if (room.gameState === 'playing') {
             if (playerIndex < room.turnIndex) {
               room.turnIndex--;
             }
             if (room.turnIndex < 0) room.turnIndex = 0;
             room.turnIndex = room.turnIndex % room.players.length;

             const nextPlayer = room.players[room.turnIndex];
             if(nextPlayer) io.to(roomId).emit('update_turn', nextPlayer.username);
          }
        }
        break; 
      }
    }
  }

  socket.on('leave_room', () => {
      removePlayer(socket.id);
  });

  socket.on('disconnect', () => {
    console.log('🔴 Disconnected:', socket.id);
    removePlayer(socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));