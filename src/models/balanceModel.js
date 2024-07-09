const mongoose = require('mongoose');

const BalanceSchema = new mongoose.Schema({
    requestId: { type: String, required: true },
    timestampMillis: { type: Number, required: true },
    productId: { type: String, required: true },
    currency: { type: String, required: true },
    username: { type: String, required: true },
    balance: { type: Number, required: true },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Balance', BalanceSchema);
