const { getPlayerBalance, updatePlayerBalance } = require('../services/playerBalanceService');
const { findTransactionByRefId, saveTransaction } = require('../services/transactionService');

const Transaction = require('../models/transactionModel');
const PlaceBet = require('../models/placeBetModel');

const callBack = async (req, res) => {
    res.status(200).send("Hello callback");
};

// ฟังก์ชันเพื่อตรวจสอบการทำธุรกรรมซ้ำ
const checkDuplicateTransaction = async (txns) => {
    for (const txn of txns) {
        const existingTransaction = await findTransactionByRefId(txn.txnId);
        if (existingTransaction) {
            return existingTransaction;
        }
    }
    return null;
};

// ฟังก์ชันสำหรับบันทึกการทำธุรกรรม
const logTransactions = async (txns, username, productId, currency, balanceBefore, balanceAfter, timestampMillis) => {
    try {
        for (const txn of txns) {
            if (!txn.id) {
                throw new Error(`Transaction ID (txnId) is required for logging transactions.`);
            }
            const existingTransaction = await findTransactionByRefId(txn.id);
            if (!existingTransaction) {
                const amount = txn.payoutAmount !== undefined ? txn.payoutAmount : 0;

                if (isNaN(amount)) {
                    throw new Error(`จำนวนเงินที่คำนวณได้เป็น NaN สำหรับ ID การทำธุรกรรม: ${txn.id}`);
                }

                await Transaction.create({
                    refId: txn.id,
                    status: txn.status,
                    amount: amount,
                    username: username,
                    productId: productId,
                    currency: currency,
                    balanceBefore,
                    balanceAfter,
                    timestampMillis,
                    createdAt: new Date()
                });
            }
        }
        console.log('All transactions logged successfully');
    } catch (error) {
        console.error('Error logging transactions:', error);
        throw error;
    }
};

const checkBalance = async (req, res) => {
    const { username, currency, id, productId } = req.body;
    console.log("checkBalance endpoint");
    try {
        const balance = await getPlayerBalance(username, currency);
        res.json({
            id,
            statusCode: 0,
            timestampMillis: Date.now(),
            currency,
            balance,
            username,
            productId
        });
    } catch (error) {
        res.status(500).json({ statusCode: 50001, error: 'Internal server error', detail: error.message });
    }
};

const placeBets = async (req, res) => {
    const { id, productId, username, currency, timestampMillis, txns } = req.body;
    console.log("placeBets endpoint");
    try {
        for (const txn of txns) {
            if (!txn.id) {
                return res.status(400).json({
                    id,
                    statusCode: 40003,
                    error: 'Forbidden request',
                    detail: 'One or more transactions are missing a transaction ID.'
                });
            }
        }

        const nonSkipTxns = txns.filter(txn => !txn.skipBalanceUpdate);
        const totalBetAmount = nonSkipTxns.reduce((sum, txn) => sum + txn.betAmount, 0);

        let balanceBefore;
        try {
            balanceBefore = await getPlayerBalance(username, currency);
        } catch (error) {
            if (error.code === 'ECONNREFUSED' || error.response.status === 503) {
                return res.status(503).json({
                    id,
                    statusCode: 503,
                    error: 'Service Unavailable',
                    detail: 'The service is temporarily unavailable. Please try again later.'
                });
            } else {
                throw error;
            }
        }

        if (balanceBefore < totalBetAmount) {
            return res.status(200).json({
                id,
                statusCode: 10002,
                error: 'User has insufficient balance to proceed',
                timestampMillis,
                currency,
                username,
                productId,
                balance: balanceBefore
            });
        }

        const existingTransaction = await checkDuplicateTransaction(txns);
        if (existingTransaction) {
            return res.status(200).json({
                id,
                statusCode: 20002,
                error: 'Transaction duplicate',
                timestampMillis,
                currency,
                username,
                productId,
                balance: balanceBefore
            });
        }

        if (nonSkipTxns.length > 0) {
            await updatePlayerBalance(username, -totalBetAmount, currency);
        }
        const balanceAfter = balanceBefore - totalBetAmount;

        for (const txn of txns) {
            const existingTransaction = await findTransactionByRefId(txn.id);
            if (!existingTransaction) {
                await Transaction.create({
                    refId: txn.id,
                    status: txn.status,
                    amount: txn.betAmount,
                    username: username,
                    createdAt: new Date()
                });
            }
        }

        await logTransactions(txns, username, productId, currency, balanceBefore, balanceAfter, timestampMillis);

        res.status(200).json({
            id,
            statusCode: 0,
            timestampMillis,
            productId,
            currency,
            balanceBefore,
            balanceAfter,
            username
        });
    } catch (error) {
        console.error('Error in placeBets:', { error, username, txns });
        res.status(500).json({
            id,
            statusCode: 50001,
            error: 'Internal server error',
            detail: error.message,
            timestampMillis,
            currency,
            username,
            productId,
            balanceBefore: balanceBefore !== undefined ? balanceBefore : undefined,
            balanceAfter: undefined
        });
    }
};

const confirmBets = async (req, res) => {
    const { id, productId, username, currency, timestampMillis, txns } = req.body;
    console.log("confirmBets endpoint");
    try {
        for (const txn of txns) {
            if (!txn.id) {
                return res.status(400).json({
                    id,
                    statusCode: 40003,
                    error: 'Forbidden request',
                    detail: 'One or more transactions are missing a transaction ID.'
                });
            }
        }

        let balanceBefore;
        try {
            balanceBefore = await getPlayerBalance(username, currency);
        } catch (error) {
            if (error.code === 'ECONNREFUSED' || error.response.status === 503) {
                return res.status(503).json({
                    id,
                    statusCode: 503,
                    error: 'Service Unavailable',
                    detail: 'The service is temporarily unavailable. Please try again later.'
                });
            } else {
                throw error;
            }
        }

        // ไม่มีการคำนวณยอดคงเหลือสำหรับการยืนยันเดิมพันถ้า skipBalanceUpdate เป็น true
        let balanceAfter = balanceBefore;
        const nonSkipTxns = txns.filter(txn => !txn.skipBalanceUpdate);
        const totalBetAmount = nonSkipTxns.reduce((sum, txn) => sum + txn.betAmount, 0);

        if (balanceBefore < totalBetAmount) {
            return res.status(200).json({
                id,
                statusCode: 10002,
                error: 'User has insufficient balance to proceed',
                timestampMillis,
                currency,
                username,
                productId,
                balance: balanceBefore
            });
        }

        if (nonSkipTxns.length > 0) {
            await updatePlayerBalance(username, -totalBetAmount, currency);
            balanceAfter = balanceBefore - totalBetAmount;
        }

        await logTransactions(txns, username, productId, currency, balanceBefore, balanceAfter, timestampMillis);

        res.status(200).json({
            id,
            statusCode: 0,
            timestampMillis,
            productId,
            currency,
            balanceBefore,
            balanceAfter,
            username
        });
    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการยืนยันเดิมพัน:', { error, username, txns });
        res.status(500).json({
            id,
            statusCode: 50001,
            error: 'Internal server error',
            detail: error.message,
            timestampMillis,
            currency,
            username,
            productId,
            balanceBefore: balanceBefore !== undefined ? balanceBefore : undefined,
            balanceAfter: undefined
        });
    }
};

const updateBalance = async (req, res) => {
    const { username, amount, currency, id } = req.body;
    console.log("updateBalance endpoint");
    try {
        await updatePlayerBalance(username, amount, currency);
        const newBalance = await getPlayerBalance(username, currency);
        res.json({
            id,
            statusCode: 0,
            timestampMillis: Date.now(),
            currency,
            balance: newBalance,
            username,
        });
    } catch (error) {
        res.status(500).json({ statusCode: 50001, error: 'Internal server error', detail: error.message });
    }
};

const getBalance = async (req, res) => {
    const { username, currency } = req.body;
    console.log("getBalance endpoint");
    try {
        const balance = await getPlayerBalance(username, currency);
        res.status(200).json({
            statusCode: 0,
            balance,
            message: 'ดึงยอดเงินสำเร็จ'
        });
    } catch (error) {
        console.error('ดึงยอดเงินไม่สำเร็จ:', { error, username });

        if (error.code === 'ECONNREFUSED' || error.response.status === 503) {
            res.status(503).json({
                statusCode: 50001,
                error: 'Service Unavailable',
                detail: 'บริการชั่วคราวไม่พร้อมใช้งาน กรุณาลองใหม่ในภายหลัง.'
            });
        } else {
            res.status(500).json({
                statusCode: 50001,
                error: 'Internal server error',
                detail: error.message
            });
        }
    }
};

const settleBets = async (req, res) => {
    console.log("settleBets endpoint");
    const { id, productId, username, currency, timestampMillis, txns } = req.body;
    try {
        const existingTransaction = await checkDuplicateTransaction(txns);
        if (existingTransaction) {
            return res.status(200).json({
                id,
                statusCode: 20002,
                error: 'Transaction duplicate',
                timestampMillis,
                productId,
                balance: await getPlayerBalance(username, currency)
            });
        }

        const balanceBefore = await getPlayerBalance(username, currency);
        let balanceAfter = balanceBefore;

        const nonSkipTxns = txns.filter(txn => !txn.skipBalanceUpdate);
        const netChange = nonSkipTxns.reduce((acc, txn) => {
            const payout = txn.payoutAmount || 0;
            const bet = txn.betAmount || 0;
            return acc + (payout - bet);
        }, 0);

        if (nonSkipTxns.length > 0) {
            await updatePlayerBalance(username, netChange, currency);
            balanceAfter = balanceBefore + netChange;
        }

        await logTransactions(txns, username, productId, currency, balanceBefore, balanceAfter, timestampMillis);

        res.json({
            username,
            currency,
            timestampMillis: Date.now(),
            balanceBefore,
            balanceAfter,
            id,
            statusCode: 0,
            productId
        });
    } catch (error) {
        console.error('Error in settleBets:', { error, username });
        res.status(500).json({
            statusCode: 50001,
            error: 'Internal server error',
            detail: error.message
        });
    }
};

const cancelBets = async (req, res) => {
    console.log("cancelBets endpoint");
    const { username, currency, txns, id, productId, timestampMillis } = req.body;
    try {
        const totalRefundAmount = txns.reduce((sum, txn) => sum + Math.abs(txn.betAmount), 0);

        const balanceBefore = await getPlayerBalance(username, currency);

        await updatePlayerBalance(username, totalRefundAmount, currency);
        const balanceAfter = balanceBefore + totalRefundAmount;

        await logTransactions(txns, username, productId, currency, balanceBefore, balanceAfter, timestampMillis);

        res.json({
            id,
            statusCode: 0,
            timestampMillis: Date.now(),
            productId,
            currency,
            balanceBefore,
            balanceAfter,
            username
        });
    } catch (error) {
        console.error('Error during cancel bets process:', { error, username });

        // กรณีเกิดข้อผิดพลาด ให้คืนข้อมูลที่เกี่ยวข้อง
        res.status(500).json({
            id,
            statusCode: 50001,
            error: 'Internal server error',
            detail: error.message,
            timestampMillis,
            currency,
            username,
            productId,
            balanceBefore: undefined,
            balanceAfter: undefined
        });
    }
};

const adjustBets = async (req, res) => {
    const { id, productId, username, currency, timestampMillis, txns } = req.body;
    console.log("adjustBets endpoint");
    console.log("Request Body:", JSON.stringify(req.body, null, 2));
    try {
        // ตรวจสอบคำขอ
        for (const txn of txns) {
            if (!txn.id) {
                return res.status(400).json({
                    id,
                    statusCode: 40003,
                    error: 'Forbidden request',
                    detail: 'One or more transactions are missing a transaction ID.'
                });
            }
        }
        console.log("All transactions have IDs");

        // ดึงยอดเงินก่อนการปรับปรุง
        let balanceBefore;
        try {
            balanceBefore = await getPlayerBalance(username, currency);
            console.log("Balance Before Adjustment:", balanceBefore);
        } catch (error) {
            if (error.code === 'ECONNREFUSED' || error.response.status === 503) {
                console.error('Service Unavailable:', error);
                return res.status(503).json({
                    id,
                    statusCode: 503,
                    error: 'Service Unavailable',
                    detail: 'The service is temporarily unavailable. Please try again later.'
                });
            } else {
                throw error;
            }
        }

        // ตรวจสอบการทำธุรกรรมซ้ำ
        const existingTransaction = await checkDuplicateTransaction(txns);
        if (existingTransaction) {
            console.log("Duplicate Transaction Found:", existingTransaction);
            return res.status(200).json({
                id,
                statusCode: 20002,
                error: 'Transaction duplicate',
                timestampMillis,
                currency,
                username,
                productId,
                balance: balanceBefore
            });
        }
        console.log("No duplicate transactions found");

        // คำนวณยอดเงินที่จะต้องปรับปรุง
        let totalAdjustment = 0;
        for (const txn of txns) {
            const existingBet = await findTransactionByRefId(txn.id);
            console.log("Existing Bet:", existingBet); // เพิ่มการแสดงข้อมูลของ existingBet
            if (existingBet) {
                const adjustment = txn.betAmount - existingBet.amount;
                totalAdjustment += adjustment;
                console.log(`Adjustment for txn ${txn.id}: ${adjustment}`);
                // อัพเดตข้อมูลการทำธุรกรรม
                await saveTransaction(txn.id, txn.status, txn.betAmount, username);
            } else {
                totalAdjustment += txn.betAmount;
                console.log(`New adjustment for txn ${txn.id}: ${txn.betAmount}`);
                // บันทึกข้อมูลการทำธุรกรรมใหม่
                await saveTransaction(txn.id, txn.status, txn.betAmount, username);
            }
        }
        console.log("Total Adjustment:", totalAdjustment);

        // อัพเดตยอดเงินในฐานข้อมูล
        if (totalAdjustment !== 0) {
            await updatePlayerBalance(username, -totalAdjustment, currency); // ทำการหักยอดเงิน
            console.log("Player balance updated by:", -totalAdjustment);
        }
        const balanceAfter = balanceBefore - totalAdjustment;
        console.log("Balance After Adjustment:", balanceAfter);

        // บันทึกการทำธุรกรรม
        await logTransactions(txns, username, productId, currency, balanceBefore, balanceAfter, timestampMillis);
        console.log("Transactions logged");

        // ส่งการตอบกลับ
        const response = {
            id,
            statusCode: 0,
            timestampMillis,
            productId,
            currency,
            balanceBefore,
            balanceAfter,
            username
        };
        res.status(200).json(response);
        console.log("Response sent:", response);
    } catch (error) {
        console.error('Error in adjustBets:', { error, username, txns });
        res.status(500).json({
            id,
            statusCode: 50001,
            error: 'Internal server error',
            detail: error.message,
            timestampMillis,
            currency,
            username,
            productId,
            balanceBefore: balanceBefore !== undefined ? balanceBefore : undefined,
            balanceAfter: undefined
        });
    }
};

const rollbackBets = async (req, res) => {
    console.log("rollbackBets endpoint");
    const { username, currency, txns, id, productId, timestampMillis } = req.body;
    try {
        const balanceBefore = await getPlayerBalance(username, currency);

        let balanceAfter = balanceBefore;

        // Filter transactions that should not be skipped
        const nonSkipTxns = txns.filter(txn => !txn.skipBalanceUpdate);
        const netChange = nonSkipTxns.reduce((acc, txn) => {
            const payout = txn.payoutAmount || 0;
            const bet = txn.betAmount || 0;

            if (txn.status === 'ROLLBACK') {
                if (txn.transactionType === 'BY_TRANSACTION' || txn.transactionType === 'BY_ROUND') {
                    // Adjust net change based on previous status
                    return acc - payout - bet;
                }
            }
            return acc;
        }, 0);

        if (nonSkipTxns.length > 0) {
            await updatePlayerBalance(username, netChange, currency);
            balanceAfter = await getPlayerBalance(username, currency); // Re-fetch the balance after the update
        }

        await logTransactions(txns, username, productId, currency, balanceBefore, balanceAfter, timestampMillis);

        res.status(200).json({
            id,
            statusCode: 0,
            timestampMillis: Date.now(),
            productId,
            currency,
            balanceBefore,
            balanceAfter,
            username
        });
    } catch (error) {
        console.error('Error during rollback process:', { error, username, txns });

        try {
            const balanceAfterError = await getPlayerBalance(username, currency);
            res.status(200).json({
                id,
                statusCode: 0,
                timestampMillis: Date.now(),
                productId,
                currency,
                balanceBefore: balanceBefore !== undefined ? balanceBefore : 'Unknown',
                balanceAfter: balanceAfterError,
                username
            });
        } catch (balanceError) {
            console.error('Failed to retrieve balance after error:', { balanceError });

            res.status(500).json({
                id,
                statusCode: 50001,
                error: 'Internal server error',
                detail: error.message,
                timestampMillis,
                currency,
                username,
                productId,
                balanceBefore: balanceBefore !== undefined ? balanceBefore : 'Unknown',
                balanceAfter: 'Unknown'
            });
        }
    }
};

const winRewards = async (req, res) => {
    console.log("winRewards endpoint");
    const { username, currency, txns, id, productId, timestampMillis } = req.body;
    try {
        const balanceBefore = await getPlayerBalance(username, currency);

        let balanceAfter = balanceBefore;

        const totalPayout = txns.reduce((acc, txn) => {
            if (txn.status === 'SETTLED') {
                return acc + (txn.payoutAmount || 0);
            }
            return acc;
        }, 0);

        if (totalPayout > 0) {
            await updatePlayerBalance(username, totalPayout, currency);
            balanceAfter = await getPlayerBalance(username, currency); // Re-fetch the balance after the update
        }

        await logTransactions(txns, username, productId, currency, balanceBefore, balanceAfter, timestampMillis);

        res.status(200).json({
            id,
            statusCode: 0,
            timestampMillis: Date.now(),
            productId,
            currency,
            balanceBefore,
            balanceAfter,
            username
        });
    } catch (error) {
        console.error('Error during reward process:', { error, username, txns });

        try {
            const balanceAfterError = await getPlayerBalance(username, currency);
            res.status(200).json({
                id,
                statusCode: 0,
                timestampMillis: Date.now(),
                productId,
                currency,
                balanceBefore: balanceBefore !== undefined ? balanceBefore : 'Unknown',
                balanceAfter: balanceAfterError,
                username
            });
        } catch (balanceError) {
            console.error('Failed to retrieve balance after error:', { balanceError });

            res.status(500).json({
                id,
                statusCode: 50001,
                error: 'Internal server error',
                detail: error.message,
                timestampMillis,
                currency,
                username,
                productId,
                balanceBefore: balanceBefore !== undefined ? balanceBefore : 'Unknown',
                balanceAfter: 'Unknown'
            });
        }
    }
};

const payTips = async (req, res) => {
    console.log("payTips endpoint");
    const { username, currency, txns, id } = req.body;
    try {
        let totalTipAmount = txns.reduce((sum, txn) => sum + txn.betAmount, 0);
        const balanceBefore = await getPlayerBalance(username, currency);
        if (balanceBefore < totalTipAmount) {
            return res.status(400).json({ id, statusCode: 10002, error: 'User has insufficient balance to proceed' });
        }
        await updatePlayerBalance(username, -totalTipAmount, currency);
        const balanceAfter = balanceBefore - totalTipAmount;
        res.json({
            id,
            statusCode: 0,
            timestampMillis: Date.now(),
            currency,
            balanceBefore,
            balanceAfter,
            username,
        });
    } catch (error) {
        res.status(500).json({ statusCode: 50001, error: 'Internal server error', detail: error.message });
    }
};

const cancelTips = async (req, res) => {
    console.log("cancelTips endpoint");
    const { username, currency, txns, id } = req.body;
    try {
        let totalRefundAmount = txns.reduce((sum, txn) => sum + txn.betAmount, 0);
        const balanceBefore = await getPlayerBalance(username, currency);
        await updatePlayerBalance(username, totalRefundAmount, currency);
        const balanceAfter = balanceBefore + totalRefundAmount;
        res.json({
            id,
            statusCode: 0,
            timestampMillis: Date.now(),
            currency,
            balanceBefore,
            balanceAfter,
            username,
        });
    } catch (error) {
        res.status(500).json({ statusCode: 50001, error: 'Internal server error', detail: error.message });
    }
};

const voidSettled = async (req, res) => {
    console.log("voidSettled endpoint");
    const { username, currency, txns, id } = req.body;
    try {
        let totalAdjustment = 0;
        txns.forEach(txn => {
            totalAdjustment += (txn.betAmount - txn.payoutAmount);
        });
        const balanceBefore = await getPlayerBalance(username, currency);
        await updatePlayerBalance(username, totalAdjustment, currency);
        const balanceAfter = balanceBefore + totalAdjustment;
        res.json({
            id,
            statusCode: 0,
            timestampMillis: Date.now(),
            currency,
            balanceBefore,
            balanceAfter,
            username,
        });
    } catch (error) {
        res.status(500).json({ statusCode: 50001, error: 'Internal server error', detail: error.message });
    }
};

const adjustBalance = async (req, res) => {
    console.log("adjustBalance endpoint");
    const { username, currency, txns, id } = req.body;
    try {
        let totalAdjustment = 0;

        for (const txn of txns) {
            if (await findTransactionByRefId(txn.refId)) {
                return res.status(400).json({ id, statusCode: 20002, error: 'Transaction duplicate' });
            }
            totalAdjustment += txn.status === 'CREDIT' ? txn.amount : -txn.amount;
            await saveTransaction(txn.refId, txn.status, txn.amount, username);
        }

        const balanceBefore = await getPlayerBalance(username, currency);
        await updatePlayerBalance(username, totalAdjustment, currency);
        const balanceAfter = balanceBefore + totalAdjustment;

        res.json({
            id,
            statusCode: 0,
            timestampMillis: Date.now(),
            currency,
            balanceBefore,
            balanceAfter,
            username,
        });
    } catch (error) {
        res.status(500).json({ statusCode: 50001, error: 'Internal server error', detail: error.message });
    }
};

module.exports = {
    callBack,
    checkBalance,
    placeBets,
    confirmBets,
    updateBalance,
    getBalance,
    settleBets,
    cancelBets,
    adjustBets,
    rollbackBets,
    winRewards,
    payTips,
    cancelTips,
    voidSettled,
    adjustBalance
};
