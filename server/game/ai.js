const Rules = require('./rules');

class BigTwoAI {
    constructor() {
        this.history = [];
    }

    // 輔助方法：獲取順序邏輯，確保與 Rules.js 一致
    _getRankOrder(card) {
        return parseInt(card.rank);
    }

    decide(hand, lastPlay, opponentCounts) {
        // 先將手牌按權力從小到大排序
        hand.sort((a, b) => Rules.getCardPower(a) - Rules.getCardPower(b));

        // --- 情況 A：主動出牌 (或開局第一手) ---
        if (!lastPlay || lastPlay.length === 0) {
            const combinations = this.searchAllValidCombinations(hand, null);
            const clubs3 = hand.find(c => parseInt(c.rank) === 3 && c.suit === 'clubs');

            // 1. 如果有梅花 3，必須包含梅花 3 出牌，不能 PASS
            if (clubs3) {
                const c3Combos = combinations.filter(combo => 
                    combo.some(c => c.id === clubs3.id)
                );
                
                if (c3Combos.length > 0) {
                    // 優先出長牌 (五張 > 二張 > 單張)
                    c3Combos.sort((a, b) => b.length - a.length || Rules.getPlayInfo(a).power - Rules.getPlayInfo(b).power);
                    return c3Combos[0];
                }
                return [clubs3]; // 沒組合也至少要出一張梅花 3
            }

            // 2. 一般主動出牌 (前一輪贏家)
            if (combinations.length > 0) {
                // 策略：優先出長牌，消耗單張
                combinations.sort((a, b) => b.length - a.length || Rules.getPlayInfo(a).power - Rules.getPlayInfo(b).power);
                return combinations[0];
            }
            return [hand[0]]; // 保底出一張最小的
        }

        // --- 情況 B：被動壓牌 ---
        const possibleMoves = this.getAllValidMoves(hand, lastPlay);
        if (possibleMoves.length === 0) return null; // 真的沒牌壓才 PASS

        const isUrgent = Object.values(opponentCounts).some(count => count <= 3);
        const lastPlayInfo = Rules.getPlayInfo(lastPlay);
        
        // 智慧過濾：如果是五張牌型
        if (lastPlay.length === 5) {
            const sameTypeMoves = possibleMoves.filter(move => {
                return Rules.getPlayInfo(move).subType === lastPlayInfo.subType;
            });

            if (sameTypeMoves.length > 0) {
                return sameTypeMoves[0]; // 用最小的同牌型壓制
            }

            if (!isUrgent && hand.length > 8) {
                // 如果對方牌還多，且不想浪費大牌型（如鐵支壓順子），選擇 PASS
                const bestMoveInfo = Rules.getPlayInfo(possibleMoves[0]);
                if (bestMoveInfo.subType === 'FOUR_OF_A_KIND') return null;
            }
        }

        // 策略：緊急時出最大的壓死，平常出最小的省牌
        return isUrgent ? possibleMoves[possibleMoves.length - 1] : possibleMoves[0];
    }

    searchAllValidCombinations(hand, lastPlay) {
        let moves = [];
        const targetLen = lastPlay ? lastPlay.length : null;

        // 根據上一手張數，決定搜尋範圍，嚴格限制長度
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

        // 3. 五張牌型 (順子、葫蘆、鐵支)
        if (!targetLen || targetLen === 5) {
            const fiveCardMoves = this.findFiveCardMovesOptimized(hand, lastPlay);
            moves = moves.concat(fiveCardMoves);
        }

        // 排序：由小到大 (權力)
        return moves.sort((a, b) => {
            const infoA = Rules.getPlayInfo(a);
            const infoB = Rules.getPlayInfo(b);
            return (infoA && infoB) ? infoA.power - infoB.power : 0;
        });
    }

    findFiveCardMovesOptimized(hand, lastPlay) {
        const results = [];
        const groups = {};
        hand.forEach(c => {
            groups[c.rank] = groups[c.rank] || [];
            groups[c.rank].push(c);
        });

        // 1. 找順子
        const uniqueRanks = Array.from(new Set(hand.map(c => parseInt(c.rank)))).sort((a, b) => a - b);
        for (let i = 0; i <= uniqueRanks.length - 5; i++) {
            let isSeq = true;
            for (let j = 0; j < 4; j++) {
                if (uniqueRanks[i + j + 1] !== uniqueRanks[i + j] + 1) { isSeq = false; break; }
            }
            if (isSeq) {
                const combo = [];
                for (let k = 0; k < 5; k++) {
                    combo.push(hand.find(c => parseInt(c.rank) === uniqueRanks[i + k]));
                }
                if (Rules.canPlay(combo, lastPlay)) results.push(combo);
            }
        }

        // 2. 找葫蘆
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

        // 3. 找鐵支
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

const aiInstance = new BigTwoAI();
module.exports = {
    aiDecision: (hand, lastPlay, opponentCounts) => {
        try {
            // 確保資料存在，避免崩潰
            if (!hand || hand.length === 0) return null;
            return aiInstance.decide(hand, lastPlay || null, opponentCounts || {});
        } catch (e) {
            console.error("AI 運算錯誤:", e);
            return null;
        }
    }
};
