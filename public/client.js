const socket = io();
const $ = id => document.getElementById(id);

let currentRoom = null;
let myHand = [];
let selected = new Set();
let allPlayers = [];
let myReadyStatus = false;
let countdownTimer = null; // 用於儲存倒計時 Interval

const SUIT_DATA = {
    'clubs':    { symbol: '♣', color: '#ffcc33', weight: 0 },
    'diamonds': { symbol: '♦', color: '#e74c3c', weight: 1 },
    'hearts':   { symbol: '♥', color: '#c0392b', weight: 2 },
    'spades':   { symbol: '♠', color: '#ffcc33', weight: 3 }
};

function rankText(r) {
    const map = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2' };
    return map[r] || String(r);
}

function isGameActive() {
    return !$('game').classList.contains('hidden');
}

// --- 介面渲染核心 ---

function renderPlayers(list) {
    allPlayers = list;
    const el = $('playersList');
    if (!el) return;
    el.innerHTML = '';

    const me = list.find(p => p.id === socket.id);
    if (me) {
        myReadyStatus = me.isReady;
        const startBtn = $('startBtn');
        if (startBtn) {
            startBtn.textContent = myReadyStatus ? '取消準備' : '準備遊戲';
            startBtn.classList.toggle('is-ready', myReadyStatus);
        }
    }

    list.forEach((p, i) => {
        const d = document.createElement('div');
        d.className = 'player-entry';
        d.innerHTML = `
            <div class="player-info">
                <span>${i + 1}. ${p.name}</span>
                ${p.isAI ? '<span class="ai-tag">AI</span>' : ''}
                ${p.id === socket.id ? '<span class="me-tag">(你)</span>' : ''}
            </div>
            <div class="ready-status ${p.isReady ? 'status-ready' : 'status-waiting'}">
                ${p.isReady ? '✅ 已準備' : '⏳ 等待中'}
            </div>
        `;
        el.appendChild(d);
    });
}

function updateSeats(players, currentPlayerId) {
    const myIndex = players.findIndex(p => p.id === socket.id);
    if (myIndex === -1) return;

    const ordered = [];
    for (let i = 0; i < 4; i++) {
        ordered.push(players[(myIndex + i) % players.length]);
    }

    const seatIds = ['me-seat', 'p1-seat', 'p2-seat', 'p3-seat'];

    ordered.forEach((p, i) => {
        const seat = $(seatIds[i]);
        if (!seat) return;
        if (!p) {
            seat.innerHTML = '';
            return;
        }

        const isTurn = p.id === currentPlayerId;
        const passHtml = (p.hasPassed && !isTurn) ? '<div class="pass-overlay">PASS</div>' : '';

        seat.innerHTML = `
            <div class="player-info-wrapper ${isTurn ? 'active-turn' : ''}">
                <div class="seat-name">
                    ${p.name} ${p.isAI ? '<span class="ai-tag-mini">[AI]</span>' : ''}
                </div>
                ${passHtml}
                <div class="card-count">${p.cardCount ?? 13}張</div>
            </div>
        `;
    });
}

function renderHand() {
    const handEl = $('hand');
    if (!handEl) return;
    handEl.innerHTML = '';
    myHand.forEach((c) => {
        const card = document.createElement('div');
        const colorClass = (c.suit === 'spades' || c.suit === 'clubs') ? 'black' : 'red';
        card.className = `card ${colorClass}`; 
        
        const info = SUIT_DATA[c.suit] || { symbol: c.suit, color: 'white' };
        card.style.color = info.color;
        card.innerHTML = `
            <div class="rank">${rankText(c.rank)}</div>
            <div class="suit">${info.symbol}</div>
        `;
        card.dataset.id = c.id;
        if (selected.has(c.id)) card.classList.add('selected');
        
        card.addEventListener('click', () => {
            if (selected.has(c.id)) selected.delete(c.id);
            else selected.add(c.id);
            renderHand();
        });
        handEl.appendChild(card);
    });
}

// --- Socket 監聽邏輯 ---

socket.on('error_msg', msg => alert(msg));

socket.on('create_success', ({ roomId }) => {
    currentRoom = roomId;
    $('lobby').classList.add('hidden');
    $('roomArea').classList.remove('hidden');
    $('curRoom').textContent = roomId;
});

socket.on('join_success', ({ roomId }) => {
    currentRoom = roomId;
    $('lobby').classList.add('hidden');
    $('roomArea').classList.remove('hidden');
    $('curRoom').textContent = roomId;
});

socket.on('room_update', players => {
    allPlayers = players;
    if (!isGameActive()) {
        $('lobby').classList.add('hidden');
        $('roomArea').classList.remove('hidden');
        if (currentRoom) $('curRoom').textContent = currentRoom;
    } else {
        updateSeats(allPlayers, null); 
    }
    renderPlayers(players);
});

socket.on('deal', hand => {
    myHand = hand.sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank;
        return SUIT_DATA[a.suit].weight - SUIT_DATA[b.suit].weight;
    });
    allPlayers.forEach(p => p.cardCount = 13);
    renderHand();
});

socket.on('game_start', ({ currentPlayerId, players }) => {
    allPlayers = players;
    $('roomArea').classList.add('hidden');
    $('game').classList.remove('hidden');
    $('gameOverOverlay').classList.add('hidden'); // 確保開始時關閉結算窗
    
    allPlayers.forEach(p => {
        p.cardCount = 13;
        p.hasPassed = false;
    });

    updateSeats(allPlayers, currentPlayerId);
    renderHand();

    const isMyTurn = (currentPlayerId === socket.id);
    $('status').textContent = isMyTurn ? '你是首家，請出牌！' : '遊戲開始，等待對手...';
    $('playBtn').disabled = !isMyTurn;
    $('passBtn').disabled = !isMyTurn;
});

socket.on('turn_update', ({ currentPlayerId }) => {
    updateSeats(allPlayers, currentPlayerId);
    const isMyTurn = currentPlayerId === socket.id;
    $('status').textContent = isMyTurn ? '你的回合！' : '等待對手...';
    $('playBtn').disabled = !isMyTurn;
    $('passBtn').disabled = !isMyTurn;
});

socket.on('play_made', ({ playerId, cards, isPass }) => {
    const player = allPlayers.find(p => p.id === playerId);
    if (player) {
        player.hasPassed = isPass;
        if (!isPass && cards) {
            player.cardCount = (player.cardCount || 13) - cards.length;
        }
    }

    if (playerId === socket.id && !isPass) {
        const playedIds = new Set(cards.map(c => c.id));
        myHand = myHand.filter(c => !playedIds.has(c.id));
        renderHand();
    }
    
    const contentEl = $('lastPlayContent');
    if (!isPass) {
        const cardsHtml = cards.map(c => {
            const suitInfo = SUIT_DATA[c.suit];
            const colorClass = (c.suit === 'spades' || c.suit === 'clubs') ? 'black' : 'red';
            return `
                <div class="card-mini ${colorClass}" style="color: ${suitInfo.color};">
                    <div class="rank-mini">${rankText(c.rank)}</div>
                    <div class="suit-mini">${suitInfo.symbol}</div>
                </div>
            `;
        }).join('');
        contentEl.innerHTML = `<div class="played-cards-wrapper">${cardsHtml}</div>`;
    }
    updateSeats(allPlayers, playerId); 
});

socket.on('new_round', () => {
    allPlayers.forEach(p => p.hasPassed = false);
    $('lastPlayContent').innerHTML = '<span class="new-round">全新回合 (自由出牌)</span>';
    updateSeats(allPlayers, null); 
});

// --- 結算與倒計時邏輯 ---
socket.on('game_over', ({ winnerName, winnerId, allHandCounts }) => {
    const overlay = $('gameOverOverlay');
    const statsEl = $('playerStats');
    const winnerTitle = $('winnerTitle');
    const timerDisplay = $('shutdownTimer');
    const isMe = (winnerId === socket.id);

    winnerTitle.textContent = isMe ? "✨ 恭喜！你贏了 ✨" : `👑 贏家是：${winnerName}`;
    winnerTitle.style.color = isMe ? "#f1c40f" : "#ffffff";

    statsEl.innerHTML = allPlayers.map(p => {
        const count = allHandCounts ? allHandCounts[p.id] : (p.id === winnerId ? 0 : p.cardCount);
        const isWinner = (p.id === winnerId);
        return `
            <div class="stat-row ${isWinner ? 'winner-row' : ''}">
                <span class="stat-name">${p.name} ${p.id === socket.id ? '(你)' : ''}</span>
                <span class="count-tag">${isWinner ? '完賽' : count + ' 張'}</span>
            </div>
        `;
    }).join('');

    overlay.classList.remove('hidden');
    selected.clear();

    // 啟動 30 秒倒計時
    let timeLeft = 30;
    timerDisplay.textContent = timeLeft;
    
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = setInterval(() => {
        timeLeft--;
        timerDisplay.textContent = timeLeft;
        if (timeLeft <= 0) {
            clearInterval(countdownTimer);
            location.reload(); // 時間到自動回大廳
        }
    }, 1000);
});

// --- 按鈕事件 ---

// 建立房間
$('createBtn').onclick = () => {
    const roomId = $('roomId').value.trim();
    const name = $('name').value.trim() || 'Player';
    if (!roomId) return alert('請填房間ID');
    socket.emit('create_room', { roomId, name });
};

// 加入房間
$('joinBtn').onclick = () => {
    const roomId = $('roomId').value.trim();
    const name = $('name').value.trim() || 'Player';
    if (!roomId) return alert('請填房間ID');
    socket.emit('join_room', { roomId, name });
};

// 開始遊戲 / 準備
$('startBtn').onclick = () => {
    if (currentRoom) {
        socket.emit('toggle_ready', { roomId: currentRoom });
    }
};

// 出牌
$('playBtn').onclick = () => {
    const cards = myHand.filter(c => selected.has(c.id));
    if (cards.length === 0) return;
    socket.emit('play_cards', { roomId: currentRoom, cards });
    selected.clear();
};

// 過牌
$('passBtn').onclick = () => {
    socket.emit('pass', { roomId: currentRoom });
    selected.clear();
};

// 【重要修正】再玩一局：重置 UI 並通知伺服器
$('restartBtn').onclick = () => {
    console.log("嘗試重新開始...");
    if (countdownTimer) clearInterval(countdownTimer);
    
    // 隱藏結算層，回到房間等待區
    $('gameOverOverlay').classList.add('hidden');
    $('game').classList.add('hidden');
    $('roomArea').classList.remove('hidden');

    // 通知伺服器重新切換準備狀態
    if (currentRoom) {
        socket.emit('toggle_ready', { roomId: currentRoom });
    }
};

// 【重要修正】返回大廳
$('backToLobbyBtn').onclick = () => {
    console.log("返回大廳...");
    if (countdownTimer) clearInterval(countdownTimer);
    if (currentRoom) {
        socket.emit('leave_room', { roomId: currentRoom });
    }
    // 直接重整網頁是最乾淨的返回大廳方式
    location.reload(); 
};
