const express = require('express');
const { auth } = require('../middleware/auth');
const router = express.Router();

router.get('/stats', auth, async (req, res) => {
  res.json({
    success: true,
    message: 'Admin stats endpoint working'
  });
});

module.exports = router;