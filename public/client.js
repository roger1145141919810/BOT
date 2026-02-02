const socket = io();
const $ = id => document.getElementById(id);

let currentRoom = null;
let myHand = [];
let selected = new Set();

// 花色權重與符號定義
const SUIT_DATA = {
    'clubs': { symbol: '♣', color: 'black', weight: 0 },
    'diamonds': { symbol: '♦', color: 'red', weight: 1 },
    'hearts': { symbol: '♥', color: 'red', weight: 2 },
    'spades': { symbol: '♠', color: 'black', weight: 3 }
};

function renderPlayers(list) {
    const el = $('playersList');
    el.innerHTML = '';
    list.forEach((p, i) => {
        const d = document.createElement('div');
        d.textContent = `${i + 1}. ${p.name} (等待中)`;
        el.appendChild(d);
    });
}

function renderHand() {
    const handEl = $('hand');
    handEl.innerHTML = '';
    myHand.forEach((c) => {
        const card = document.createElement('div');
        card.className = 'card';
        
        // 根據花色設定顏色 [來自您提供的圖片需求]
        const info = SUIT_DATA[c.suit] || { symbol: c.suit, color: 'black' };
        card.style.color = info.color;
        
        // 使用 innerHTML 讓數字與花色分行顯示，更美觀
        card.innerHTML = `
            <div class="rank">${rankText(c.rank)}</div>
            <div class="suit" style="font-size: 24px;">${info.symbol}</div>
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

function suitText(s) {
    return SUIT_DATA[s] ? SUIT_DATA[s].symbol : s;
}

// --- 事件處理 ---

$('createBtn').addEventListener('click', () => {
    const roomId = $('roomId').value.trim();
    const name = $('name').value.trim() || 'Player';
    if (!roomId) return alert('請填房間ID');
    socket.emit('create_room', { roomId, name });
    $('curRoom').textContent = roomId;
    $('roomArea').classList.remove('hidden');
    currentRoom = roomId;
});

$('joinBtn').addEventListener('click', () => {
    const roomId = $('roomId').value.trim();
    const name = $('name').value.trim() || 'Player';
    if (!roomId) return alert('請填房間ID');
    socket.emit('join_room', { roomId, name });
    $('curRoom').textContent = roomId;
    $('roomArea').classList.remove('hidden');
    currentRoom = roomId;
});

$('startBtn').addEventListener('click', () => {
    if (!currentRoom) return;
    socket.emit('start_game', { roomId: currentRoom });
    $('lobby').classList.add('hidden');
    $('game').classList.remove('hidden');
});

$('playBtn').addEventListener('click', () => {
    if (!currentRoom) return;
    const cards = myHand.filter(c => selected.has(c.id));
    if (cards.length === 0) return alert('請選牌');
    socket.emit('play_cards', { roomId: currentRoom, cards });
    selected.clear();
});

$('passBtn').addEventListener('click', () => {
    if (!currentRoom) return;
    socket.emit('pass', { roomId: currentRoom });
    selected.clear();
});

// --- Socket 監聽 ---

socket.on('room_update', players => renderPlayers(players));

socket.on('deal', hand => {
    // 嚴謹排序：先比數字 (rank)，再比花色 (suit weight)
    myHand = hand.sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank;
        return SUIT_DATA[a.suit].weight - SUIT_DATA[b.suit].weight;
    });
    renderHand();
});

socket.on('game_start', () => {
    $('status').textContent = '遊戲開始！';
});

socket.on('play_made', ({ playerId, cards }) => {
    // 如果是自己出的牌，需從手牌陣列中移除
    if (playerId === socket.id) {
        const playedIds = new Set(cards.map(c => c.id));
        myHand = myHand.filter(c => !playedIds.has(c.id));
        renderHand();
    }
    
    // 顯示桌面最後出的牌
    $('lastPlayContent').innerHTML = cards.map(c => {
        const color = SUIT_DATA[c.suit].color;
        return `<span style="color:${color}">${rankText(c.rank)}${suitText(c.suit)}</span>`;
    }).join(' ');
    
    $('status').textContent = playerId === socket.id ? '你已出牌' : '他人出牌';
});

socket.on('error_msg', msg => alert(msg));
