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

function performStartGame(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    while (room.players.length < 4) {
        const aiId = `AI-${Math.random().toString(36).substr(2, 5)}`;
        room.players.push({ 
            id: aiId, 
            name: `機器人 ${room.players.length}`, 
            isAI: true,
            isReady: true 
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
        if (hands[i].some(c => c.id === 'clubs-3')) room.turnIndex = i;
    });

    io.to(roomId).emit('room_update', room.players);
    io.to(roomId).emit('game_start', { 
        currentPlayerId: room.players[room.turnIndex].id,
        players: room.players 
    });
    
    if (room.players[room.turnIndex].isAI) handleAiAction(roomId, room.players[room.turnIndex]);
}

// --- Socket 邏輯 ---
io.on('connection', (socket) => {
    
    socket.on('create_room', ({ roomId, name }) => {
        // 修正：檢查房間是否存在，且是否還有真人在裡面
        if (rooms[roomId]) {
            const hasHumans = rooms[roomId].players.some(p => !p.isAI);
            if (hasHumans) {
                socket.emit('error_msg', '該房間 ID 已被使用且尚有玩家。');
                return;
            } else {
                // 如果房間只剩 AI（例如玩家斷線後殘留），則刪除舊房間重新建立
                delete rooms[roomId];
            }
        }
        
        socket.join(roomId);
        rooms[roomId] = { 
            players: [{ id: socket.id, name, isAI: false, isReady: false }],
            gameStarted: false,
            turnIndex: 0,
            lastPlay: null,
            passCount: 0,
            hands: {} 
        };
        io.to(roomId).emit('room_update', rooms[roomId].players);
        socket.emit('create_success', { roomId });
    });

    socket.on('join_room', ({ roomId, name }) => {
        const room = rooms[roomId];
        if (!room) return socket.emit('error_msg', '房間不存在。');
        
        // 修正：如果遊戲已結束但還沒解散，應允許玩家回到大廳建立新局
        if (room.gameStarted || room.players.length >= 4) {
            return socket.emit('error_msg', '房間已滿或遊戲進行中。');
        }

        socket.join(roomId);
        room.players.push({ id: socket.id, name, isAI: false, isReady: false });
        io.to(roomId).emit('room_update', room.players);
        socket.emit('join_success', { roomId });
    });

    socket.on('toggle_ready', ({ roomId }) => {
        const room = rooms[roomId];
        if (!room) return;

        // 如果遊戲剛結束（gameStarted 為 false），清除之前的機器人，讓玩家重新準備
        if (!room.gameStarted) {
            room.players = room.players.filter(p => !p.isAI);
        }

        const player = room.players.find(p => p.id === socket.id);
        if (player) {
            player.isReady = !player.isReady;
            io.to(roomId).emit('room_update', room.players);
            
            const humans = room.players.filter(p => !p.isAI);
            // 只要有真人且所有真人都準備好，就開局
            if (humans.length >= 1 && humans.every(p => p.isReady)) { 
                performStartGame(roomId);
            }
        }
    });

    // ... (play_cards, pass 等邏輯維持不變)

    socket.on('disconnect', () => {
        for (const roomId in rooms) {
            const room = rooms[roomId];
            const index = room.players.findIndex(p => p.id === socket.id);
            
            if (index !== -1) {
                // 如果是在遊戲中斷線
                if (room.gameStarted) {
                    room.players[index].isAI = true;
                    if (!room.players[index].name.includes("(AI)")) {
                        room.players[index].name += " (AI)";
                    }
                    
                    // 檢查是否還有任何真人
                    const hasHumans = room.players.some(p => !p.isAI);
                    if (!hasHumans) {
                        console.log(`房間 ${roomId} 無真人玩家，正在刪除...`);
                        delete rooms[roomId];
                    } else {
                        io.to(roomId).emit('room_update', room.players);
                        if (room.turnIndex === index) {
                            setTimeout(() => handleAiAction(roomId, room.players[index]), 1000);
                        }
                    }
                } else {
                    // 在等待室或結算畫面斷線（Reload）
                    room.players.splice(index, 1);
                    // 再次檢查剩餘玩家是否全是 AI
                    const hasHumans = room.players.some(p => !p.isAI);
                    if (room.players.length === 0 || !hasHumans) {
                        console.log(`房間 ${roomId} 已清空或無真人，釋放 ID`);
                        delete rooms[roomId];
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
