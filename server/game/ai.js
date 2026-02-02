const Rules = require('./rules');

class BigTwoAI {
    constructor(id) {
        this.id = id;
        this.history = []; // 記牌器：記錄場上出過的牌
    }

    // 記牌邏輯
    record(cards) {
        if (cards) this.history.push(...cards.map(c => c.id));
    }

    // 決策邏輯
    decide(hand, lastPlay, opponentCounts) {
        // 1. 找出所有合法的出牌選項
        const possibleMoves = this.getAllValidMoves(hand, lastPlay);

        if (possibleMoves.length === 0) return null; // Pass

        // 2. 策略：如果有對手牌數低於 3 張，AI 會變得很兇（出手中最大的牌壓制）
        const isUrgent = Object.values(opponentCounts).some(count => count <= 3);
        
        if (isUrgent) {
            return possibleMoves[possibleMoves.length - 1]; // 出最大的合法牌
        }

        // 3. 正常策略：出最小的合法牌（保留實力）
        return possibleMoves[0];
    }

    getAllValidMoves(hand, lastPlay) {
        // 這裡實作從手牌中找出所有大於 lastPlay 的單張、對子等，並按 Power 排序
        // 範例僅處理單張：
        return hand
            .filter(c => Rules.canPlay([c], lastPlay))
            .map(c => [c])
            .sort((a, b) => Rules.getCardPower(a[0]) - Rules.getCardPower(b[0]));
    }
}

module.exports = BigTwoAI;
