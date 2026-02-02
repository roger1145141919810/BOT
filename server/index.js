const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const { generateDeck, shuffle, deal } = require('./game/engine');
// 假設你的 AI 檔案導出了一個可以做決策的函數
const { aiDecision } = require('./game/ai'); 

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, '..', 'public')));

const rooms = {};

// 核心功能：切換到下一家並處理 AI 行動
function nextTurn(roomId) {
    const room = rooms[roomId];
    if (!room || !room.gameStarted) return;

    room.turnIndex = (room.turnIndex + 1) % room.players.length;
    const currentPlayer = room.players[room.turnIndex];

    io.to(roomId).emit('turn_update', { currentPlayerId: currentPlayer.id });

    // 如果當前玩家是 AI，觸發自動行動
    if (currentPlayer.isAI) {
        // 延遲 1-2 秒模擬思考，增加真實感
        setTimeout(() => {
            handleAiAction(roomId, currentPlayer);
        }, 1200);
    }
}

// 處理 AI 出牌或過牌
function handleAiAction(roomId, aiPlayer) {
    const room = rooms[roomId];
    if (!room) return;

    const aiHand = room.hands[aiPlayer.id];
    // AI 決策需傳入：手牌、場上最後出的牌、所有玩家剩餘張數(記牌策略)
    const opponentCounts = {};
    room.players.forEach(p => opponentCounts[p.id] = room.hands[p.id].length);

    const cardsToPlay = aiDecision(aiHand, room.lastPlay, opponentCounts);

    if (cardsToPlay && cardsToPlay.length > 0) {
        // AI 出牌邏輯
        room.hands[aiPlayer.id] = aiHand.filter(c => !cardsToPlay.find(pc => pc.id === c.id));
        room.lastPlay = cardsToPlay;
        room.passCount = 0; // 有人出牌，重置過牌計數
        io.to(roomId).emit('play_made', { playerId: aiPlayer.id, cards: cardsToPlay });
    } else {
        // AI 過牌邏輯
        room.passCount++;
        io.to(roomId).emit('play_made', { playerId: aiPlayer.id, cards: [], isPass: true });
        
        // 如果其他人都 Pass 了，下一位玩家獲得發球權
        if (room.passCount >= room.players.length - 1) {
            room.lastPlay = null;
            room.passCount = 0;
            io.to(roomId).emit('new_round', { message: "全體過牌，新回合開始" });
        }
    }
    nextTurn(roomId);
}

io.on('connection', (socket) => {
    socket.on('create_room', ({ roomId, name }) => {
        socket.join(roomId);
        rooms[roomId] = { 
            players: [{ id: socket.id, name, isAI: false }], 
            gameStarted: false,
            turnIndex: 0,
            lastPlay: null,
            passCount: 0,
            hands: {} 
        };
        io.to(roomId).emit('room_update', rooms[roomId].players);
    });

    // 添加 AI 機器人
    socket.on('add_ai', ({ roomId }) => {
        const room = rooms[roomId];
        if (room && room.players.length < 4) {
            const aiId = `AI-${Math.random().toString(36).substr(2, 5)}`;
            room.players.push({ id: aiId, name: `機器人 ${room.players.length}`, isAI: true });
            io.to(roomId).emit('room_update', room.players);
        }
    });

    socket.on('join_room', ({ roomId, name }) => {
        const room = rooms[roomId];
        if (room && room.players.length < 4) {
            socket.join(roomId);
            room.players.push({ id: socket.id, name, isAI: false });
            io.to(roomId).emit('room_update', room.players);
        } else {
            socket.emit('error_msg', room ? '房間已滿' : '房間不存在');
        }
    });

    socket.on('start_game', ({ roomId }) => {
        const room = rooms[roomId];
        if (!room || room.players.length < 3) return socket.emit('error_msg', '人數不足');

        const deck = shuffle(generateDeck()); 
        const hands = deal(deck, room.players.length); 
        
        room.gameStarted = true;
        room.lastPlay = null;
        room.passCount = 0;

        // 分配並儲存所有人的手牌
        room.players.forEach((player, i) => {
            room.hands[player.id] = hands[i];
            io.to(player.id).emit('deal', hands[i]);
            if (hands[i].some(c => c.id === 'clubs-3')) {
                room.turnIndex = i; // 梅花 3 開局
            }
        });

        io.to(roomId).emit('game_start', { currentPlayerId: room.players[room.turnIndex].id });
        
        // 檢查如果首攻就是 AI
        if (room.players[room.turnIndex].isAI) {
            setTimeout(() => handleAiAction(roomId, room.players[room.turnIndex]), 1000);
        }
    });

    socket.on('play_cards', ({ roomId, cards }) => {
        const room = rooms[roomId];
        if (!room || room.players[room.turnIndex].id !== socket.id) return;

        // 更新伺服器端的手牌快照
        room.hands[socket.id] = room.hands[socket.id].filter(c => !cards.find(pc => pc.id === c.id));
        room.lastPlay = cards;
        room.passCount = 0;

        io.to(roomId).emit('play_made', { playerId: socket.id, cards }); 
        nextTurn(roomId);
    });

    socket.on('pass', ({ roomId }) => {
        const room = rooms[roomId];
        if (!room || room.players[room.turnIndex].id !== socket.id) return;

        room.passCount++;
        io.to(roomId).emit('play_made', { playerId: socket.id, cards: [], isPass: true });

        if (room.passCount >= room.players.length - 1) {
            room.lastPlay = null;
            room.passCount = 0;
            io.to(roomId).emit('new_round');
        }
        nextTurn(roomId);
    });

    socket.on('disconnect', () => {
        for (const roomId in rooms) {
            const room = rooms[roomId];
            const index = room.players.findIndex(p => p.id === socket.id);
            if (index !== -1) {
                room.players.splice(index, 1);
                if (room.players.length === 0 || !room.players.some(p => !p.isAI)) {
                    delete rooms[roomId];
                } else {
                    io.to(roomId).emit('room_update', room.players);
                }
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
