const Transaction = require('../models/transactionModel');

const findTransactionByRefId = async (refId) => {
    try {
        const transaction = await Transaction.findOne({ refId });
        return transaction;
    } catch (error) {
        console.error('Error finding transaction by refId:', error);
        throw error;
    }
};

const saveTransaction = async (refId, status, amount, username) => {
    try {
        const transaction = new Transaction({ refId, status, amount, username });
        await transaction.save();
        console.log('Transaction saved successfully');
    } catch (error) {
        console.error('Error saving transaction:', error);
        throw error;
    }
};

module.exports = {
    findTransactionByRefId,
    saveTransaction
};
