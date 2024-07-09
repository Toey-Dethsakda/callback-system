const express = require('express');
const router = express.Router();
const { callBack, checkBalance, placeBets, updateBalance, getBalance, settleBets, cancelBets, adjustBets, rollbackBets, winRewards, payTips, cancelTips, voidSettled, adjustBalance } = require('../controllers/callbackController');

router.post('/', callBack);
router.post('/checkBalance', checkBalance);
router.post('/placeBets', placeBets);
router.post('/updateBalance', updateBalance);
router.post('/getBalance', getBalance);
router.post('/settleBets', settleBets);
router.post('/cancelBets', cancelBets);
router.post('/adjustBets', adjustBets);
router.post('/rollbackBets', rollbackBets);
router.post('/winRewards', winRewards);
router.post('/payTips', payTips);
router.post('/cancelTips', cancelTips);
router.post('/voidSettled', voidSettled);
router.post('/adjustBalance', adjustBalance);

module.exports = router;
