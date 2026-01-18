const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname)));

// Game State: rooms[roomId] = { players: [], turnIndex, startTurnIndex, gameState }
const rooms = {};

io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  socket.on("create_room", (username) => {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    socket.join(roomId);

    rooms[roomId] = {
      players: [{ id: socket.id, username, isReady: false }],
      turnIndex: 0,
      startTurnIndex: 0, // Tracks who starts the match
      gameState: "waiting",
      winners: [],
      winTimer: null,
    };

    socket.emit("room_created", roomId);
    io.to(roomId).emit("update_players", rooms[roomId].players);
    io.to(roomId).emit("update_turn", rooms[roomId].players[0].username);
  });

  socket.on("join_room", ({ username, roomId }) => {
    const room = io.sockets.adapter.rooms.get(roomId);
    if (room && rooms[roomId]) {
      socket.join(roomId);
      rooms[roomId].players.push({ id: socket.id, username, isReady: false });

      io.to(roomId).emit("update_players", rooms[roomId].players);
      const currentTurnUser =
        rooms[roomId].players[rooms[roomId].turnIndex].username;
      io.to(roomId).emit("update_turn", currentTurnUser);
    } else {
      socket.emit("error_message", "Room not found!");
    }
  });

  socket.on("click_number", ({ roomId, number }) => {
    const room = rooms[roomId];
    if (!room || room.gameState !== "playing") return;

    const currentPlayer = room.players[room.turnIndex];
    if (socket.id !== currentPlayer.id) return;

    // Advance turn (Round Robin)
    room.turnIndex = (room.turnIndex + 1) % room.players.length;
    const nextPlayer = room.players[room.turnIndex];

    io.to(roomId).emit("number_marked", {
      number,
      nextTurnUser: nextPlayer.username,
    });
  });

  socket.on("bingo_win", ({ roomId, username }) => {
    const room = rooms[roomId];
    if (!room) {
      return;
    }
    if (!room.winners.includes(username)) {
      room.winners.push(username);
    }
    if (!room.winTimer) {
      room.winTimer = setTimeout(() => {
        io.to(roomId).emit("game_over", { winnerList: room.winners });

        room.winners = [];
        room.winTimer = null;
      }, 500);
    }
  });

  socket.on("reset_game", (roomId) => {
    const room = rooms[roomId];
    if (room) {
      room.gameState = "waiting";
      // Rotate starter for the next game (Fair Play)
      room.startTurnIndex = (room.startTurnIndex + 1) % room.players.length;
      room.turnIndex = room.startTurnIndex;

      room.players.forEach((p) => (p.isReady = false));
      const nextStarterName = room.players[room.startTurnIndex].username;

      io.to(roomId).emit("game_reset", { startTurn: nextStarterName });
    } else {
      socket.emit("error_message", "Room invalid.");
    }
  });

  socket.on("player_ready", (roomId) => {
    const room = rooms[roomId];
    if (room) {
      const player = room.players.find((p) => p.id === socket.id);
      if (player) player.isReady = true;

      // Check if ALL players are ready
      if (room.players.every((p) => p.isReady) && room.players.length > 1) {
        room.gameState = "playing";
        room.turnIndex = room.startTurnIndex; // Respect the turn rotation
        const firstPlayer = room.players[room.turnIndex].username;
        io.to(roomId).emit("game_started", { startTurn: firstPlayer });
      }
    }
  });

  socket.on("disconnect", () => console.log("Disconnected:", socket.id));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`),
);
