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
   1. 介面切換與核心邏輯
   ============================================================ */

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
    const overlay = $('gameOverOverlay');
    if (overlay && screenId !== 'game') {
        overlay.classList.add('hidden');
        overlay.style.display = 'none';
    }
}

function setConnectLoading(isLoading) {
    const btns = [$('createBtn'), $('joinBtn')];
    btns.forEach(btn => {
        if (btn) {
            btn.disabled = isLoading;
            btn.style.opacity = isLoading ? "0.6" : "1";
            btn.textContent = isLoading ? "連線中..." : (btn.id === 'createBtn' ? "建立新房間" : "加入房間");
        }
    });
}

function updateControls(isMyTurn) {
    const playBtn = $('playBtn');
    const passBtn = $('passBtn');
    const statusEl = $('status');

    if (playBtn) playBtn.disabled = !isMyTurn;
    if (passBtn) {
        // 關鍵修正：檢查中央區域是否有 class 為 card 的元素
        const hasCardsOnTable = $('lastPlayContent').querySelector('.card') !== null;
        passBtn.disabled = !isMyTurn || !hasCardsOnTable;
    }
    
    if (statusEl) {
        statusEl.textContent = isMyTurn ? '您的回合！' : '等待對手出牌...';
        statusEl.style.color = isMyTurn ? '#d4af37' : '#fff';
    }
}

window.onload = () => { showScreen('lobby'); };

/* ============================================================
   2. 渲染邏輯 (對接黑金視覺修正)
   ============================================================ */

function rankText(r) {
    const map = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2' };
    return map[r] || String(r);
}

// 修正手牌渲染結構
function renderHand() {
    const handEl = $('hand');
    if (!handEl) return;
    handEl.innerHTML = '';

    myHand.forEach((c) => {
        const card = document.createElement('div');
        card.className = `card`; // 必須維持 card 類名
        
        const info = SUIT_DATA[c.suit] || { symbol: c.suit, color: 'white' };

        // 重新調整 HTML 結構以配合 CSS 選擇器
        card.innerHTML = `
            <div class="dragon-emblem">🐉</div> 
            <div class="card-value">${rankText(c.rank)}</div>
            <div class="card-suit" style="color: ${info.color}">${info.symbol}</div>
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

// 修正桌面出牌渲染 (解決疊加與格式問題)
socket.on('play_made', ({ playerId, cards, isPass }) => {
    const player = allPlayers.find(p => p.id === playerId);
    if (player) {
        player.hasPassed = isPass;
        if (!isPass) player.cardCount = (player.cardCount || 13) - cards.length;
    }
    if (playerId === socket.id && !isPass) {
        const playedIds = new Set(cards.map(c => c.id));
        myHand = myHand.filter(c => !playedIds.has(c.id));
        renderHand();
    }

    const contentEl = $('lastPlayContent');
    if (!isPass) {
        // 這裡不要用 .card-mini，統一用 .card 才能吃到你的豪華樣式
        contentEl.innerHTML = cards.map(c => {
            const info = SUIT_DATA[c.suit];
            return `
                <div class="card">
                    <div class="dragon-emblem" style="opacity: 0.1;">🐉</div>
                    <div class="card-value">${rankText(c.rank)}</div>
                    <div class="card-suit" style="color: ${info.color}">${info.symbol}</div>
                </div>`;
        }).join('');
    }
    updateSeats(allPlayers, null);
});

// 修正座位渲染 (確保 transform 定位生效)
function updateSeats(players, currentPlayerId) {
    const myIndex = players.findIndex(p => p.id === socket.id);
    if (myIndex === -1) return;

    // 重新排列座位順序：下(我)、左、上、右
    const ordered = [
        players[myIndex],
        players[(myIndex + 1) % players.length],
        players[(myIndex + 2) % players.length],
        players[(myIndex + 3) % players.length]
    ];

    const seatIds = ['me-seat', 'p1-seat', 'p2-seat', 'p3-seat'];
    ordered.forEach((p, i) => {
        const seat = $(seatIds[i]);
        if (!seat) return;
        if (!p) { seat.style.display = 'none'; return; }
        
        seat.style.display = 'flex';
        const isTurn = p.id === currentPlayerId;
        const passHtml = (p.hasPassed && !isTurn) ? '<div class="pass-overlay">PASS</div>' : '';
        
        // 這裡的 HTML 結構必須匹配你的 CSS .player-info-wrapper
        seat.innerHTML = `
            <div class="player-info-wrapper ${isTurn ? 'active-turn' : ''}">
                <div class="seat-name">${p.name}</div>
                ${passHtml}
                <div class="card-count">${p.cardCount ?? 13}張</div>
            </div>
        `;
    });
}

/* ============================================================
   3. Socket 監聽 (保持邏輯不變)
   ============================================================ */

socket.on('error_msg', msg => { alert(msg); setConnectLoading(false); });

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
    if (!currentRoomId) showScreen('lobby');
    else if (!$('game').offsetParent) showScreen('roomArea');
    renderPlayers(players);
});

function renderPlayers(list) {
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
            </div>
            <div class="ready-status ${p.isReady ? 'status-ready' : 'status-waiting'}">
                ${p.isReady ? '✅ 已準備' : '⏳ 等待中'}
            </div>
        `;
        el.appendChild(d);
    });
}

socket.on('deal', hand => {
    myHand = hand.sort((a, b) => a.rank !== b.rank ? a.rank - b.rank : SUIT_DATA[a.suit].weight - SUIT_DATA[b.suit].weight);
    renderHand();
});

socket.on('game_start', ({ currentPlayerId, players }) => {
    allPlayers = players;
    showScreen('game');
    updateSeats(allPlayers, currentPlayerId);
    renderHand();
    updateControls(currentPlayerId === socket.id);
});

socket.on('turn_update', ({ currentPlayerId }) => {
    updateSeats(allPlayers, currentPlayerId);
    updateControls(currentPlayerId === socket.id);
});

socket.on('new_round', () => {
    allPlayers.forEach(p => p.hasPassed = false);
    $('lastPlayContent').innerHTML = '<div class="new-round">全新回合</div>';
    updateSeats(allPlayers, null);
});

socket.on('game_over', ({ winnerName, winnerId, allHandCounts }) => {
    const overlay = $('gameOverOverlay');
    if (overlay) { showScreen('game'); overlay.classList.remove('hidden'); overlay.style.display = 'flex'; }
    $('winnerTitle').textContent = (winnerId === socket.id) ? "✨ 你贏了！ ✨" : `👑 贏家：${winnerName}`;
    const statsEl = $('playerStats');
    statsEl.innerHTML = allPlayers.map(p => `<div>${p.name}: ${allHandCounts[p.id]} 張</div>`).join('');
    let timeLeft = 30;
    countdownTimer = setInterval(() => {
        timeLeft--;
        if ($('shutdownTimer')) $('shutdownTimer').textContent = timeLeft;
        if (timeLeft <= 0) location.reload();
    }, 1000);
});

/* ============================================================
   4. 事件綁定
   ============================================================ */
$('createBtn').onclick = () => {
    const r = $('roomId').value.trim(); const n = $('name').value.trim();
    if (!r || !n) return alert('請填寫完整資訊');
    setConnectLoading(true); socket.emit('create_room', { roomId: r, name: n });
};
$('joinBtn').onclick = () => {
    const r = $('roomId').value.trim(); const n = $('name').value.trim();
    if (!r || !n) return alert('請填寫完整資訊');
    setConnectLoading(true); socket.emit('join_room', { roomId: r, name: n });
};
$('startBtn').onclick = () => { if (currentRoomId) socket.emit('toggle_ready', { roomId: currentRoomId }); };
$('playBtn').onclick = () => {
    const cards = myHand.filter(c => selected.has(c.id));
    if (cards.length > 0) { socket.emit('play_cards', { roomId: currentRoomId, cards }); selected.clear(); }
};
$('passBtn').onclick = () => { socket.emit('pass', { roomId: currentRoomId }); selected.clear(); };
$('backToLobbyBtn').onclick = () => location.reload();
