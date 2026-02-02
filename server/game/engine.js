// 簡單牌組工具：生成、洗牌、發牌
function generateDeck() {
  const suits = ['spades', 'hearts', 'clubs', 'diamonds'];
  const ranks = [3,4,5,6,7,8,9,10,11,12,13,14,15]; // 11=J,12=Q,13=K,14=A,15=2
  const deck = [];
  for (const s of suits) {
    for (const r of ranks) {
      deck.push({ suit: s, rank: r, id: `${s}-${r}` });
    }
  }
  return deck;
}

function shuffle(array) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function deal(deck, players = 4) {
  const hands = Array.from({ length: players }, () => []);
  deck.forEach((c, i) => {
    hands[i % players].push(c);
  });
  return hands;
}

module.exports = { generateDeck, shuffle, deal };
