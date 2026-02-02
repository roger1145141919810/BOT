const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 提供 public 靜態檔案
app.use(express.static(path.join(__dirname, '..', 'public')));

// 引入遊戲引擎邏輯
const { generateDeck, shuffle, deal } = require('./game/engine');

// 用來儲存房間狀態的物件
const rooms = {};

io.on('connection', (socket) => {
    console.log('玩家連線:', socket.id);

    // 1. 建立房間
    socket.on('create_room', ({ roomId, name }) => {
        socket.join(roomId);
        if (!rooms[roomId]) {
            rooms[roomId] = { players: [] };
        }
        rooms[roomId].players.push({ id: socket.id, name });
        io.to(roomId).emit('room_update', rooms[roomId].players);
    });

    // 2. 加入房間
    socket.on('join_room', ({ roomId, name }) => {
        if (rooms[roomId]) {
            socket.join(roomId);
            rooms[roomId].players.push({ id: socket.id, name });
            io.to(roomId).emit('room_update', rooms[roomId].players);
        } else {
            socket.emit('error_msg', '房間不存在');
        }
    });

    // 3. 開始遊戲並發牌
    socket.on('start_game', ({ roomId }) => {
        if (!rooms[roomId]) return;
        
        const deck = shuffle(generateDeck());
        const hands = deal(deck, rooms[roomId].players.length);
        
        // 分別給每個玩家發手牌
        rooms[roomId].players.forEach((player, index) => {
            io.to(player.id).emit('deal', hands[index]);
        });

        io.to(roomId).emit('game_start');
    });

    // 4. 處理出牌 (這是你目前 client.js 最需要的)
    socket.on('play_cards', ({ roomId, cards }) => {
        console.log(`房間 ${roomId} 玩家 ${socket.id} 出牌:`, cards);
        // 這裡暫時不做規則判定，直接廣播給所有人桌上的新牌
        io.to(roomId).emit('play_made', { playerId: socket.id, cards });
    });

    // 5. 處理過牌 (Pass)
    socket.on('pass', ({ roomId }) => {
        io.to(roomId).emit('status_update', `玩家 ${socket.id} 選擇過牌`);
    });

    socket.on('disconnect', () => {
        console.log('玩家離開:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
