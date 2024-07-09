const mongoose = require('mongoose');

const playerBalanceSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
    },
    balance: {
        type: Number,
        required: true,
    },
    currency: {
        type: String,
        required: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    updatedAt: {
        type: Date,
        default: Date.now,
    }
});

const PlayerBalance = mongoose.model('PlayerBalance', playerBalanceSchema);

module.exports = PlayerBalance;
