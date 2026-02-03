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
    getPlayInfo(cards) {
        if (!Array.isArray(cards) || cards.length === 0) return null;

        const len = cards.length;

        // 1. 單張 (SINGLE)
        if (len === 1) {
            return { 
                type: 'SINGLE', 
                power: this.getCardPower(cards[0]) 
            };
        }

        // 2. 對子 (PAIR)
        if (len === 2) {
            // 確保兩張牌點數相同
            if (parseInt(cards[0].rank) === parseInt(cards[1].rank)) {
                const maxSuit = Math.max(
                    this.getSuitWeight(cards[0].suit), 
                    this.getSuitWeight(cards[1].suit)
                );
                return { 
                    type: 'PAIR', 
                    // 對子的強度由點數決定，點數相同看最大花色
                    power: parseInt(cards[0].rank) * 10 + maxSuit 
                };
            }
        }

        // --- 此處未來可擴充：順子 (5張)、葫蘆 (5張)、鐵支 (5張) ---
        return null;
    },

    /**
     * 核心判斷：是否可以出這組牌
     * @param {Array} newCards - 玩家想出的牌
     * @param {Array} lastPlay - 場上最後一組牌
     * @param {Boolean} isFirstTurn - 是否為整場遊戲的第一手
     * @returns {Boolean}
     */
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
