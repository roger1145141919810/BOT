const Rules = require('./rules');

class BigTwoAI {
    constructor() {
        this.history = [];
    }

    // 決策核心
    decide(hand, lastPlay, opponentCounts) {
        // 排序手牌（由小到大）
        hand.sort((a, b) => Rules.getCardPower(a) - Rules.getCardPower(b));

        // --- 情況 A：主動出牌 (領先或場上沒牌) ---
        if (!lastPlay || lastPlay.length === 0) {
            const combinations = this.searchAllValidCombinations(hand, null);

            // 1. 檢查是否有梅花 3 (開局規則)
            const clubs3 = hand.find(c => parseInt(c.rank) === 3 && c.suit === 'clubs');
            if (clubs3) {
                // 優先找包含梅花 3 的最強/最長組合
                const c3Combo = combinations
                    .filter(combo => combo.some(c => c.id === clubs3.id))
                    .sort((a, b) => b.length - a.length)[0]; // 優先出五張
                return c3Combo || [clubs3];
            }

            // 2. 正常主動出牌：優先打出組合牌（長度優先：5張 > 2張 > 1張）
            if (combinations.length > 0) {
                // 策略：找長度最長且權力相對較小的組合
                combinations.sort((a, b) => b.length - a.length || Rules.getPlayInfo(a).power - Rules.getPlayInfo(b).power);
                return combinations[0];
            }
            return [hand[0]];
        }

        // --- 情況 B：被動壓牌 (嘗試大過上家) ---
        const possibleMoves = this.getAllValidMoves(hand, lastPlay);

        if (possibleMoves.length === 0) return null; // Pass

        // 策略：如果有人快贏了 (張數 <= 3)，出最大的牌壓制；否則出最小的合法牌
        const isUrgent = Object.values(opponentCounts).some(count => count <= 3);
        if (isUrgent) {
            return possibleMoves[possibleMoves.length - 1]; 
        }

        return possibleMoves[0];
    }

    // 搜尋所有合法組合
    searchAllValidCombinations(hand, lastPlay) {
        let moves = [];
        const targetLen = lastPlay ? lastPlay.length : null;

        // 1. 單張 (targetLen 為 null 或 1)
        if (!targetLen || targetLen === 1) {
            hand.forEach(c => {
                if (Rules.canPlay([c], lastPlay)) moves.push([c]);
            });
        }

        // 2. 對子 (targetLen 為 null 或 2)
        if (!targetLen || targetLen === 2) {
            for (let i = 0; i < hand.length - 1; i++) {
                for (let j = i + 1; j < hand.length; j++) {
                    const combo = [hand[i], hand[j]];
                    if (Rules.canPlay(combo, lastPlay)) moves.push(combo);
                }
            }
        }

        // 3. 五張牌 (targetLen 為 null 或 5)
        if (!targetLen || targetLen === 5) {
            const fiveCardMoves = this.findFiveCardMovesOptimized(hand, lastPlay);
            moves = moves.concat(fiveCardMoves);
        }

        // 排序：權力由小到大
        return moves.sort((a, b) => Rules.getPlayInfo(a).power - Rules.getPlayInfo(b).power);
    }

    // 優化後的五張牌搜尋：分類搜尋法
    findFiveCardMovesOptimized(hand, lastPlay) {
        const results = [];
        const len = hand.length;
        if (len < 5) return results;

        // A. 找葫蘆 (Full House: 3+2)
        const groups = {};
        hand.forEach(c => {
            groups[c.rank] = groups[c.rank] || [];
            groups[c.rank].push(c);
        });

        const triples = Object.values(groups).filter(g => g.length >= 3);
        const pairs = Object.values(groups).filter(g => g.length >= 2);

        triples.forEach(t => {
            pairs.forEach(p => {
                if (t[0].rank !== p[0].rank) {
                    const combo = [...t.slice(0, 3), ...p.slice(0, 2)];
                    if (Rules.canPlay(combo, lastPlay)) results.push(combo);
                }
            });
        });

        // B. 找順子 (Straight)
        // 簡單邏輯：連續點數搜尋
        for (let i = 0; i < len; i++) {
            let straight = [hand[i]];
            for (let j = i + 1; j < len; j++) {
                if (parseInt(hand[j].rank) === parseInt(straight[straight.length - 1].rank) + 1) {
                    straight.push(hand[j]);
                } else if (parseInt(hand[j].rank) > parseInt(straight[straight.length - 1].rank) + 1) {
                    break;
                }
                if (straight.length === 5) {
                    if (Rules.canPlay(straight, lastPlay)) results.push([...straight]);
                    break;
                }
            }
        }

        // C. 找鐵支 (Four of a Kind)
        const quads = Object.values(groups).filter(g => g.length === 4);
        quads.forEach(q => {
            hand.forEach(single => {
                if (single.rank !== q[0].rank) {
                    const combo = [...q, single];
                    if (Rules.canPlay(combo, lastPlay)) results.push(combo);
                }
            });
        });

        return results;
    }

    getAllValidMoves(hand, lastPlay) {
        return this.searchAllValidCombinations(hand, lastPlay);
    }
}

// 實例化並導出
const aiInstance = new BigTwoAI();

module.exports = {
    aiDecision: (hand, lastPlay, opponentCounts) => {
        try {
            return aiInstance.decide(hand, lastPlay, opponentCounts);
        } catch (e) {
            console.error("AI Error:", e);
            return null;
        }
    }
};
