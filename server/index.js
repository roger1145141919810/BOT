const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const { generateDeck, shuffle, deal } = require('./game/engine'); // 引用你的 engine.js

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, '..', 'public')));

const rooms = {}; // 儲存房間狀態

io.on('connection', (socket) => {
    console.log('玩家連線:', socket.id);

    socket.on('create_room', ({ roomId, name }) => {
        socket.join(roomId);
        rooms[roomId] = { players: [{ id: socket.id, name }], gameStarted: false };
        io.to(roomId).emit('room_update', rooms[roomId].players);
    });

    socket.on('join_room', ({ roomId, name }) => {
        if (rooms[roomId]) {
            socket.join(roomId);
            rooms[roomId].players.push({ id: socket.id, name });
            io.to(roomId).emit('room_update', rooms[roomId].players);
        } else {
            socket.emit('error_msg', '房間不存在');
        }
    });

    socket.on('start_game', ({ roomId }) => {
        if (!rooms[roomId]) return;
        const deck = shuffle(generateDeck()); // 使用你的 engine.js 功能
        const hands = deal(deck, rooms[roomId].players.length);
        
        rooms[roomId].players.forEach((player, i) => {
            io.to(player.id).emit('deal', hands[i]); // 發牌給個別玩家
        });
        io.to(roomId).emit('game_start');
    });

    socket.on('play_cards', ({ roomId, cards }) => {
        io.to(roomId).emit('play_made', { playerId: socket.id, cards }); // 廣播出的牌
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => { // 確保 Render 能正常監聽
    console.log(`Server running on port ${PORT}`);
});
