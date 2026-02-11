/**
 * 大老二規則邏輯
 * 數字權重: 3=3, ..., 10=10, J=11, Q=12, K=13, A=14, 2=15
 * 花色權重: 梅花=0, 方塊=1, 紅心=2, 黑桃=3
 * 順子規則: A2345(5) < ... < 10JQKA(14) < 23456(15)
 */
const Rules = {
    getCardPower(card) {
        if (!card) return 0;
        const rank = parseInt(card.rank);
        const suitWeight = this.getSuitWeight(card.suit);
        // 使用 rank * 10 確保點數優先於花色
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

            // A. 同花判定 (僅用於同花順)
            const isFlush = cards.every(c => c.suit === cards[0].suit);

            // B. 順子判定 (依台灣大老二資料表修正)
            let isStraight = false;
            let straightTopPower = 0; // 這裡存的是 Weight (5-15)
            let maxCardForSuit = null; // 用來比花色的那張牌

            if (uniqueRanks.length === 5) {
                const rStr = ranks.join(',');
                // 2-3-4-5-6 (最大順, Weight 15)
                if (rStr === '3,4,5,6,15') {
                    isStraight = true;
                    straightTopPower = 15;
                    maxCardForSuit = cards.find(c => parseInt(c.rank) === 6);
                } 
                // A-2-3-4-5 (最小順, Weight 5)
                else if (rStr === '3,4,5,14,15') {
                    isStraight = true;
                    straightTopPower = 5;
                    maxCardForSuit = cards.find(c => parseInt(c.rank) === 5);
                }
                // 一般順子 (3-7 到 10-A)
                else if (ranks[4] - ranks[0] === 4) {
                    isStraight = true;
                    straightTopPower = ranks[4]; // 7, 8, 9, 10, 11, 12, 13, 14
                    maxCardForSuit = sorted[4];
                }
            }

            // --- 依照階層回傳權重 ---

            // 1. 同花順 (Level 1000)
            if (isFlush && isStraight) {
                // 權重 = 1000 + (Weight * 10) + 花色
                const p = 1000 + (straightTopPower * 10) + this.getSuitWeight(maxCardForSuit.suit);
                return { type: 'FIVE_CARD', subType: 'STRAIGHT_FLUSH', power: p };
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

            // 4. 順子 (Level 200) - 注意：這裡已不含「同花」牌型
            if (isStraight) {
                const p = 200 + (straightTopPower * 10) + this.getSuitWeight(maxCardForSuit.suit);
                return { type: 'FIVE_CARD', subType: 'STRAIGHT', power: p };
            }
        }
        return null;
    },

    canPlay(newCards, lastPlay, isFirstTurn = false) {
        const next = this.getPlayInfo(newCards);
        if (!next) return false;

        if (isFirstTurn && !newCards.some(c => parseInt(c.rank) === 3 && c.suit === 'clubs')) return false;
        if (!lastPlay || lastPlay.length === 0) return true;

        const prev = this.getPlayInfo(lastPlay);
        if (!prev) return true;
        if (newCards.length !== lastPlay.length) return false;

        if (newCards.length === 5) {
            // 同牌型互壓 (順子對順子, 葫蘆對葫蘆...)
            if (next.subType === prev.subType) {
                return next.power > prev.power;
            }

            // 怪物牌型壓制邏輯 (同花順 1000 > 鐵支 800 > 一般牌型 200~600)
            const monsterTiers = { 'FOUR_OF_A_KIND': 800, 'STRAIGHT_FLUSH': 1000 };
            const nextTier = monsterTiers[next.subType] || 0;
            const prevTier = monsterTiers[prev.subType] || 0;

            if (nextTier > 0) {
                // 同花順可壓鐵支，鐵支/同花順可壓順子與葫蘆
                if (prevTier === 0) return true; 
                return nextTier > prevTier || (nextTier === prevTier && next.power > prev.power);
            }

            // 不同的一般牌型 (如葫蘆 vs 順子) 不可互壓
            return false;
        }

        return next.power > prev.power;
    }
};

module.exports = Rules;
