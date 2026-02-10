const Rules = require('./rules');

class BigTwoAI {
    constructor() {
        this.history = [];
    }

    decide(hand, lastPlay, opponentCounts) {
        hand.sort((a, b) => Rules.getCardPower(a) - Rules.getCardPower(b));

        // --- 情況 A：主動出牌 ---
        if (!lastPlay || lastPlay.length === 0) {
            const combinations = this.searchAllValidCombinations(hand, null);
            const clubs3 = hand.find(c => parseInt(c.rank) === 3 && c.suit === 'clubs');
            if (clubs3) {
                const c3Combo = combinations
                    .filter(combo => combo.some(c => c.id === clubs3.id))
                    .sort((a, b) => b.length - a.length)[0];
                return c3Combo || [clubs3];
            }
            if (combinations.length > 0) {
                combinations.sort((a, b) => b.length - a.length || Rules.getPlayInfo(a).power - Rules.getPlayInfo(b).power);
                return combinations[0];
            }
            return [hand[0]];
        }

        // --- 情況 B：被動壓牌 (策略優化) ---
        const possibleMoves = this.getAllValidMoves(hand, lastPlay);
        if (possibleMoves.length === 0) return null;

        const isUrgent = Object.values(opponentCounts).some(count => count <= 3);
        
        // 如果是五張牌型，加入智慧過濾
        if (lastPlay.length === 5) {
            const lastPlayInfo = Rules.getPlayInfo(lastPlay);
            
            // 1. 優先找「同牌型」且能大過對方的 (例如順子對順子)
            const sameTypeMoves = possibleMoves.filter(move => {
                return Rules.getPlayInfo(move).type === lastPlayInfo.type;
            });

            if (sameTypeMoves.length > 0) {
                return sameTypeMoves[0]; // 出最小的同牌型壓制
            }

            // 2. 如果沒有同牌型，只有「更高級」的牌型 (例如手上有葫蘆，上家打順子)
            if (!isUrgent) {
                // 如果不緊急 (對方牌還很多)，且自己手牌還很多，AI 傾向「Pass」來保留大牌
                if (hand.length > 8) return null;
                
                // 如果非同牌型壓制會消耗掉太強的牌 (例如用鐵支壓順子)，也傾向 Pass
                const bestMoveInfo = Rules.getPlayInfo(possibleMoves[0]);
                if (bestMoveInfo.type === 'four_of_a_kind' || bestMoveInfo.type === 'straight_flush') {
                    return null;
                }
            }
        }

        // 策略：緊急時出最大的，平常出最小的合法牌
        if (isUrgent) {
            return possibleMoves[possibleMoves.length - 1]; 
        }

        return possibleMoves[0];
    }

    searchAllValidCombinations(hand, lastPlay) {
        let moves = [];
        const targetLen = lastPlay ? lastPlay.length : null;

        if (!targetLen || targetLen === 1) {
            hand.forEach(c => {
                if (Rules.canPlay([c], lastPlay)) moves.push([c]);
            });
        }

        if (!targetLen || targetLen === 2) {
            for (let i = 0; i < hand.length - 1; i++) {
                for (let j = i + 1; j < hand.length; j++) {
                    const combo = [hand[i], hand[j]];
                    if (Rules.canPlay(combo, lastPlay)) moves.push(combo);
                }
            }
        }

        if (!targetLen || targetLen === 5) {
            const fiveCardMoves = this.findFiveCardMovesOptimized(hand, lastPlay);
            moves = moves.concat(fiveCardMoves);
        }

        // 核心排序：權力由小到大
        return moves.sort((a, b) => Rules.getPlayInfo(a).power - Rules.getPlayInfo(b).power);
    }

    findFiveCardMovesOptimized(hand, lastPlay) {
        const results = [];
        const groups = {};
        hand.forEach(c => {
            groups[c.rank] = groups[c.rank] || [];
            groups[c.rank].push(c);
        });

        // 1. 找順子 (優先度高，因為消耗單張)
        const uniqueRanks = Array.from(new Set(hand.map(c => Rules.getRankOrder(c)))).sort((a,b)=>a-b);
        for (let i = 0; i <= uniqueRanks.length - 5; i++) {
            let isSeq = true;
            for (let j = 0; j < 4; j++) {
                if (uniqueRanks[i+j+1] !== uniqueRanks[i+j] + 1) { isSeq = false; break; }
            }
            if (isSeq) {
                // 組合順子 (簡單取法)
                const combo = [];
                for (let k = 0; k < 5; k++) {
                    combo.push(hand.find(c => Rules.getRankOrder(c) === uniqueRanks[i+k]));
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
            return aiInstance.decide(hand, lastPlay, opponentCounts);
        } catch (e) {
            console.error("AI Error:", e);
            return null;
        }
    }
};
