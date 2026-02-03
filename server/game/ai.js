const Rules = require('./rules');

class BigTwoAI {
    constructor() {
        this.history = [];
    }

    // 決策核心
    decide(hand, lastPlay, opponentCounts) {
        // 排序手牌（由小到大），方便 AI 優先出小牌
        hand.sort((a, b) => Rules.getCardPower(a) - Rules.getCardPower(b));

        // --- 情況 A：主動出牌 (場上沒牌，或大家都 Pass 回到自己) ---
        if (!lastPlay || lastPlay.length === 0) {
            // 1. 如果有梅花 3，開局第一手強制出一張梅花 3
            const clubs3 = hand.find(c => c.id === 'clubs-3');
            if (clubs3) return [clubs3];

            // 2. 否則隨便出一張最小的單張 (保留大牌)
            return [hand[0]];
        }

        // --- 情況 B：被動壓牌 (嘗試大過上家) ---
        const possibleMoves = this.getAllValidMoves(hand, lastPlay);

        if (possibleMoves.length === 0) return null; // 真的打不過，選擇 Pass

        // 策略：如果有對手牌數低於 3 張，AI 會變得很兇（出最大的牌壓制）
        const isUrgent = Object.values(opponentCounts).some(count => count <= 3);
        if (isUrgent) {
            return possibleMoves[possibleMoves.length - 1]; // 出合法的最大牌
        }

        // 正常：出合法的最小牌
        return possibleMoves[0];
    }

    // 找出所有能打過上家的牌組 (目前僅限單張，可擴充對子)
    getAllValidMoves(hand, lastPlay) {
        return hand
            .filter(c => Rules.canPlay([c], lastPlay)) // 篩選合法的單張
            .map(c => [c])
            .sort((a, b) => Rules.getCardPower(a[0]) - Rules.getCardPower(b[0]));
    }
}

// 建立實例
const aiInstance = new BigTwoAI();

/**
 * 對接 index.js 的導出函數
 * @param {Array} hand - AI 當前手牌
 * @param {Array} lastPlay - 場上最後一組牌
 * @param {Object} opponentCounts - 對手剩餘張數 { id: count }
 */
function aiDecision(hand, lastPlay, opponentCounts) {
    try {
        return aiInstance.decide(hand, lastPlay, opponentCounts);
    } catch (error) {
        console.error("AI 決策異常:", error);
        return null; // 報錯時保底 Pass，避免遊戲當掉
    }
}

module.exports = { aiDecision };
