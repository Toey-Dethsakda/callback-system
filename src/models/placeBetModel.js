const mongoose = require('mongoose');

const TxnSchema = new mongoose.Schema({
    id: { type: String, required: true },
    status: { type: String, required: true },
    roundId: { type: String, required: true },
    betAmount: { type: Number, required: true },
    gameCode: { type: String, required: true },
    playInfo: { type: String, required: true },
    isFeature: { type: Boolean, required: true },
    isFeatureBuy: { type: Boolean, required: true },
    skipBalanceUpdate: { type: Boolean, required: true },
    txnId: { type: String }
});

const PlaceBetSchema = new mongoose.Schema({
    requestId: { type: String, required: true },
    timestampMillis: { type: Number, required: true },
    productId: { type: String, required: true },
    currency: { type: String, required: true },
    username: { type: String, required: true },
    txns: [TxnSchema],
    balanceBefore: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('PlaceBet', PlaceBetSchema);
