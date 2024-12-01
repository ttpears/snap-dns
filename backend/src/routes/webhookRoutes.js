const express = require('express');
const dns = require('dns-packet');
const ip = require('ip');

const router = express.Router();

router.post('/dns-query', (req, res) => {
    try {
        const packet = dns.decode(req.body);
        
        // Extract relevant information
        const response = {
            id: packet.id,
            type: packet.type,
            questions: packet.questions.map(q => ({
                name: q.name,
                type: q.type,
                class: q.class
            }))
        };

        if (packet.answers) {
            response.answers = packet.answers.map(a => ({
                name: a.name,
                type: a.type,
                class: a.class,
                ttl: a.ttl,
                data: a.data
            }));
        }

        // Add source IP information
        response.sourceIP = ip.address();
        
        res.json(response);

    } catch (error) {
        console.error('Error processing DNS query:', error);
        res.status(400).json({ 
            error: 'Invalid DNS packet',
            details: error.message 
        });
    }
});

module.exports = router; 