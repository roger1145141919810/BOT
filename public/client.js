const socket = io();
const $ = id => document.getElementById(id);

let currentRoom = null;
let myHand = [];
let selected = new Set();
let allPlayers = []; 
let myReadyStatus = false; // 新增：追蹤自己的準備狀態

const SUIT_DATA = {
    'clubs':    { symbol: '♣', color: '#2c3e50', weight: 0 },
    'diamonds': { symbol: '♦', color: '#e74c3c', weight: 1 },
    'hearts':   { symbol: '♥', color: '#c0392b', weight: 2 },
    'spades':   { symbol: '♠', color: '#2c3e50', weight: 3 }
};

// --- 排行與輔助功能 ---
function rankText(r) {
    const map = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2' };
    return map[r] || String(r);
}

// --- 介面渲染核心 ---

function renderPlayers(list) {
    allPlayers = list;
    const el = $('playersList');
    if (!el) return;
    el.innerHTML = '';
    
    // 更新自己的準備狀態（從伺服器清單中找自己）
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
    for (let i = 0; i < players.length; i++) {
        ordered.push(players[(myIndex + i) % players.length]);
    }

    const seatIds = ['me-seat', 'p1-seat', 'p2-seat', 'p3-seat'];
    
    ordered.forEach((p, i) => {
        const seat = $(seatIds[i]);
        if (!seat) return;

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
        card.className = 'card';
        const info = SUIT_DATA[c.suit] || { symbol: c.suit, color: 'black' };
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

// 修改：當房號重複或名稱重複時會彈出提醒
socket.on('error_msg', msg => alert(msg));

// 修改：明確監聽成功進入房間的事件
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
            return `
                <div class="card-mini" style="color: ${suitInfo.color};">
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

socket.on('game_over', ({ winnerName, winnerId, allHandCounts }) => {
    const overlay = $('gameOverOverlay');
    const statsEl = $('playerStats');
    const winnerTitle = $('winnerTitle');
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
});

// --- 按鈕事件 ---

$('createBtn').onclick = () => {
    const roomId = $('roomId').value.trim();
    const name = $('name').value.trim() || 'Player';
    if (!roomId) return alert('請填房間ID');
    socket.emit('create_room', { roomId, name });
};

$('joinBtn').onclick = () => {
    const roomId = $('roomId').value.trim();
    const name = $('name').value.trim() || 'Player';
    if (!roomId) return alert('請填房間ID');
    socket.emit('join_room', { roomId, name });
};

// 修改：改為觸發準備狀態
$('startBtn').onclick = () => {
    if (currentRoom) {
        socket.emit('toggle_ready', { roomId: currentRoom });
    }
};

$('playBtn').onclick = () => {
    const cards = myHand.filter(c => selected.has(c.id));
    if (cards.length === 0) return;
    socket.emit('play_cards', { roomId: currentRoom, cards });
    selected.clear();
};

$('passBtn').onclick = () => {
    socket.emit('pass', { roomId: currentRoom });
    selected.clear();
};

// 修改：重新遊戲也改為需要重新準備
$('restartBtn').onclick = () => {
    $('gameOverOverlay').classList.add('hidden');
    $('game').classList.add('hidden');
    $('roomArea').classList.remove('hidden');
    // 回到房間後自動切換為未準備狀態（後端已處理，只需切換 UI）
};

$('backToLobbyBtn').onclick = () => location.reload();
