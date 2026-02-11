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

            // B. 順子判定 (依台灣大老二規則：23456最大, 10JQKA次之, A2345最小)
            let isStraight = false;
            let straightTopPower = 0;

            if (uniqueRanks.length === 5) {
                // 檢查特殊順子組成 (Rank: 3, 4, 5, 6, 15 為 2-3-4-5-6)
                const has3 = ranks.includes(3);
                const has4 = ranks.includes(4);
                const has5 = ranks.includes(5);
                const has6 = ranks.includes(6);
                const has14 = ranks.includes(14);
                const has15 = ranks.includes(15);

                const is23456 = has3 && has4 && has5 && has6 && has15;
                const isA2345 = has3 && has4 && has5 && has14 && has15;
                const isNormalStraight = (ranks[4] - ranks[0] === 4) && !ranks.includes(15);

                if (is23456) {
                    isStraight = true;
                    // 給予 20，確保大於 A順(14) 與一般順
                    straightTopPower = 20; 
                } else if (isNormalStraight) {
                    isStraight = true;
                    // A順(10-A) 會是 14，其餘依最大張 rank 分布 (7~13)
                    straightTopPower = ranks[4]; 
                } else if (isA2345) {
                    isStraight = true;
                    // 怪物順(最小)，給予 1
                    straightTopPower = 1; 
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

        // 1. 首輪必須包含梅花 3
        if (isFirstTurn && !newCards.some(c => parseInt(c.rank) === 3 && c.suit === 'clubs')) return false;

        // 2. 桌面沒牌，隨便出
        if (!lastPlay || lastPlay.length === 0) return true;

        const prev = this.getPlayInfo(lastPlay);
        if (!prev) return true;

        // 3. 張數必須相同
        if (newCards.length !== lastPlay.length) return false;

        // 4. 五張牌型特殊邏輯
        if (newCards.length === 5) {
            // 台灣規則：通常必須牌型完全相同才能壓
            if (next.subType === prev.subType) {
                return next.power > prev.power;
            }

            // 特例：鐵支和同花順可以壓過任何五張牌型 (有些地區規則)
            // 如果你的規則是「完全不能互壓」，請把下面這段刪除
            const monsterRanks = ['FOUR_OF_A_KIND', 'STRAIGHT_FLUSH'];
            if (monsterRanks.includes(next.subType)) {
                // 如果上家也是怪物牌型，就比 power；否則直接壓過
                if (monsterRanks.includes(prev.subType)) {
                    return next.power > prev.power;
                }
                return true; 
            }

            // 牌型不同（如葫蘆 vs 順子），不能出牌
            return false;
        }

        // 5. 單張或對子，直接比權重
        return next.power > prev.power;
    }

module.exports = Rules;
