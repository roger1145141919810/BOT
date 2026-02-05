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

// 核心功能：切換到下一家並處理 AI 行動
function nextTurn(roomId) {
    const room = rooms[roomId];
    if (!room || !room.gameStarted) return;

    room.turnIndex = (room.turnIndex + 1) % room.players.length;
    const currentPlayer = room.players[room.turnIndex];

    io.to(roomId).emit('turn_update', { currentPlayerId: currentPlayer.id });

    // 這裡會自動處理原本就是 AI，或是「剛變成 AI」的玩家
    if (currentPlayer.isAI) {
        setTimeout(() => {
            handleAiAction(roomId, currentPlayer);
        }, 1200); // 延遲一下讓畫面比較自然
    }
}

// 處理 AI 出牌或過牌
function handleAiAction(roomId, aiPlayer) {
    const room = rooms[roomId];
    if (!room || !room.gameStarted) return;

    // 這裡要統一抓取 room.hands[aiPlayer.id]
    const aiHand = room.hands[aiPlayer.id];
    if (!aiHand || aiHand.length === 0) return;

    const opponentCounts = {};
    room.players.forEach(p => opponentCounts[p.id] = room.hands[p.id].length);

    // 呼叫你的 aiDecision 邏輯
    const cardsToPlay = aiDecision(aiHand, room.lastPlay, opponentCounts);

    if (cardsToPlay && cardsToPlay.length > 0) {
        // 更新手牌
        room.hands[aiPlayer.id] = aiHand.filter(c => !cardsToPlay.find(pc => pc.id === c.id));
        room.lastPlay = cardsToPlay;
        room.passCount = 0;
        io.to(roomId).emit('play_made', { playerId: aiPlayer.id, cards: cardsToPlay });

        // 勝利檢查
        if (room.hands[aiPlayer.id].length === 0) {
            io.to(roomId).emit('game_over', { 
                winnerName: aiPlayer.name, 
                winnerId: aiPlayer.id,
                allHandCounts: opponentCounts // 這裡記得補上結算用的剩餘張數
            });
            room.gameStarted = false;
            return;
        }
    } else {
        // 過牌邏輯
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
        if (room && room.players.length < 4 && !room.gameStarted) {
            socket.join(roomId);
            room.players.push({ id: socket.id, name, isAI: false });
            io.to(roomId).emit('room_update', room.players);
        } else {
            socket.emit('error_msg', room ? (room.gameStarted ? '遊戲已開始' : '房間已滿') : '房間不存在');
        }
    });

    // --- 修正後的開始遊戲邏輯 ---
    socket.on('start_game', ({ roomId }) => {
        const room = rooms[roomId];
        if (!room) return;

        // 1. 自動補足 AI 到 4 人
        while (room.players.length < 4) {
            const aiId = `AI-${Math.random().toString(36).substr(2, 5)}`;
            room.players.push({ 
                id: aiId, 
                name: `機器人 ${room.players.length + 1}`, 
                isAI: true 
            });
        }

        // 2. 初始化物件，防止 502 錯誤
        room.hands = {}; 
        const deck = shuffle(generateDeck()); 
        const hands = deal(deck, 4); 
        
        room.gameStarted = true;
        room.lastPlay = null;
        room.passCount = 0;

        room.players.forEach((player, i) => {
            room.hands[player.id] = hands[i];
            if (!player.isAI) {
                io.to(player.id).emit('deal', hands[i]);
            }
            // 尋找首家 (梅花 3)
            if (hands[i].some(c => c.id === 'clubs-3')) {
                room.turnIndex = i; 
            }
        });

        // 3. 同步名單並通知遊戲開始
        io.to(roomId).emit('room_update', room.players);

        setTimeout(() => {
            io.to(roomId).emit('game_start', { 
                currentPlayerId: room.players[room.turnIndex].id,
                players: room.players 
            });
            
            if (room.players[room.turnIndex].isAI) {
                handleAiAction(roomId, room.players[room.turnIndex]);
            }
        }, 500); 
    });

    socket.on('play_cards', ({ roomId, cards }) => {
        const room = rooms[roomId];
        if (!room || room.players[room.turnIndex].id !== socket.id) return;

            // 1. 驗證邏輯：檢查是否為首回合（第一手牌必須有梅花 3）
            const isFirstTurn = !room.lastPlay && room.passCount === 0 && Object.values(room.hands).every(h => h.length === 13);
            
            if (!Rules.canPlay(cards, room.lastPlay, isFirstTurn)) {
                socket.emit('error_msg', '牌組不合法，或必須大於場上的牌！');
                return; 
            }

            // 2. 驗證通過，執行出牌：從該玩家手中移除牌
            room.hands[socket.id] = room.hands[socket.id].filter(c => !cards.find(pc => pc.id === c.id));
            room.lastPlay = cards;
            room.passCount = 0;
    
            // 3. 廣播這手牌
            io.to(roomId).emit('play_made', { playerId: socket.id, cards });
    
            // --- 核心修改：勝利判定 ---
            if (room.hands[socket.id].length === 0) {
                const winner = room.players[room.turnIndex];
                io.to(roomId).emit('game_over', { 
                    winnerName: winner.name, 
                    winnerId: winner.id 
                });
                room.gameStarted = false; // 停止遊戲
                return; // 結束函式，不進入下一回合
            }
            // -----------------------
    
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
                const player = room.players[index];
    
                // 情況 A：如果遊戲尚未開始，直接移除玩家
                if (!room.gameStarted) {
                    room.players.splice(index, 1);
                    if (room.players.length === 0) {
                        delete rooms[roomId];
                    } else {
                        io.to(roomId).emit('room_update', room.players);
                    }
                } 
                // 情況 B：如果遊戲進行中，將玩家轉為 AI 接管
                else {
                    console.log(`玩家 ${player.name} 斷線，由 AI 接管`);
                    player.isAI = true;
                    player.name = `${player.name} (AI接管)`;
                
                    // 通知所有玩家有人變成了 AI
                    io.to(roomId).emit('room_update', room.players);

                    // 重要：如果剛好輪到該斷線玩家，立即觸發 AI 出牌邏輯
                    if (room.turnIndex === index) {
                        handleAiAction(roomId, player);
                    }
                }
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
