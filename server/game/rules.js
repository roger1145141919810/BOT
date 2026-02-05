/**
 * 大老二規則邏輯
 * 數字權重: 3=3, ..., 10=10, J=11, Q=12, K=13, A=14, 2=15
 * 花色權重: 梅花=0, 方塊=1, 紅心=2, 黑桃=3
 */
const Rules = {
    // 計算單張牌的權重值
    getCardPower(card) {
        if (!card) return 0;
        const rank = parseInt(card.rank);
        const suitWeight = this.getSuitWeight(card.suit);
        // 權重公式：點數 * 10 + 花色 (例如：黑桃 2 = 15*10 + 3 = 153)
        return rank * 10 + suitWeight;
    },

    // 取得花色權重
    getSuitWeight(suit) {
        const weights = { 'clubs': 0, 'diamonds': 1, 'hearts': 2, 'spades': 3 };
        return weights[suit] !== undefined ? weights[suit] : 0;
    },

    /**
     * 分析一組牌的牌型與強度
     * @param {Array} cards 
     * @returns {Object|null} 牌型資訊，不合法則回傳 null
     */
    // --- server/game/rules.js ---

getPlayInfo(cards) {
    if (!Array.isArray(cards) || cards.length === 0) return null;
    const len = cards.length;

    // 1. 單張 (SINGLE)
    if (len === 1) {
        return { type: 'SINGLE', power: this.getCardPower(cards[0]) };
    }

    // 2. 對子 (PAIR)
    if (len === 2) {
        if (cards[0].rank === cards[1].rank) {
            const p = Math.max(this.getCardPower(cards[0]), this.getCardPower(cards[1]));
            return { type: 'PAIR', power: p };
        }
    }

    // 3. 五張牌型 (順子、葫蘆、鐵支、同花順)
    if (len === 5) {
        // 先按數字排序，方便判斷
        const sorted = [...cards].sort((a, b) => a.rank - b.rank);
        const counts = {}; // 統計每個數字出現幾次
        sorted.forEach(c => counts[c.rank] = (counts[c.rank] || 0) + 1);
        const uniqueRanks = Object.keys(counts);

        // A. 鐵支 (Four of a Kind) - 4+1
        if (uniqueRanks.length === 2) {
            for (let r in counts) {
                if (counts[r] === 4) {
                    return { type: 'FIVE_CARD', subType: 'FOUR_OF_A_KIND', power: 800 + parseInt(r) };
                }
            }
        }

        // B. 葫蘆 (Full House) - 3+2
        if (uniqueRanks.length === 2) {
            for (let r in counts) {
                if (counts[r] === 3) {
                    // 以「三張」的那組數字決定強度
                    return { type: 'FIVE_CARD', subType: 'FULL_HOUSE', power: 600 + parseInt(r) };
                }
            }
        }

        // 判斷是否為同花、順子
        const isFlush = cards.every(c => c.suit === cards[0].suit);
        const isStraight = uniqueRanks.length === 5 && (sorted[4].rank - sorted[0].rank === 4);

        // C. 同花順 (Straight Flush)
        if (isFlush && isStraight) {
            return { type: 'FIVE_CARD', subType: 'STRAIGHT_FLUSH', power: 1000 + sorted[4].rank };
        }
        // D. 同花 (Flush)
        if (isFlush) {
            return { type: 'FIVE_CARD', subType: 'FLUSH', power: 400 + sorted[4].rank };
        }
        // E. 順子 (Straight)
        if (isStraight) {
            return { type: 'FIVE_CARD', subType: 'STRAIGHT', power: 200 + sorted[4].rank };
        }
    }

    return null;
}
    canPlay(newCards, lastPlay, isFirstTurn = false) {
        const next = this.getPlayInfo(newCards);
        
        // 如果出的牌型不合法，直接不允許出牌
        if (!next) return false; 

        // 規則 A：整場遊戲第一手，必須包含「梅花 3」
        if (isFirstTurn) {
            const hasClubs3 = newCards.some(c => c.rank === 3 && c.suit === 'clubs');
            if (!hasClubs3) return false;
        }

        // 規則 B：發球權 (場上沒牌，或是大家都過牌回到自己)
        if (!lastPlay || (Array.isArray(lastPlay) && lastPlay.length === 0)) {
            return true; 
        }

        const prev = this.getPlayInfo(lastPlay);
        if (!prev) return true;

        // 規則 C：被動壓牌
        // 1. 張數必須完全相同
        if (newCards.length !== lastPlay.length) return false;

        // 2. 牌型必須相同 (例如：單張不能壓對子)
        if (next.type !== prev.type) return false;

        // 3. 力量比較：新出的牌必須「大於」場上的牌 (next.power > prev.power)
        // 這是修正「小牌壓大牌」最關鍵的一行
        return next.power > prev.power;
    }
};

module.exports = Rules;
