const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');

router.post('/addBalance', adminController.addBalance);

module.exports = router;
