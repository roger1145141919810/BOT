const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const engine = require('./game/engine');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, '..', 'public')));

const rooms = {}; // { roomId: { players: [{name,socketId}], game: {...} } }

io.on('connection', socket => {
  console.log('connect', socket.id);

  socket.on('create_room', ({ roomId, name }) => {
    if (!roomId) return socket.emit('error_msg', 'roomId required');
    if (rooms[roomId]) return socket.emit('error_msg', 'Room exists');
    rooms[roomId] = { players: [], game: null };
    socket.join(roomId);
    rooms[roomId].players.push({ name: name || 'Player', socketId: socket.id });
    io.to(roomId).emit('room_update', rooms[roomId].players.map(p => ({ name: p.name })));
  });

  socket.on('join_room', ({ roomId, name }) => {
    const room = rooms[roomId];
    if (!room) return socket.emit('error_msg', 'Room not found');
    socket.join(roomId);
    room.players.push({ name: name || 'Player', socketId: socket.id });
    io.to(roomId).emit('room_update', room.players.map(p => ({ name: p.name })));
  });

  socket.on('start_game', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    const players = room.players;
    const deck = engine.generateDeck();
    const sh = engine.shuffle(deck);
    const hands = engine.deal(sh, players.length);
    room.game = { hands, turn: 0, lastPlay: null, deck: sh };
    // private deal
    room.players.forEach((p, idx) => {
      io.to(p.socketId).emit('deal', hands[idx]);
    });
    io.to(roomId).emit('game_start', { players: room.players.map(p => ({ name: p.name })) });
    // tell first player it's their turn
    io.to(room.players[0].socketId).emit('your_turn');
  });

  socket.on('play_cards', ({ roomId, cards }) => {
    const room = rooms[roomId];
    if (!room || !room.game) return;
    const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
    if (playerIndex !== room.game.turn) return socket.emit('error_msg', 'Not your turn');
    // NOTE: 目前伺服端沒有完整牌型合法性判定，先做移除與廣播（之後補）
    const hand = room.game.hands[playerIndex];
    room.game.hands[playerIndex] = hand.filter(h => !cards.find(c => c.id === h.id));
    room.game.lastPlay = { playerId: socket.id, cards };
    io.to(roomId).emit('play_made', { playerId: socket.id, cards });
    // check win
    if (room.game.hands[playerIndex].length === 0) {
      io.to(roomId).emit('game_end', { winnerId: socket.id });
      room.game = null;
      return;
    }
    // advance turn
    room.game.turn = (room.game.turn + 1) % room.players.length;
    const next = room.players[room.game.turn];
    io.to(next.socketId).emit('your_turn');
  });

  socket.on('pass', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || !room.game) return;
    room.game.turn = (room.game.turn + 1) % room.players.length;
    const next = room.players[room.game.turn];
    io.to(next.socketId).emit('your_turn');
  });

  socket.on('disconnect', () => {
    // 簡單移除 disconnected player（可改為斷線重連）
    for (const rid of Object.keys(rooms)) {
      const room = rooms[rid];
      const i = room.players.findIndex(p => p.socketId === socket.id);
      if (i !== -1) {
        room.players.splice(i, 1);
        io.to(rid).emit('room_update', room.players.map(p => ({ name: p.name })));
        if (room.players.length === 0) delete rooms[rid];
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Server listening on', PORT));
