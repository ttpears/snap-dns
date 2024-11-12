// Handle Mattermost webhook notifications
const express = require('express');
const router = express.Router();

router.post('/mattermost', async (req, res) => {
  try {
    const { text, token } = req.body;
    
    // Validate webhook
    if (!token) {
      return res.status(401).json({ error: 'Missing authentication token' });
    }

    // Basic validation of message content
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Invalid or missing message text' });
    }

    // Process the message - you can customize this based on your needs
    console.log('Received Mattermost message:', text);

    // Send success response
    res.status(200).json({ status: 'success' });
  } catch (error) {
    console.error('Mattermost webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router; 