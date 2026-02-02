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
        rooms[roomId] = { 
            players: [{ id: socket.id, name }], 
            gameStarted: false,
            turnIndex: 0 // 新增：記錄當前該誰出牌
        };
        io.to(roomId).emit('room_update', rooms[roomId].players);
    });

    socket.on('join_room', ({ roomId, name }) => {
        const room = rooms[roomId];
        if (room) {
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
        if (playerCount < 3) {
            return socket.emit('error_msg', '人數不足 (最少 3 人才能開始)');
        }

        const deck = shuffle(generateDeck()); 
        const hands = deal(deck, playerCount); 
        
        room.gameStarted = true;

        // --- 邏輯修正：尋找梅花 3 持有者作為首攻 ---
        let starterIndex = 0;
        hands.forEach((hand, index) => {
            if (hand.some(card => card.id === 'clubs-3')) {
                starterIndex = index;
            }
        });
        room.turnIndex = starterIndex;

        room.players.forEach((player, i) => {
            io.to(player.id).emit('deal', hands[i]); 
        });

        // 廣播遊戲開始，並告知當前回合玩家 ID
        io.to(roomId).emit('game_start', { 
            currentPlayerId: room.players[room.turnIndex].id 
        });
    });

    socket.on('play_cards', ({ roomId, cards }) => {
        const room = rooms[roomId];
        if (!room) return;

        // 檢查是否為該玩家的回合
        const currentPlayer = room.players[room.turnIndex];
        if (currentPlayer.id !== socket.id) {
            return socket.emit('error_msg', '還沒輪到你！');
        }

        // 廣播出的牌
        io.to(roomId).emit('play_made', { playerId: socket.id, cards }); 

        // --- 邏輯修正：切換到下一位玩家 ---
        room.turnIndex = (room.turnIndex + 1) % room.players.length;
        const nextPlayerId = room.players[room.turnIndex].id;

        // 通知所有人回合更新
        io.to(roomId).emit('turn_update', { currentPlayerId: nextPlayerId });
    });

    socket.on('disconnect', () => {
        for (const roomId in rooms) {
            const room = rooms[roomId];
            const index = room.players.findIndex(p => p.id === socket.id);
            if (index !== -1) {
                room.players.splice(index, 1);
                io.to(roomId).emit('room_update', room.players);
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
