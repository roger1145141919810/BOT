const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const { generateDeck, shuffle, deal } = require('./game/engine');
const { aiDecision } = require('./game/ai'); 
const Rules = require('./game/rules');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, '..', 'public')));

const rooms = {};

// --- 輔助函式 ---
function nextTurn(roomId) {
    const room = rooms[roomId];
    if (!room || !room.gameStarted) return;

    room.turnIndex = (room.turnIndex + 1) % room.players.length;
    const currentPlayer = room.players[room.turnIndex];

    io.to(roomId).emit('turn_update', { currentPlayerId: currentPlayer.id });

    if (currentPlayer.isAI) {
        setTimeout(() => handleAiAction(roomId, currentPlayer), 1200);
    }
}

function handleAiAction(roomId, aiPlayer) {
    const room = rooms[roomId];
    if (!room || !room.gameStarted) return;

    const aiHand = room.hands[aiPlayer.id]; 
    if (!aiHand) return;

    const opponentCounts = {};
    room.players.forEach(p => opponentCounts[p.id] = (room.hands[p.id] || []).length);

    const cardsToPlay = aiDecision(aiHand, room.lastPlay, opponentCounts);

    if (cardsToPlay && cardsToPlay.length > 0) {
        room.hands[aiPlayer.id] = aiHand.filter(c => !cardsToPlay.find(pc => pc.id === c.id));
        room.lastPlay = cardsToPlay;
        room.passCount = 0;
        io.to(roomId).emit('play_made', { playerId: aiPlayer.id, cards: cardsToPlay, isPass: false });
        
        if (room.hands[aiPlayer.id].length === 0) {
            io.to(roomId).emit('game_over', { 
                winnerName: aiPlayer.name, 
                winnerId: aiPlayer.id,
                allHandCounts: opponentCounts 
            });
            room.gameStarted = false;
            return;
        }
    } else {
        room.passCount++;
        io.to(roomId).emit('play_made', { playerId: aiPlayer.id, cards: [], isPass: true });
        
        if (room.passCount >= room.players.length - 1) {
            room.lastPlay = null;
            room.passCount = 0;
            io.to(roomId).emit('new_round');
        }
    }
    nextTurn(roomId);
}

// --- Socket 邏輯 ---
io.on('connection', (socket) => {
    
    // 建立房間 (修正覆蓋問題)
    socket.on('create_room', ({ roomId, name }) => {
        // 1. 檢查房間是否已存在
        if (rooms[roomId]) {
            socket.emit('error_msg', '該房間 ID 已被使用，請更換房號或點擊加入。');
            return;
        }
        // 2. 檢查輸入
        if (!roomId || roomId.trim() === "") {
            socket.emit('error_msg', '房號不能為空。');
            return;
        }

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
        // 通知前端建立成功，可以切換 UI
        socket.emit('create_success', { roomId });
        console.log(`[建立] 玩家 ${name} 建立了房間: ${roomId}`);
    });

    // 加入房間
    socket.on('join_room', ({ roomId, name }) => {
        const room = rooms[roomId];
        if (!room) {
            socket.emit('error_msg', '房間不存在，請先建立房間。');
            return;
        }
        if (room.gameStarted) {
            socket.emit('error_msg', '遊戲已經開始，無法加入。');
            return;
        }
        if (room.players.length >= 4) {
            socket.emit('error_msg', '房間已滿（最多 4 人）。');
            return;
        }

        socket.join(roomId);
        room.players.push({ id: socket.id, name, isAI: false });
        io.to(roomId).emit('room_update', room.players);
        socket.emit('join_success', { roomId });
        console.log(`[加入] 玩家 ${name} 加入了房間: ${roomId}`);
    });

    // 開始遊戲
    socket.on('start_game', ({ roomId }) => {
        const room = rooms[roomId];
        if (!room) return;

        // 只有房主（第一個玩家）可以開始遊戲
        if (room.players[0].id !== socket.id) {
            socket.emit('error_msg', '只有房主可以開始遊戲。');
            return;
        }

        // 自動補滿 AI
        while (room.players.length < 4) {
            const aiId = `AI-${Math.random().toString(36).substr(2, 5)}`;
            room.players.push({ 
                id: aiId, 
                name: `機器人 ${room.players.length}`, 
                isAI: true 
            });
        }

        const deck = shuffle(generateDeck()); 
        const hands = deal(deck, 4); 
        
        room.gameStarted = true;
        room.lastPlay = null;
        room.passCount = 0;

        room.players.forEach((player, i) => {
            room.hands[player.id] = hands[i];
            if (!player.isAI) io.to(player.id).emit('deal', hands[i]);
            // 尋找梅花 3 決定誰先出
            if (hands[i].some(c => c.id === 'clubs-3')) room.turnIndex = i;
        });

        io.to(roomId).emit('room_update', room.players);
        io.to(roomId).emit('game_start', { 
            currentPlayerId: room.players[room.turnIndex].id,
            players: room.players 
        });
        
        if (room.players[room.turnIndex].isAI) handleAiAction(roomId, room.players[room.turnIndex]);
    });

    // 出牌邏輯
    socket.on('play_cards', ({ roomId, cards }) => {
        const room = rooms[roomId];
        if (!room || !room.gameStarted) return;
        if (room.players[room.turnIndex].id !== socket.id) return;

        const isFirstTurn = !room.lastPlay && room.passCount === 0 && room.hands[socket.id].length === 13;
        
        if (!Rules.canPlay(cards, room.lastPlay, isFirstTurn)) {
            socket.emit('error_msg', '牌組不合法！');
            return; 
        }

        room.hands[socket.id] = room.hands[socket.id].filter(c => !cards.find(pc => pc.id === c.id));
        room.lastPlay = cards;
        room.passCount = 0;

        io.to(roomId).emit('play_made', { playerId: socket.id, cards, isPass: false });

        if (room.hands[socket.id].length === 0) {
            io.to(roomId).emit('game_over', { winnerName: room.players[room.turnIndex].name, winnerId: socket.id });
            room.gameStarted = false;
            return;
        }
        nextTurn(roomId);
    });

    // 過牌邏輯
    socket.on('pass', ({ roomId }) => {
        const room = rooms[roomId];
        if (!room || !room.gameStarted) return;
        if (room.players[room.turnIndex].id !== socket.id || !room.lastPlay) return;

        room.passCount++;
        io.to(roomId).emit('play_made', { playerId: socket.id, cards: [], isPass: true });

        if (room.passCount >= room.players.length - 1) {
            room.lastPlay = null;
            room.passCount = 0;
            io.to(roomId).emit('new_round');
        }
        nextTurn(roomId);
    });

    // 斷線處理
    socket.on('disconnect', () => {
        for (const roomId in rooms) {
            const room = rooms[roomId];
            const index = room.players.findIndex(p => p.id === socket.id);
            
            if (index !== -1) {
                if (room.gameStarted) {
                    // 遊戲中斷線：轉為 AI
                    room.players[index].isAI = true;
                    if (!room.players[index].name.includes("(AI)")) {
                        room.players[index].name += " (AI)";
                    }
                    io.to(roomId).emit('room_update', room.players);
                    if (room.turnIndex === index) setTimeout(() => handleAiAction(roomId, room.players[index]), 1000);
                } else {
                    // 等待中斷線：直接移除
                    room.players.splice(index, 1);
                    if (room.players.length === 0) {
                        delete rooms[roomId]; // 徹底清理房間物件
                        console.log(`[清理] 房間 ${roomId} 已無玩家，系統回收房號。`);
                    } else {
                        io.to(roomId).emit('room_update', room.players);
                    }
                }
                break;
            }
        }
    });
});

server.listen(3000, '0.0.0.0', () => console.log(`Server running on port 3000`));
