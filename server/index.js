const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const { generateDeck, shuffle, deal } = require('./game/engine'); 

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, '..', 'public')));

const rooms = {}; 

io.on('connection', (socket) => {
    console.log('玩家連線:', socket.id);

    socket.on('create_room', ({ roomId, name }) => {
        socket.join(roomId);
        rooms[roomId] = { players: [{ id: socket.id, name }], gameStarted: false };
        io.to(roomId).emit('room_update', rooms[roomId].players);
    });

    socket.on('join_room', ({ roomId, name }) => {
        const room = rooms[roomId];
        if (room) {
            // 限制最多 4 人
            if (room.players.length >= 4) {
                return socket.emit('error_msg', '房間已滿 (最多 4 人)');
            }
            socket.join(roomId);
            room.players.push({ id: socket.id, name });
            io.to(roomId).emit('room_update', room.players);
        } else {
            socket.emit('error_msg', '房間不存在');
        }
    });

    socket.on('start_game', ({ roomId }) => {
        const room = rooms[roomId];
        if (!room) return;

        const playerCount = room.players.length;

        // 檢查人數限制：最少 3 人，最多 4 人
        if (playerCount < 3) {
            return socket.emit('error_msg', '人數不足 (最少 3 人才能開始)');
        }

        const deck = shuffle(generateDeck()); 
        // 呼叫修改後的 deal 邏輯 (確保 engine.js 已按前述邏輯修改)
        const hands = deal(deck, playerCount); 
        
        room.gameStarted = true;
        room.players.forEach((player, i) => {
            io.to(player.id).emit('deal', hands[i]); 
        });
        io.to(roomId).emit('game_start');
    });

    socket.on('play_cards', ({ roomId, cards }) => {
        // 這裡未來可以加入牌型判斷邏輯
        io.to(roomId).emit('play_made', { playerId: socket.id, cards }); 
    });

    // 處理斷線
    socket.on('disconnect', () => {
        for (const roomId in rooms) {
            const room = rooms[roomId];
            const index = room.players.findIndex(p => p.id === socket.id);
            if (index !== -1) {
                room.players.splice(index, 1);
                io.to(roomId).emit('room_update', room.players);
                // 如果房間沒人了，刪除房間
                if (room.players.length === 0) delete rooms[roomId];
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
