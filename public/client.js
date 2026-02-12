const socket = io();
const $ = id => document.getElementById(id);

// --- 全域狀態管理 ---
let currentRoomId = null;
let myHand = [];
let selected = new Set();
let allPlayers = [];
let myReadyStatus = false;
let countdownTimer = null;

const SUIT_DATA = {
    'clubs':    { symbol: '♣', color: '#ffcc33', weight: 0 },
    'diamonds': { symbol: '♦', color: '#e74c3c', weight: 1 },
    'hearts':   { symbol: '♥', color: '#c0392b', weight: 2 },
    'spades':   { symbol: '♠', color: '#ffcc33', weight: 3 }
};

/* ============================================================
   1. 介面切換與防連點邏輯
   ============================================================ */

/**
 * 核心切換器：物理隔離各個介面
 */
function showScreen(screenId) {
    const screens = ['lobby', 'roomArea', 'game'];
    screens.forEach(id => {
        const el = $(id);
        if (el) {
            if (id === screenId) {
                el.classList.remove('hidden');
                el.style.display = 'flex'; 
                el.style.pointerEvents = 'auto'; 
            } else {
                el.classList.add('hidden');
                el.style.display = 'none'; 
                el.style.pointerEvents = 'none'; 
            }
        }
    });

    // 隱藏結算層
    const overlay = $('gameOverOverlay');
    if (overlay && screenId !== 'game') {
        overlay.classList.add('hidden');
        overlay.style.display = 'none';
    }
}

/**
 * 防止連點：在請求期間禁用按鈕
 */
function setConnectLoading(isLoading) {
    const btns = [$('createBtn'), $('joinBtn')];
    btns.forEach(btn => {
        if (btn) {
            btn.disabled = isLoading;
            btn.style.opacity = isLoading ? "0.6" : "1";
            if (!isLoading) {
                btn.textContent = (btn.id === 'createBtn') ? "建立新房間" : "加入房間";
            } else {
                btn.textContent = "連線中...";
            }
        }
    });
}

window.onload = () => {
    currentRoomId = null;
    showScreen('lobby');
};

/* ============================================================
   2. 渲染邏輯 (手牌、玩家列表、座位)
   ============================================================ */

function rankText(r) {
    const map = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2' };
    return map[r] || String(r);
}

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
        if (!p) { seat.innerHTML = ''; return; }

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
        
        card.onclick = () => {
            if (selected.has(c.id)) selected.delete(c.id);
            else selected.add(c.id);
            renderHand();
        };
        handEl.appendChild(card);
    });
}

/* ============================================================
   3. Socket 監聽邏輯
   ============================================================ */

socket.on('error_msg', msg => {
    alert(msg);
    setConnectLoading(false); // 錯誤時恢復按鈕
});

socket.on('create_success', ({ roomId }) => {
    currentRoomId = roomId;
    $('curRoom').textContent = roomId;
    setConnectLoading(false);
    showScreen('roomArea');
});

socket.on('join_success', ({ roomId }) => {
    currentRoomId = roomId;
    $('curRoom').textContent = roomId;
    setConnectLoading(false);
    showScreen('roomArea');
});

socket.on('room_update', players => {
    allPlayers = players;
    if (!currentRoomId) {
        showScreen('lobby');
    } else if (!$('game').offsetParent) { // 檢查 game 是否為隱藏狀態
        showScreen('roomArea');
    }
    renderPlayers(players);
});

socket.on('deal', hand => {
    myHand = hand.sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank;
        return SUIT_DATA[a.suit].weight - SUIT_DATA[b.suit].weight;
    });
    renderHand();
});

socket.on('game_start', ({ currentPlayerId, players }) => {
    allPlayers = players;
    showScreen('game');
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
    
    // 渲染桌面最後出的牌
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
    updateSeats(allPlayers, null); 
});

socket.on('new_round', () => {
    allPlayers.forEach(p => p.hasPassed = false);
    $('lastPlayContent').innerHTML = '<span class="new-round">全新回合 (自由出牌)</span>';
    updateSeats(allPlayers, null); 
});

socket.on('game_over', ({ winnerName, winnerId, allHandCounts }) => {
    const overlay = $('gameOverOverlay');
    if (overlay) {
        overlay.classList.remove('hidden');
        overlay.style.display = 'flex';
    }
    
    $('winnerTitle').textContent = (winnerId === socket.id) ? "✨ 你贏了！ ✨" : `👑 贏家：${winnerName}`;
    
    const statsEl = $('playerStats');
    statsEl.innerHTML = allPlayers.map(p => {
        const count = allHandCounts ? allHandCounts[p.id] : (p.id === winnerId ? 0 : p.cardCount);
        return `<div class="stat-row"><span>${p.name}</span> <span>${count} 張</span></div>`;
    }).join('');

    let timeLeft = 30;
    countdownTimer = setInterval(() => {
        timeLeft--;
        $('shutdownTimer').textContent = timeLeft;
        if (timeLeft <= 0) location.reload();
    }, 1000);
});

/* ============================================================
   4. DOM 事件綁定
   ============================================================ */

$('createBtn').onclick = () => {
    const roomId = $('roomId').value.trim();
    const name = $('name').value.trim();
    if (!roomId || !name) return alert('請填寫完整資訊');
    setConnectLoading(true);
    socket.emit('create_room', { roomId, name });
};

$('joinBtn').onclick = () => {
    const roomId = $('roomId').value.trim();
    const name = $('name').value.trim();
    if (!roomId || !name) return alert('請填寫完整資訊');
    setConnectLoading(true);
    socket.emit('join_room', { roomId, name });
};

$('startBtn').onclick = () => {
    if (currentRoomId) socket.emit('toggle_ready', { roomId: currentRoomId });
};

$('playBtn').onclick = () => {
    const cards = myHand.filter(c => selected.has(c.id));
    if (cards.length === 0) return;
    socket.emit('play_cards', { roomId: currentRoomId, cards });
    selected.clear();
};

$('passBtn').onclick = () => {
    socket.emit('pass', { roomId: currentRoomId });
    selected.clear();
};

$('backToLobbyBtn').onclick = () => location.reload();
