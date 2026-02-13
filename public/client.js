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

/**
 * 更新按鈕狀態 (修正判斷邏輯，對接黑金卡牌類名)
 */
function updateControls(isMyTurn) {
    const playBtn = $('playBtn');
    const passBtn = $('passBtn');
    const statusEl = $('status');

    if (playBtn) playBtn.disabled = !isMyTurn;
    if (passBtn) {
        // 邏輯：檢查中央桌面上是否有 .card 類別的元素
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
   2. 渲染邏輯 (對接豪華黑金 CSS 與龍紋視覺)
   ============================================================ */

function rankText(r) {
    const map = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2' };
    return map[r] || String(r);
}

function renderHand() {
    const handEl = $('hand');
    if (!handEl) return;
    handEl.innerHTML = '';

    myHand.forEach((c) => {
        const card = document.createElement('div');
        // 統一使用 .card 類名以觸發 CSS 紋路
        card.className = `card`;
        
        const info = SUIT_DATA[c.suit] || { symbol: c.suit, color: 'white' };

        // --- 注入龍紋與豪華結構 ---
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
                <div class="seat-name">${p.name}</div>
                ${passHtml}
                <div class="card-count">${p.cardCount ?? 13}張</div>
            </div>
        `;
    });
}

/* ============================================================
   3. Socket 監聽
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
        // 直接生成 .card 結構，讓 CSS 的 #lastPlayContent .card 堆疊效果生效
        contentEl.innerHTML = cards.map(c => {
            const info = SUIT_DATA[c.suit];
            return `
                <div class="card">
                    <div class="dragon-emblem" style="font-size:2rem !important;">🐉</div>
                    <div class="card-value">${rankText(c.rank)}</div>
                    <div class="card-suit" style="color: ${info.color}">${info.symbol}</div>
                </div>`;
        }).join('');
    }
    updateSeats(allPlayers, null);
});

socket.on('new_round', () => {
    allPlayers.forEach(p => p.hasPassed = false);
    $('lastPlayContent').innerHTML = '<span class="new-round" style="color: #d4af37; font-weight: bold; text-shadow: 0 0 10px rgba(212,175,55,0.5);">全新回合 (自由出牌)</span>';
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
        const timerEl = $('shutdownTimer');
        if (timerEl) timerEl.textContent = timeLeft;
        if (timeLeft <= 0) {
            clearInterval(countdownTimer);
            location.reload();
        }
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
