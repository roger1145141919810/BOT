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
            if (cards[0].rank === cards[1].rank) {
                const maxSuit = Math.max(
                    this.getSuitWeight(cards[0].suit), 
                    this.getSuitWeight(cards[1].suit)
                );
                return { 
                    type: 'PAIR', 
                    power: parseInt(cards[0].rank) * 10 + maxSuit 
                };
            }
        }

        // --- 此處未來可擴充：順子、葫蘆、鐵支、同花順 ---
        return null;
    },

    /**
     * 核心判斷：是否可以出這組牌
     * @param {Array} newCards - 玩家想出的牌
     * @param {Array} lastPlay - 場上最後一組牌
     * @returns {Boolean}
     */
    canPlay(newCards, lastPlay) {
        const next = this.getPlayInfo(newCards);
        
        // 如果出的牌型根本不合法（例如選了三張雜牌），直接出不了
        if (!next) return false; 

        // 情況 A：發球權 (場上沒牌，或是大家都過牌回到自己)
        if (!lastPlay || (Array.isArray(lastPlay) && lastPlay.length === 0)) {
            return true;
        }

        // 情況 B：壓牌 (跟隨場上的牌型比較)
        const last = this.getPlayInfo(lastPlay);
        if (!last) return true; // 安全保底：如果解析不出場上的牌，允許出牌

        // 牌型必須一致 (單張對單張，對子對對子)
        if (next.type !== last.type) return false;

        // 比較權重值
        return next.power > last.power;
    }
};

module.exports = Rules;
