const socket = io();
const $ = id => document.getElementById(id);

let currentRoom = null;
let myHand = [];
let selected = new Set();
let allPlayers = []; // 儲存所有玩家資訊（包含 AI）

const SUIT_DATA = {
    'clubs': { symbol: '♣', color: 'black', weight: 0 },
    'diamonds': { symbol: '♦', color: 'red', weight: 1 },
    'hearts': { symbol: '♥', color: 'red', weight: 2 },
    'spades': { symbol: '♠', color: 'black', weight: 3 }
};

// --- 大廳邏輯 ---

function renderPlayers(list) {
    allPlayers = list;
    const el = $('playersList');
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

// --- 遊戲中座位分配邏輯 ---

function updateSeats(players, currentPlayerId) {
    // 找到「我」在陣列中的位置
    const myIndex = players.findIndex(p => p.id === socket.id);
    
    // 重新排序玩家陣列，讓「我」永遠在第一個，其餘按順時針排列
    const ordered = [];
    for (let i = 0; i < players.length; i++) {
        ordered.push(players[(myIndex + i) % players.length]);
    }

    // 將玩家填入對應的 HTML 座位元件
    // ordered[0] 是「我」(Bottom)
    // ordered[1] 是 Left 或 Top (視人數而定)
    const seatIds = ['me-seat', 'p1-seat', 'p2-seat', 'p3-seat'];
    
    // 先清空所有座位文字
    seatIds.forEach(id => { if($(id)) $(id).textContent = ''; });

    ordered.forEach((p, i) => {
        const seat = $(seatIds[i]);
        if (!seat) return;

        const isTurn = p.id === currentPlayerId;
        seat.innerHTML = `
            <div class="seat-name ${isTurn ? 'active-turn' : ''}">
                ${p.name} ${p.isAI ? '[AI]' : ''}
            </div>
            <div class="card-count" id="count-${p.id}">13張</div>
        `;
    });
}

// --- 牌面渲染 ---

function renderHand() {
    const handEl = $('hand');
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

function rankText(r) {
    const map = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2' };
    return map[r] || String(r);
}

// --- 事件處理 ---

$('createBtn').addEventListener('click', () => {
    const roomId = $('roomId').value.trim();
    const name = $('name').value.trim() || 'Player';
    if (!roomId) return alert('請填房間ID');
    socket.emit('create_room', { roomId, name });
    currentRoom = roomId;
    $('curRoom').textContent = roomId;
    $('lobby').classList.add('hidden');
    $('roomArea').classList.remove('hidden');
});

$('joinBtn').addEventListener('click', () => {
    const roomId = $('roomId').value.trim();
    const name = $('name').value.trim() || 'Player';
    if (!roomId) return alert('請填房間ID');
    socket.emit('join_room', { roomId, name });
    currentRoom = roomId;
    $('curRoom').textContent = roomId;
    $('lobby').classList.add('hidden');
    $('roomArea').classList.remove('hidden');
});

// 新增：添加 AI
$('addAiBtn').addEventListener('click', () => {
    if (!currentRoom) return;
    socket.emit('add_ai', { roomId: currentRoom });
});

$('startBtn').addEventListener('click', () => {
    if (!currentRoom) return;
    socket.emit('start_game', { roomId: currentRoom });
});

$('playBtn').addEventListener('click', () => {
    const cards = myHand.filter(c => selected.has(c.id));
    if (cards.length === 0) return alert('請選牌');
    socket.emit('play_cards', { roomId: currentRoom, cards });
    selected.clear();
});

$('passBtn').addEventListener('click', () => {
    socket.emit('pass', { roomId: currentRoom });
    selected.clear();
});

// --- Socket 監聽 ---

socket.on('room_update', players => renderPlayers(players));

socket.on('deal', hand => {
    myHand = hand.sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank;
        return SUIT_DATA[a.suit].weight - SUIT_DATA[b.suit].weight;
    });
    renderHand();
});

socket.on('game_start', ({ currentPlayerId, players }) => {
    $('roomArea').classList.add('hidden');
    $('game').classList.remove('hidden');
    updateSeats(players, currentPlayerId);
    $('status').textContent = '遊戲開始！';
});

socket.on('turn_update', ({ currentPlayerId }) => {
    updateSeats(allPlayers, currentPlayerId);
    const isMyTurn = currentPlayerId === socket.id;
    $('status').textContent = isMyTurn ? '你的回合！' : '等待對手...';
    $('playBtn').disabled = !isMyTurn;
    $('passBtn').disabled = !isMyTurn;
});

socket.on('play_made', ({ playerId, cards, isPass }) => {
    if (playerId === socket.id) {
        const playedIds = new Set(cards.map(c => c.id));
        myHand = myHand.filter(c => !playedIds.has(c.id));
        renderHand();
    }
    
    const content = isPass ? '<span class="pass-text">PASS</span>' : 
        cards.map(c => `<span style="color:${SUIT_DATA[c.suit].color}">${rankText(c.rank)}${SUIT_DATA[c.suit].symbol}</span>`).join(' ');
    
    $('lastPlayContent').innerHTML = content;
});

socket.on('new_round', () => {
    $('lastPlayContent').innerHTML = '<span class="new-round">全新開始（發球權）</span>';
});

socket.on('error_msg', msg => alert(msg));
