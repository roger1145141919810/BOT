/**
 * 大老二規則邏輯
 * 數字權重: 3=3, ..., 10=10, J=11, Q=12, K=13, A=14, 2=15
 * 花色權重: 梅花=0, 方塊=1, 紅心=2, 黑桃=3
 */
const Rules = {
    getCardPower(card) {
        if (!card) return 0;
        const rank = parseInt(card.rank);
        const suitWeight = this.getSuitWeight(card.suit);
        return rank * 10 + suitWeight;
    },

    getSuitWeight(suit) {
        const weights = { 'clubs': 0, 'diamonds': 1, 'hearts': 2, 'spades': 3 };
        return weights[suit] !== undefined ? weights[suit] : 0;
    },

    getPlayInfo(cards) {
        if (!Array.isArray(cards) || cards.length === 0) return null;
        const len = cards.length;

        // 1. 單張
        if (len === 1) {
            return { type: 'SINGLE', power: this.getCardPower(cards[0]) };
        }

        // 2. 對子
        if (len === 2) {
            if (parseInt(cards[0].rank) === parseInt(cards[1].rank)) {
                const p = Math.max(this.getCardPower(cards[0]), this.getCardPower(cards[1]));
                return { type: 'PAIR', power: p };
            }
        }

        // 3. 五張牌型
        if (len === 5) {
            const sorted = [...cards].sort((a, b) => parseInt(a.rank) - parseInt(b.rank));
            const ranks = sorted.map(c => parseInt(c.rank));
            const counts = {};
            ranks.forEach(r => counts[r] = (counts[r] || 0) + 1);
            const uniqueRanks = Object.keys(counts).map(Number).sort((a, b) => a - b);

            // A. 同花判定
            const isFlush = cards.every(c => c.suit === cards[0].suit);

            // B. 順子判定 (處理一般順子與 A2345)
            let isStraight = false;
            let straightTopPower = 0;
            if (uniqueRanks.length === 5) {
                if (ranks[4] - ranks[0] === 4) {
                    isStraight = true;
                    straightTopPower = ranks[4]; // 正常順子取最大那張
                } else if (ranks.includes(14) && ranks.includes(15) && ranks.includes(3) && ranks.includes(4) && ranks.includes(5)) {
                    isStraight = true;
                    straightTopPower = 15; // A2345 順子在許多規則中以 2 為大
                }
            }

            // --- 依照階層回傳權重 (由高到低判定) ---

            // 1. 同花順 (Level 1000)
            if (isFlush && isStraight) {
                return { type: 'FIVE_CARD', subType: 'STRAIGHT_FLUSH', power: 1000 + straightTopPower };
            }

            // 2. 鐵支 (Level 800)
            if (uniqueRanks.length === 2) {
                const quadRank = Object.keys(counts).find(r => counts[r] === 4);
                if (quadRank) return { type: 'FIVE_CARD', subType: 'FOUR_OF_A_KIND', power: 800 + parseInt(quadRank) };
            }

            // 3. 葫蘆 (Level 600)
            if (uniqueRanks.length === 2) {
                const tripleRank = Object.keys(counts).find(r => counts[r] === 3);
                if (tripleRank) return { type: 'FIVE_CARD', subType: 'FULL_HOUSE', power: 600 + parseInt(tripleRank) };
            }

            // 4. 同花 (Level 400)
            if (isFlush) {
                return { type: 'FIVE_CARD', subType: 'FLUSH', power: 400 + ranks[4] };
            }

            // 5. 順子 (Level 200)
            if (isStraight) {
                return { type: 'FIVE_CARD', subType: 'STRAIGHT', power: 200 + straightTopPower };
            }
        }
        return null;
    },

    canPlay(newCards, lastPlay, isFirstTurn = false) {
        const next = this.getPlayInfo(newCards);
        if (!next) return false;

        // 首輪必須包含梅花 3
        if (isFirstTurn && !newCards.some(c => parseInt(c.rank) === 3 && c.suit === 'clubs')) return false;

        // 桌面沒牌，隨便出
        if (!lastPlay || lastPlay.length === 0) return true;

        const prev = this.getPlayInfo(lastPlay);
        if (!prev) return true;

        // 張數必須相同 (大老二基本規則)
        if (newCards.length !== lastPlay.length) return false;

        // 如果都是五張牌型，因為我們在 getPlayInfo 設定了 Power 階層，
        // 葫蘆(600+) 會自動大於 順子(200+)，直接比 power 即可。
        return next.power > prev.power;
    }
};

module.exports = Rules;
