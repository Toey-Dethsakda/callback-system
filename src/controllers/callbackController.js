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
            // ตรวจสอบ refId ที่ซ้ำก่อนที่จะสร้างการทำธุรกรรม
            const existingTransaction = await findTransactionByRefId(txn.txnId);
            if (!existingTransaction) {
                // คำนวณจำนวนเงิน, ตรวจสอบให้แน่ใจว่าเป็นตัวเลขที่ถูกต้อง
                const amount = txn.payoutAmount !== undefined && txn.betAmount !== undefined
                    ? txn.payoutAmount - Math.abs(txn.betAmount)
                    : 0;

                if (isNaN(amount)) {
                    throw new Error(`จำนวนเงินที่คำนวณได้เป็น NaN สำหรับ ID การทำธุรกรรม: ${txn.txnId}`);
                }

                await Transaction.create({
                    username,
                    productId,
                    currency,
                    amount,
                    refId: txn.txnId,
                    status: txn.status,
                    roundId: txn.roundId,
                    gameCode: txn.gameCode,
                    playInfo: txn.playInfo,
                    transactionType: 'BY_TRANSACTION', // อาจเป็น 'BY_ROUND' ขึ้นอยู่กับการออกแบบระบบ
                    timestampMillis,
                    balanceBefore,
                    balanceAfter
                });
            } else {
                console.log(`การทำธุรกรรมที่มี refId ${txn.txnId} มีอยู่แล้ว.`);
            }
        }
        console.log('บันทึกการทำธุรกรรมทั้งหมดสำเร็จ');
    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการบันทึกการทำธุรกรรม:', error);
        throw error; // ส่งต่อข้อผิดพลาดเพื่อให้ผู้เรียกจัดการ
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
        // คำนวณจำนวนเงินเดิมพันทั้งหมด
        const totalBetAmount = txns.reduce((sum, txn) => sum + txn.betAmount, 0);

        // ดึงยอดเงินปัจจุบันก่อนที่จะวางเดิมพัน
        const balanceBefore = await getPlayerBalance(username, currency);

        // ตรวจสอบยอดเงินไม่เพียงพอ
        if (balanceBefore < totalBetAmount) {
            return res.status(200).json({
                id,
                statusCode: 10002,  // รหัสข้อผิดพลาดที่กำหนดเองสำหรับยอดเงินไม่เพียงพอ
                error: 'Insufficient Balance',
                timestampMillis,
                currency,
                username,
                productId,
                balance: balanceBefore  // คืนยอดเงินปัจจุบันโดยไม่มีการเปลี่ยนแปลง
            });
        }

        // ตรวจสอบการทำธุรกรรมซ้ำ
        for (const txn of txns) {
            const existingTransaction = await findTransactionByRefId(txn.txnId);
            if (existingTransaction) {
                return res.status(200).json({
                    id,
                    statusCode: 20002,  // รหัสข้อผิดพลาดที่กำหนดเองสำหรับการทำธุรกรรมซ้ำ
                    error: 'Duplicate Transaction',
                    timestampMillis,
                    currency,
                    username,
                    productId,
                    balance: balanceBefore  // คืนยอดเงินปัจจุบันโดยไม่มีการเปลี่ยนแปลง
                });
            }
        }

        // อัปเดตยอดเงินหลังจากวางเดิมพัน
        await updatePlayerBalance(username, -totalBetAmount, currency);
        const balanceAfter = balanceBefore - totalBetAmount;

        // บันทึกการทำธุรกรรมแต่ละครั้งสำหรับการวางเดิมพัน
        await logTransactions(txns, username, productId, currency, balanceBefore, balanceAfter, timestampMillis);

        // ตอบกลับด้วยยอดเงินที่อัปเดตและรายละเอียดการทำธุรกรรม
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
        console.error('เกิดข้อผิดพลาดในการวางเดิมพัน:', { error, username, txns });
        res.status(500).json({
            id,
            statusCode: 1,
            error: 'Internal Server Error',
            detail: error.message,
            timestampMillis,
            currency,
            username,
            productId,
            balanceBefore: balanceBefore,  // ให้ยอดเงินก่อนหน้านี้หากมี
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

// ฟังก์ชั่นเพื่อดึงยอดเงิน
const getBalance = async (req, res) => {
    const { username, currency } = req.body;
    try {
        const balance = await getPlayerBalance(username, currency);
        res.status(200).json({
            statusCode: 0,
            balance,
            message: 'ดึงยอดเงินสำเร็จ'
        });
    } catch (error) {
        // บันทึกข้อผิดพลาดเพื่อการตรวจสอบเพิ่มเติม
        console.error('ดึงยอดเงินไม่สำเร็จ:', { error, username });

        // ตรวจสอบว่ามีปัญหาการให้บริการหรือไม่
        if (error.code === 'ECONNREFUSED' || error.response.status === 503) {
            res.status(503).json({
                statusCode: 1,
                error: 'Service Unavailable',
                detail: 'บริการชั่วคราวไม่พร้อมใช้งาน กรุณาลองใหม่ในภายหลัง.'
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
        // ตรวจสอบการทำธุรกรรมซ้ำ
        // for (const txn of txns) {
        //     const existingTransaction = await findTransactionByRefId(txn.txnId);
        //     console.log('existingTransaction = ', existingTransaction);
        //     if (existingTransaction) {
        //         return res.status(200).json({
        //             id,
        //             statusCode: 20002,  // รหัสข้อผิดพลาดที่กำหนดเองสำหรับการทำธุรกรรมซ้ำ
        //             error: 'Duplicate Transaction',
        //             timestampMillis,
        //             productId,
        //             balance: await getPlayerBalance(username, currency),
        //             balanceBefore: existingTransaction.balanceBefore,
        //             balanceAfter: existingTransaction.balanceAfter,
        //             username,
        //             currency
        //         });
        //     }
        // }

        // คำนวณการจ่ายเงินและการเดิมพันทั้งหมด
        let totalPayout = txns.reduce((acc, txn) => acc + txn.payoutAmount, 0);
        let totalBets = txns.reduce((acc, txn) => acc + Math.abs(txn.betAmount), 0);
        
        // ดึงยอดเงินของผู้ใช้ก่อนการทำธุรกรรม
        const balanceBefore = await getPlayerBalance(username, currency);
        
        // คำนวณการเปลี่ยนแปลงยอดเงินสุทธิ
        const netChange = totalPayout;
        
        // อัปเดตยอดเงินของผู้ใช้
        await updatePlayerBalance(username, netChange, currency);
        const balanceAfter = balanceBefore + netChange;

        // บันทึกการทำธุรกรรมแต่ละรายการ
        await logTransactions(txns, username, productId, currency, balanceBefore, balanceAfter, timestampMillis);

        // ส่งการตอบกลับด้วยข้อมูลยอดเงินที่อัปเดต
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
        console.error('เกิดข้อผิดพลาดในการชำระการเดิมพัน:', { error, username });
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
        // คำนวณจำนวนเงินคืนทั้งหมด
        const totalRefundAmount = txns.reduce((sum, txn) => sum + Math.abs(txn.betAmount), 0);
        
        // ดึงยอดเงินของผู้ใช้ก่อนการคืนเงิน
        const balanceBefore = await getPlayerBalance(username, currency);
        
        // อัปเดตยอดเงินของผู้ใช้โดยเพิ่มจำนวนเงินคืน
        await updatePlayerBalance(username, totalRefundAmount, currency);
        const balanceAfter = balanceBefore + totalRefundAmount;

        // บันทึกการทำธุรกรรมแต่ละรายการเพื่อการตรวจสอบ
        await logTransactions(txns, username, productId, currency, balanceBefore, balanceAfter, timestampMillis);

        // ตอบกลับด้วยข้อมูลยอดเงินที่อัปเดต
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
        console.error('ยกเลิกการเดิมพันไม่สำเร็จ:', { error, username });
        res.status(500).json({
            id,
            statusCode: 1,
            error: 'Internal Server Error',
            detail: error.message,
            timestampMillis,
            currency,
            username,
            productId,
            balanceBefore: undefined, // ไม่สามารถใช้ได้เนื่องจากข้อผิดพลาด
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
