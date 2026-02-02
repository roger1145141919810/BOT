const Rules = {
    // 定義權重：大老二的數字順序是 3 < 4 ... < A < 2
    // 數字權重: 3=3, ..., 10=10, J=11, Q=12, K=13, A=14, 2=15
    // 花色權重: clubs=0, diamonds=1, hearts=2, spades=3
    
    getCardPower(card) {
        return card.rank * 10 + (this.getSuitWeight(card.suit));
    },

    getSuitWeight(suit) {
        const weights = { 'clubs': 0, 'diamonds': 1, 'hearts': 2, 'spades': 3 };
        return weights[suit];
    },

    // 判斷牌型（簡化版：單張、對子、五張）
    getPlayInfo(cards) {
        const len = cards.length;
        if (len === 1) return { type: 'SINGLE', power: this.getCardPower(cards[0]) };
        if (len === 2 && cards[0].rank === cards[1].rank) {
            const maxSuit = Math.max(this.getSuitWeight(cards[0].suit), this.getSuitWeight(cards[1].suit));
            return { type: 'PAIR', power: cards[0].rank * 10 + maxSuit };
        }
        // 此處可擴充：順子(STRAIGHT)、葫蘆(FULL_HOUSE)等
        return null;
    },

    canPlay(newCards, lastPlay) {
        const next = this.getPlayInfo(newCards);
        if (!next) return false; // 牌型不合法
        if (!lastPlay) return true; // 發球權，只要合法就能出
        
        const last = this.getPlayInfo(lastPlay);
        if (next.type !== last.type) return false; // 牌型必須一致
        return next.power > last.power;
    }
};

module.exports = Rules;
