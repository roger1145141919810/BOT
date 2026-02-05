const socket = io();
const $ = id => document.getElementById(id);

let currentRoom = null;
let myHand = [];
let selected = new Set();
let allPlayers = []; // 儲存所有玩家資訊（包含 AI 與斷線狀態）

const SUIT_DATA = {
    'clubs': { symbol: '♣', color: 'black', weight: 0 },
    'diamonds': { symbol: '♦', color: 'red', weight: 1 },
    'hearts': { symbol: '♥', color: 'red', weight: 2 },
    'spades': { symbol: '♠', color: 'black', weight: 3 }
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
    list.forEach((p, i) => {
        const d = document.createElement('div');
        d.className = 'player-entry';
        d.innerHTML = `
            <span>${i + 1}. ${p.name}</span>
            ${p.isAI ? '<span class="ai-tag">AI</span>' : ''}
            ${p.id === socket.id ? '<span class="me-tag">(你)</span>' : ''}
        `;
        el.appendChild(d);
    });
}

function updateSeats(players, currentPlayerId) {
    const myIndex = players.findIndex(p => p.id === socket.id);
    if (myIndex === -1) return;

    // 重新排序玩家，讓自己永遠在底部
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
                <div class="card-count" id="count-${p.id}">${p.cardCount ?? 13}張</div>
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

// --- Socket 監聽邏輯 (修復同步問題) ---

socket.on('room_update', players => {
    allPlayers = players;
    $('lobby').classList.add('hidden');
    $('roomArea').classList.remove('hidden');
    if (currentRoom) $('curRoom').textContent = currentRoom;
    renderPlayers(players);
});

socket.on('deal', hand => {
    myHand = hand.sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank;
        return SUIT_DATA[a.suit].weight - SUIT_DATA[b.suit].weight;
    });
    // 初始化所有人張數為 13
    allPlayers.forEach(p => p.cardCount = 13);
    renderHand();
});

socket.on('game_start', ({ currentPlayerId, players }) => {
    allPlayers = players;
    $('roomArea').classList.add('hidden');
    $('game').classList.remove('hidden');
    
    // 初始化狀態
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
    // 關鍵修改：如果是 Pass，只更新座位狀態；如果是出牌，才替換中間內容
    if (isPass) {
        // 這裡可以選擇不改動 contentEl，或是只顯示一個短暫的提示
        // 為了讓「中間永遠顯示牌」，我們在此處不清除之前的 cardsHtml
    } else {
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
    $('lastPlayContent').innerHTML = '<span class="new-round">全新開始（發球權）</span>';
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
                <span class="count-tag">${isWinner ? '🏆 完賽' : count + ' 張'}</span>
            </div>
        `;
    }).join('');

    overlay.classList.remove('hidden');
    selected.clear();
});

socket.on('error_msg', msg => alert(msg));

// --- 按鈕事件 ---

$('createBtn').onclick = () => {
    const roomId = $('roomId').value.trim();
    const name = $('name').value.trim() || 'Player';
    if (!roomId) return alert('請填房間ID');
    currentRoom = roomId;
    socket.emit('create_room', { roomId, name });
};

$('joinBtn').onclick = () => {
    const roomId = $('roomId').value.trim();
    const name = $('name').value.trim() || 'Player';
    if (!roomId) return alert('請填房間ID');
    currentRoom = roomId;
    socket.emit('join_room', { roomId, name });
};

$('startBtn').onclick = () => {
    if (currentRoom) socket.emit('start_game', { roomId: currentRoom });
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

$('restartBtn').onclick = () => {
    $('gameOverOverlay').classList.add('hidden');
    socket.emit('start_game', { roomId: currentRoom });
};

$('backToLobbyBtn').onclick = () => location.reload();
