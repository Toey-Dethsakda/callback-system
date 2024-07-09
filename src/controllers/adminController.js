const PlayerBalance = require('../models/playerBalanceModel');

exports.addBalance = async (req, res) => {
    const { username, balance, currency } = req.body;

    if (!username || !balance || !currency) {
        console.error('Missing required fields');
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        console.log('Finding player balance');
        let playerBalance = await PlayerBalance.findOne({ username: username, currency: currency });

        if (playerBalance) {
            console.log('Player balance found, updating balance');
            playerBalance.balance += balance;
            playerBalance.updatedAt = Date.now();
        } else {
            console.log('Player balance not found, creating new record');
            playerBalance = new PlayerBalance({
                username: username,
                balance: balance,
                currency: currency
            });
        }

        await playerBalance.save();
        console.log('Balance saved successfully');
        res.status(200).json({ message: 'Balance added successfully' });
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: 'Database error' });
    }
};
