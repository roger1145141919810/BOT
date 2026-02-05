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
            // 優先檢查是否有梅花 3 (開局規則)
            const clubs3 = hand.find(c => parseInt(c.rank) === 3 && c.suit === 'clubs');
            if (clubs3) {
                // 如果有梅花 3，嘗試找包含梅花 3 的對子或五張牌組，若無則打單張
                const combinations = this.searchAllValidCombinations(hand, null);
                const c3Combo = combinations.find(combo => combo.some(c => c.id === 'clubs-3'));
                return c3Combo || [clubs3];
            }

            // 主動出牌策略：嘗試出最小的組合（優先出五張 > 對子 > 單張）
            const allCombos = this.searchAllValidCombinations(hand, null);
            if (allCombos.length > 0) {
                // 優先出組合牌中權力最小的
                return allCombos[0];
            }
            return [hand[0]];
        }

        // --- 情況 B：被動壓牌 (嘗試大過上家) ---
        const possibleMoves = this.getAllValidMoves(hand, lastPlay);

        if (possibleMoves.length === 0) return null; // 真的打不過，選擇 Pass

        // 策略：如果有對手牌數低於 3 張，AI 會變得很兇（出合法的最大牌壓制）
        const isUrgent = Object.values(opponentCounts).some(count => count <= 3);
        if (isUrgent) {
            return possibleMoves[possibleMoves.length - 1]; 
        }

        // 正常：出合法的最小牌
        return possibleMoves[0];
    }

    // 搜尋手牌中所有合法的組合（用於主動出牌或壓牌）
    searchAllValidCombinations(hand, lastPlay) {
        const moves = [];
        const targetLen = lastPlay ? lastPlay.length : null;

        // 1. 單張
        if (!targetLen || targetLen === 1) {
            hand.forEach(c => {
                if (Rules.canPlay([c], lastPlay)) moves.push([c]);
            });
        }

        // 2. 對子
        if (!targetLen || targetLen === 2) {
            for (let i = 0; i < hand.length - 1; i++) {
                for (let j = i + 1; j < hand.length; j++) {
                    const combo = [hand[i], hand[j]];
                    if (Rules.canPlay(combo, lastPlay)) moves.push(combo);
                }
            }
        }

        // 3. 五張牌組 (順子、同花、葫蘆、四條、同花順)
        if (!targetLen || targetLen === 5) {
            this.findFiveCardMoves(hand, lastPlay, moves);
        }

        // 排序：根據牌組強度排序（由弱到強）
        moves.sort((a, b) => {
            const infoA = Rules.getPlayInfo(a);
            const infoB = Rules.getPlayInfo(b);
            return infoA.power - infoB.power;
        });

        return moves;
    }

    // 搜尋五張組合的輔助函式 (組合數較多，採簡易搜尋)
    findFiveCardMoves(hand, lastPlay, moves) {
        if (hand.length < 5) return;

        // 簡易組合搜尋：這裡遍歷所有五張組合
        // 注意：實務上為效能可優化，此處確保 AI 具備基本五張應對能力
        const k = 5;
        const n = hand.length;
        const indices = Array.from({ length: k }, (_, i) => i);

        while (indices[0] <= n - k) {
            const combo = indices.map(i => hand[i]);
            if (Rules.canPlay(combo, lastPlay)) {
                moves.push(combo);
            }

            // 組合演算法迭代
            let i = k - 1;
            while (i >= 0 && indices[i] === n - k + i) i--;
            if (i < 0) break;
            indices[i]++;
            for (let j = i + 1; j < k; j++) indices[j] = indices[i] + j - i;
        }
    }

    // 取得所有合法移動
    getAllValidMoves(hand, lastPlay) {
        return this.searchAllValidCombinations(hand, lastPlay);
    }
}

const aiInstance = new BigTwoAI();

function aiDecision(hand, lastPlay, opponentCounts) {
    try {
        return aiInstance.decide(hand, lastPlay, opponentCounts);
    } catch (error) {
        console.error("AI 決策異常:", error);
        return null;
    }
}

module.exports = { aiDecision };
