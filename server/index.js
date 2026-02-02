const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const { generateDeck, shuffle, deal } = require('./game/engine');
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

    if (currentPlayer.isAI) {
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
    const opponentCounts = {};
    room.players.forEach(p => opponentCounts[p.id] = room.hands[p.id].length);

    const cardsToPlay = aiDecision(aiHand, room.lastPlay, opponentCounts);

    if (cardsToPlay && cardsToPlay.length > 0) {
        room.hands[aiPlayer.id] = aiHand.filter(c => !cardsToPlay.find(pc => pc.id === c.id));
        room.lastPlay = cardsToPlay;
        room.passCount = 0;
        io.to(roomId).emit('play_made', { playerId: aiPlayer.id, cards: cardsToPlay });
    } else {
        room.passCount++;
        io.to(roomId).emit('play_made', { playerId: aiPlayer.id, cards: [], isPass: true });
        
        if (room.passCount >= room.players.length - 1) {
            room.lastPlay = null;
            room.passCount = 0;
            io.to(roomId).emit('new_round', { message: "全體過牌，新回合開始" });
        }
    }
    nextTurn(roomId);
}

io.on('connection', (socket) => {
    // 建立房間
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

    socket.on('join_room', ({ roomId, name }) => {
        const room = rooms[roomId];
        // 真人上限維持 4 人
        if (room && room.players.length < 4 && !room.gameStarted) {
            socket.join(roomId);
            room.players.push({ id: socket.id, name, isAI: false });
            io.to(roomId).emit('room_update', room.players);
        } else {
            socket.emit('error_msg', room ? (room.gameStarted ? '遊戲已開始' : '房間已滿') : '房間不存在');
        }
    });

    // 修改後：自動補齊 4 人並開始遊戲
    socket.on('start_game', ({ roomId }) => {
        const room = rooms[roomId];
        if (!room) return;

        // 1. 自動補足 AI 到 4 人
        while (room.players.length < 4) {
            const aiId = `AI-${Math.random().toString(36).substr(2, 5)}`;
            room.players.push({ id: aiId, name: `機器人 ${room.players.length + 1}`, isAI: true });
        }

        // 通知所有人最新的玩家名單（座位排布會用到）
        io.to(roomId).emit('room_update', room.players);

        socket.on('start_game', ({ roomId }) => {
        const room = rooms[roomId];
        if (!room) return;

        // 1. 自動補足 AI 到 4 人 (確保每人都能領 13 張)
        while (room.players.length < 4) {
            const aiId = `AI-${Math.random().toString(36).substr(2, 5)}`;
            room.players.push({ 
                id: aiId, 
                name: `機器人 ${room.players.length + 1}`, 
                isAI: true 
            });
        }

        // 核心修復：初始化 room.hands，防止伺服器崩潰 (502 錯誤主因)
        room.hands = {}; 

        // 2. 固定以 4 人模式發牌 (每人 13 張)
        const deck = shuffle(generateDeck()); 
        const hands = deal(deck, 4); 
        
        room.gameStarted = true;
        room.lastPlay = null;
        room.passCount = 0;

        room.players.forEach((player, i) => {
            room.hands[player.id] = hands[i]; // 現在這裡不會報錯了
            
            // 只發牌給真人
            if (!player.isAI) {
                io.to(player.id).emit('deal', hands[i]);
            }
            
            // 尋找首家 (梅花 3)
            // 注意：請確認你的 engine.js 產出的 id 是 'clubs-3' 還是 '♣3'
            if (hands[i].some(c => c.id === 'clubs-3')) {
                room.turnIndex = i; 
            }
        });

        // 3. 發送開始信號
        // 先同步一次名單，確保前端知道有 AI 加入
        io.to(roomId).emit('room_update', room.players);

        setTimeout(() => {
            io.to(roomId).emit('game_start', { 
                currentPlayerId: room.players[room.turnIndex].id,
                players: room.players 
            });
            
            // 如果首家是 AI，啟動行動
            if (room.players[room.turnIndex].isAI) {
                handleAiAction(roomId, room.players[room.turnIndex]);
            }
        }, 500); 
    });

    socket.on('play_cards', ({ roomId, cards }) => {
        const room = rooms[roomId];
        if (!room || room.players[room.turnIndex].id !== socket.id) return;

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
