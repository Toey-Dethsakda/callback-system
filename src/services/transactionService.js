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
        // Check if the transaction already exists
        const existingTransaction = await findTransactionByRefId(refId);
        if (existingTransaction) {
            console.log('Transaction already exists:', refId);
            // Optionally update the existing transaction or return a message
            return { success: false, message: 'Transaction already exists' };
        }

        // If no existing transaction, create a new one
        const transaction = new Transaction({ refId, status, amount, username });
        await transaction.save();
        console.log('Transaction saved successfully');
        return { success: true, message: 'Transaction created' };
    } catch (error) {
        console.error('Error saving transaction:', error);
        throw error;
    }
};


module.exports = {
    findTransactionByRefId,
    saveTransaction
};
