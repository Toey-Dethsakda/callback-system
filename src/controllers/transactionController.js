const { saveTransaction } = require('../services/transactionService');

const handleTransactionSave = async (req, res) => {
    const { refId, status, amount, username } = req.body;
    try {
        await saveTransaction(refId, status, amount, username);
        res.status(201).json({ message: 'Transaction saved successfully' });
    } catch (error) {
        if (error.message === 'Duplicate transaction') {
            res.status(409).json({ error: 'A transaction with this reference ID already exists.' });
        } else {
            res.status(500).json({ error: 'Internal Server Error', detail: error.message });
        }
    }
};