const mongoose = require('mongoose');

const AdjustBetSchema = new mongoose.Schema({
    requestId: String,
    timestampMillis: Number,
    productId: String,
    currency: String,
    username: String,
    txns: [{
        id: String,
        status: String, // 'CREDIT' or 'DEBIT'
        amount: Number,
        refId: String // If applicable
    }],
    balanceBefore: Number,
    balanceAfter: Number
});

module.exports = mongoose.model('AdjustBet', AdjustBetSchema);
