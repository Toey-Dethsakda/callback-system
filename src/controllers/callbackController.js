
const { getPlayerBalance, updatePlayerBalance } = require('../services/playerBalanceService');
const { findTransactionByRefId, saveTransaction } = require('../services/transactionService');

const Transaction = require('../models/transactionModel');
const PlaceBet = require('../models/placeBetModel');

const callBack = async (req, res) => {
    res.status(200).send("Hello callback");
};

const checkBalance = async (req, res) => {
    const { username, currency, id, productId } = req.body;
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
        res.status(500).json({ statusCode: 1, error: 'Internal Server Error', detail: error.message });
    }
};

const placeBets = async (req, res) => {
    const { id, productId, username, currency, timestampMillis, txns } = req.body;
    try {
        const totalBetAmount = txns.reduce((sum, txn) => sum + txn.betAmount, 0);
        const balanceBefore = await getPlayerBalance(username, currency);
        if (balanceBefore < totalBetAmount) {
            return res.status(400).json({
                id,
                statusCode: 1,
                error: 'Insufficient Balance',
                timestampMillis,
                currency,
                username,
                productId,
                balanceBefore,
                balanceAfter: balanceBefore
            });
        }
        await updatePlayerBalance(username, -totalBetAmount, currency);
        const balanceAfter = balanceBefore - totalBetAmount;
        await PlaceBet.create({
            requestId: id,
            timestampMillis,
            productId,
            currency,
            username,
            txns,
            balanceBefore,
            balanceAfter
        });
        res.json({
            id,
            statusCode: 0,
            timestampMillis: timestampMillis + 100,
            productId,
            currency,
            balanceBefore,
            balanceAfter,
            username
        });
    } catch (error) {
        console.error('Failed to place bets:', { error, username, txns });
        res.status(500).json({
            id,
            statusCode: 1,
            error: 'Internal Server Error',
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

const updateBalance = async (req, res) => {
    const { username, amount, currency, id } = req.body;
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
        res.status(500).json({ statusCode: 1, error: 'Internal Server Error', detail: error.message });
    }
};

// Function to get balance
const getBalance = async (req, res) => {
    const { username, currency } = req.body;
    try {
        const balance = await getPlayerBalance(username, currency);
        res.json({
            statusCode: 0,
            balance,
        });
    } catch (error) {
        res.status(500).json({ statusCode: 1, error: 'Internal Server Error', detail: error.message });
    }
};

const settleBets = async (req, res) => {
    const { id, productId, username, currency, timestampMillis, txns } = req.body;
    try {
        // Calculate the total payouts and bets
        let totalPayout = txns.reduce((acc, txn) => acc + txn.payoutAmount, 0);
        let totalBets = txns.reduce((acc, txn) => acc + Math.abs(txn.betAmount), 0);
        
        // Get the user's balance before the transactions
        const balanceBefore = await getPlayerBalance(username, currency);
        
        // Calculate the net change in balance
        const netChange = totalPayout - totalBets;
        
        // Update the user's balance
        await updatePlayerBalance(username, netChange, currency);
        const balanceAfter = balanceBefore + netChange;

        // Log each transaction
        txns.forEach(async (txn) => {
            await Transaction.create({
                username,
                productId,
                currency,
                amount: txn.payoutAmount - Math.abs(txn.betAmount),
                refId: txn.txnId,
                type: 'SETTLE_BETS',
                status: txn.status,
                roundId: txn.roundId,
                gameCode: txn.gameCode,
                playInfo: txn.playInfo,
                transactionType: 'BY_TRANSACTION', // or 'BY_ROUND' based on your system design
                timestampMillis,
                balanceBefore,
                balanceAfter
            });
        });

        // Send the response with the updated balance information
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
        console.error('Failed to settle bets:', { error, username });
        res.status(500).json({
            statusCode: 1,
            error: 'Internal Server Error',
            detail: error.message
        });
    }
};

const cancelBets = async (req, res) => {
    const { username, currency, txns, id } = req.body;
    try {
        const totalRefundAmount = txns.reduce((sum, txn) => sum + txn.betAmount, 0);
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
        res.status(500).json({ statusCode: 1, error: 'Internal Server Error', detail: error.message });
    }
};

const adjustBets = async (req, res) => {
    const { username, currency, txns, id } = req.body;
    try {
        let totalAdjustAmount = 0;
        for (const txn of txns) {
            if (await findTransactionByRefId(txn.refId)) {
                return res.status(400).json({ statusCode: 1, error: 'Duplicate transaction ID' });
            }
            totalAdjustAmount += txn.status === 'CREDIT' ? txn.amount : -txn.amount;
            await saveTransaction(txn.refId, txn.status, txn.amount, username);
        }
        const balanceBefore = await getPlayerBalance(username, currency);
        await updatePlayerBalance(username, totalAdjustAmount, currency);
        const balanceAfter = balanceBefore + totalAdjustAmount;
        res.json({
            id,
            statusCode: 0,
            timestampMillis: Date.now(),
            currency,
            betAmount,
            balanceBefore,
            balanceAfter,
            username,
        });
    } catch (error) {
        res.status(500).json({ statusCode: 1, error: 'Internal Server Error', detail: error.message });
    }
};

const rollbackBets = async (req, res) => {
    const { username, currency, txns, id } = req.body;
    try {
        let totalRollbackAmount = txns.reduce((sum, txn) => sum + (txn.status === 'SETTLED' ? txn.payoutAmount : txn.betAmount), 0);
        const balanceBefore = await getPlayerBalance(username, currency);
        await updatePlayerBalance(username, -totalRollbackAmount, currency);
        const balanceAfter = balanceBefore - totalRollbackAmount;
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
        res.status(500).json({ statusCode: 1, error: 'Internal Server Error', detail: error.message });
    }
};

const winRewards = async (req, res) => {
    const { username, currency, txns, id } = req.body;
    try {
        let totalPayoutAmount = txns.reduce((sum, txn) => sum + txn.payoutAmount, 0);
        const balanceBefore = await getPlayerBalance(username, currency);
        await updatePlayerBalance(username, totalPayoutAmount, currency);
        const balanceAfter = balanceBefore + totalPayoutAmount;
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
        res.status(500).json({ statusCode: 1, error: 'Internal Server Error', detail: error.message });
    }
};

const payTips = async (req, res) => {
    const { username, currency, txns, id } = req.body;
    try {
        let totalTipAmount = txns.reduce((sum, txn) => sum + txn.betAmount, 0);
        const balanceBefore = await getPlayerBalance(username, currency);
        if (balanceBefore < totalTipAmount) {
            return res.status(400).json({ id, statusCode: 1, error: 'Insufficient Balance' });
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
        res.status(500).json({ statusCode: 1, error: 'Internal Server Error', detail: error.message });
    }
};

const cancelTips = async (req, res) => {
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
        res.status(500).json({ statusCode: 1, error: 'Internal Server Error', detail: error.message });
    }
};

const voidSettled = async (req, res) => {
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
        res.status(500).json({ statusCode: 1, error: 'Internal Server Error', detail: error.message });
    }
};

const adjustBalance = async (req, res) => {
    const { username, currency, txns, id } = req.body;
    try {
        let totalAdjustment = 0;

        for (const txn of txns) {
            if (await findTransactionByRefId(txn.refId)) {
                return res.status(400).json({ id, statusCode: 1, error: 'Duplicate transaction ID' });
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
        res.status(500).json({ statusCode: 1, error: 'Internal Server Error', detail: error.message });
    }
};

module.exports = {
    callBack,
    checkBalance,
    placeBets,
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
