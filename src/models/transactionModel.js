const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    refId: { type: String, required: true, unique: true },
    status: { type: String, required: true },
    amount: { type: Number, required: true },
    username: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = Transaction;
