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

    getPlayInfo(cards) {
        if (!Array.isArray(cards) || cards.length === 0) return null;
        const len = cards.length;

        // 1. 單張 (SINGLE)
        if (len === 1) {
            return { type: 'SINGLE', power: this.getCardPower(cards[0]) };
        }

        // 2. 對子 (PAIR)
        if (len === 2) {
            if (parseInt(cards[0].rank) === parseInt(cards[1].rank)) {
                const p = Math.max(this.getCardPower(cards[0]), this.getCardPower(cards[1]));
                return { type: 'PAIR', power: p };
            }
        }

        // 3. 五張牌型 (順子、葫蘆、鐵支、同花順)
        if (len === 5) {
            // --- 關鍵修正：確保 rank 是數字並正確排序 ---
            const sorted = [...cards].sort((a, b) => parseInt(a.rank) - parseInt(b.rank));
            const ranks = sorted.map(c => parseInt(c.rank));
            
            const counts = {}; 
            ranks.forEach(r => counts[r] = (counts[r] || 0) + 1);
            const uniqueRanks = Object.keys(counts).map(Number).sort((a, b) => a - b);

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

            // 判斷是否為同花
            const isFlush = cards.every(c => c.suit === cards[0].suit);
            
            // --- 關鍵修正：順子判斷 (解決 A, 2 的連續性問題) ---
            let isStraight = false;
            if (uniqueRanks.length === 5) {
                // 一般情況: 3,4,5,6,7 或 10,J,Q,K,A
                if (ranks[4] - ranks[0] === 4) {
                    isStraight = true;
                } 
                // 大老二特殊情況: A, 2, 3, 4, 5 ( ranks 會是 [3, 4, 5, 14, 15] )
                else if (ranks.includes(14) && ranks.includes(15) && ranks.includes(3) && ranks.includes(4) && ranks.includes(5)) {
                    isStraight = true;
                }
            }

            // C. 同花順 (Straight Flush)
            if (isFlush && isStraight) {
                return { type: 'FIVE_CARD', subType: 'STRAIGHT_FLUSH', power: 1000 + (ranks.includes(15) && ranks.includes(3) ? 15 : ranks[4]) };
            }
            // D. 同花 (Flush)
            if (isFlush) {
                return { type: 'FIVE_CARD', subType: 'FLUSH', power: 400 + ranks[4] };
            }
            // E. 順子 (Straight)
            if (isStraight) {
                // 如果是 A,2,3,4,5，權重以 2 (15) 為準
                const straightPower = (ranks.includes(15) && ranks.includes(3)) ? 15 : ranks[4];
                return { type: 'FIVE_CARD', subType: 'STRAIGHT', power: 200 + straightPower };
            }
        }

        return null;
    },

    canPlay(newCards, lastPlay, isFirstTurn = false) {
        const next = this.getPlayInfo(newCards);
        if (!next) return false; 

        if (isFirstTurn) {
            const hasClubs3 = newCards.some(c => parseInt(c.rank) === 3 && c.suit === 'clubs');
            if (!hasClubs3) return false;
        }

        if (!lastPlay || (Array.isArray(lastPlay) && lastPlay.length === 0)) {
            return true; 
        }

        const prev = this.getPlayInfo(lastPlay);
        if (!prev) return true;

        if (newCards.length !== lastPlay.length) return false;

        if (newCards.length === 5) {
            return next.power > prev.power;
        }

        if (next.type === prev.type) {
            return next.power > prev.power;
        }

        return false;
    }
};

module.exports = Rules;
