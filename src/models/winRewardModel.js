const mongoose = require('mongoose');

const WinRewardSchema = new mongoose.Schema({
    requestId: String,
    timestampMillis: Number,
    productId: String,
    currency: String,
    username: String,
    txns: [{
        id: String,
        payoutAmount: Number,
        gameCode: String,
        playInfo: String
    }],
    balanceBefore: Number,
    balanceAfter: Number
});

module.exports = mongoose.model('WinReward', WinRewardSchema);
