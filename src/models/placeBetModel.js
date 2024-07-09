const mongoose = require('mongoose');

const TxnSchema = new mongoose.Schema({
    id: { type: String, required: true },
    txnId: { type: String, default: function() { return this.id; } }, // Defaults to the value of id if not provided
    gameCode: { type: String, required: true },
    status: { type: String, required: true },
    roundId: { type: String, required: true },
    betAmount: { type: Number, required: true },
    playInfo: { type: String, required: true, default: 'UNKNOWN' }, // Default to 'UNKNOWN' if not provided
    isFeature: { type: Boolean, required: true, default: false },
    isFeatureBuy: { type: Boolean, required: true, default: false },
    skipBalanceUpdate: { type: Boolean, required: true, default: false }
});

const PlaceBetSchema = new mongoose.Schema({
    requestId: { type: String, required: true },
    timestampMillis: { type: Number, required: true },
    productId: { type: String, required: true },
    currency: { type: String, required: true },
    username: { type: String, required: true },
    txns: [TxnSchema],
    balanceBefore: { type: Number, required: true },
    balanceAfter: { type: Number, required: true }
}, {
    timestamps: true // Automatically adds createdAt and updatedAt timestamps
});

module.exports = mongoose.model('PlaceBet', PlaceBetSchema);
