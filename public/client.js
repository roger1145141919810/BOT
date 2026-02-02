const socket = io();

const $ = id => document.getElementById(id);
let currentRoom = null;
let myHand = [];
let selected = new Set();

function renderPlayers(list) {
  const el = $('playersList');
  el.innerHTML = '';
  list.forEach((p, i) => {
    const d = document.createElement('div');
    d.textContent = `${i+1}. ${p.name}`;
    el.appendChild(d);
  });
}

function renderHand() {
  const handEl = $('hand');
  handEl.innerHTML = '';
  myHand.forEach((c, i) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.textContent = rankText(c.rank) + '\n' + suitText(c.suit);
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
  if (r === 11) return 'J';
  if (r === 12) return 'Q';
  if (r === 13) return 'K';
  if (r === 14) return 'A';
  if (r === 15) return '2';
  return String(r);
}
function suitText(s) {
  if (s === 'spades') return '♠';
  if (s === 'hearts') return '♥';
  if (s === 'clubs') return '♣';
  if (s === 'diamonds') return '♦';
  return s;
}

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
  // 切換到遊戲畫面等候 deal
  document.getElementById('lobby').classList.add('hidden');
  document.getElementById('game').classList.remove('hidden');
});

$('backLobby').addEventListener('click', () => {
  location.reload();
});

$('playBtn').addEventListener('click', () => {
  if (!currentRoom) return;
  const cards = myHand.filter(c => selected.has(c.id));
  if (cards.length === 0) return alert('請選牌');
  socket.emit('play_cards', { roomId: currentRoom, cards });
  // 由伺服器回應再移除手牌（目前伺服端會移除）
  selected.clear();
});

$('passBtn').addEventListener('click', () => {
  if (!currentRoom) return;
  socket.emit('pass', { roomId: currentRoom });
  selected.clear();
});

socket.on('room_update', players => {
  renderPlayers(players);
});

socket.on('deal', hand => {
  myHand = hand;
  // 建議先做排序
  myHand.sort((a,b) => a.rank - b.rank || a.suit.localeCompare(b.suit));
  renderHand();
});

socket.on('game_start', info => {
  $('status').textContent = '遊戲開始';
});

socket.on('your_turn', () => {
  $('status').textContent = '輪到你出牌';
});

socket.on('play_made', ({ playerId, cards }) => {
  $('lastPlayContent').textContent = `${cards.map(c=>rankText(c.rank)+suitText(c.suit)).join(' ')}`;
  $('status').textContent = '他人出牌';
});

socket.on('game_end', ({ winnerId }) => {
  $('status').textContent = '遊戲結束，勝利者：' + winnerId;
});

socket.on('error_msg', msg => {
  alert(msg);
});
