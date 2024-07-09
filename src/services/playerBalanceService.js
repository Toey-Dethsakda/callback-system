const PlayerBalance = require('../models/playerBalanceModel');

const getPlayerBalance = async (username, currency) => {
    try {
        const balance = await PlayerBalance.findOne({ username, currency });
        return balance ? balance.balance : 0;
    } catch (error) {
        console.error('Error getting player balance:', error);
        throw error;
    }
};

const updatePlayerBalance = async (username, amount, currency) => {
    try {
        let playerBalance = await PlayerBalance.findOne({ username, currency });

        if (playerBalance) {
            playerBalance.balance += amount;
            playerBalance.updatedAt = Date.now();
        } else {
            playerBalance = new PlayerBalance({
                username,
                balance: amount,
                currency,
            });
        }

        await playerBalance.save();
        console.log('Player balance updated or created successfully');
    } catch (error) {
        console.error('Error updating or creating player balance:', error);
        throw error;
    }
};

module.exports = {
    getPlayerBalance,
    updatePlayerBalance,
};
