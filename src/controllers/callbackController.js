const { getPlayerBalance, updatePlayerBalance } = require('../services/playerBalanceService');
const { findTransactionByRefId, saveTransaction } = require('../services/transactionService');

const Transaction = require('../models/transactionModel');
const PlaceBet = require('../models/placeBetModel');

const callBack = async (req, res) => {
    res.status(200).send("Hello callback");
};

const logTransactions = async (txns, username, productId, currency, balanceBefore, balanceAfter, timestampMillis) => {
    try {
        for (const txn of txns) {
            // Check for duplicate refId before creating the transaction
            const existingTransaction = await findTransactionByRefId(txn.txnId);
            if (!existingTransaction) {
                await Transaction.create({
                    username,
                    productId,
                    currency,
                    amount: -txn.betAmount,  // Negative because it's a bet
                    refId: txn.txnId,
                    status: txn.status,
                    roundId: txn.roundId,
                    gameCode: txn.gameCode,
                    playInfo: txn.playInfo,
                    transactionType: 'BY_TRANSACTION', // This could also be 'BY_ROUND' depending on the system design
                    timestampMillis,
                    balanceBefore,
                    balanceAfter
                });
            } else {
                console.log(`Transaction with refId ${txn.txnId} already exists.`);
            }
        }
        console.log('All transactions logged successfully');
    } catch (error) {
        console.error('Error logging transactions:', error);
        throw error; // Rethrowing error to be handled by the caller
    }
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
        // Calculate total bet amount
        const totalBetAmount = txns.reduce((sum, txn) => sum + txn.betAmount, 0);

        // Fetch current balance before placing bets
        const balanceBefore = await getPlayerBalance(username, currency);

        // Check for insufficient funds
        if (balanceBefore < totalBetAmount) {
            return res.status(200).json({
                id,
                statusCode: 10002,  // Custom error code for insufficient balance
                error: 'Insufficient Balance',
                timestampMillis,
                currency,
                username,
                productId,
                balance: balanceBefore  // Returning the current balance without change
            });
        }

        // Check for duplicate transactions
        for (const txn of txns) {
            const existingTransaction = await findTransactionByRefId(txn.txnId);
            if (existingTransaction) {
                return res.status(200).json({
                    id,
                    statusCode: 20002,  // Custom error code for duplicate transaction
                    error: 'Duplicate Transaction',
                    timestampMillis,
                    currency,
                    username,
                    productId,
                    balance: balanceBefore  // Returning the current balance without change
                });
            }
        }

        // Update the balance after placing bets
        await updatePlayerBalance(username, -totalBetAmount, currency);
        const balanceAfter = balanceBefore - totalBetAmount;

        // Log each transaction for placing bets
        await logTransactions(txns, username, productId, currency, balanceBefore, balanceAfter, timestampMillis);

        // Respond with the updated balance and transaction details
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
            balanceBefore: balanceBefore,  // Providing previous balance if available
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
        res.status(200).json({
            statusCode: 0,
            balance,
            message: 'Balance retrieved successfully'
        });
    } catch (error) {
        // Log the error for further investigation
        console.error('Failed to retrieve balance:', { error, username });

        // Check if it's a server availability issue
        if (error.code === 'ECONNREFUSED' || error.response.status === 503) {
            res.status(503).json({
                statusCode: 1,
                error: 'Service Unavailable',
                detail: 'The service is temporarily unavailable. Please try again later.'
            });
        } else {
            res.status(500).json({
                statusCode: 1,
                error: 'Internal Server Error',
                detail: error.message
            });
        }
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
        const netChange = totalPayout;
        
        // Update the user's balance
        await updatePlayerBalance(username, netChange, currency);
        const balanceAfter = balanceBefore + netChange;

        // Log each transaction
        await logTransactions(txns, username, productId, currency, balanceBefore, balanceAfter, timestampMillis);

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
    const { username, currency, txns, id, productId, timestampMillis } = req.body;
    try {
        // Calculate total refund amount
        const totalRefundAmount = txns.reduce((sum, txn) => sum + Math.abs(txn.betAmount), 0);
        
        // Get the user's balance before the refund
        const balanceBefore = await getPlayerBalance(username, currency);
        
        // Update the user's balance by adding the refund amount
        await updatePlayerBalance(username, totalRefundAmount, currency);
        const balanceAfter = balanceBefore + totalRefundAmount;

        // Log each transaction for auditing
        await logTransactions(txns, username, productId, currency, balanceBefore, balanceAfter, timestampMillis);

        // Respond with the updated balance information
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
        console.error('Failed to cancel bets:', { error, username });
        res.status(500).json({
            id,
            statusCode: 1,
            error: 'Internal Server Error',
            detail: error.message,
            timestampMillis,
            currency,
            username,
            productId,
            balanceBefore: undefined, // Not available due to error
            balanceAfter: undefined
        });
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
