const express = require('express');
const router = express.Router();
const db = require('../db');
const logger = require('../services/logger');

// GET /api/health - health check
router.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// GET /api/commands - recent commands
router.get('/commands', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const commands = db.getRecentCommands(limit);
        res.json({ count: commands.length, commands });
    } catch (e) {
        logger.error('Failed to fetch commands', { error: e.message });
        res.status(500).json({ error: e.message });
    }
});

// GET /api/commands/stats - command statistics
router.get('/commands/stats', (req, res) => {
    try {
        const stats = db.getCommandStats();
        res.json({ stats });
    } catch (e) {
        logger.error('Failed to fetch command stats', { error: e.message });
        res.status(500).json({ error: e.message });
    }
});

// POST /api/commands - log a command from frontend
router.post('/commands', (req, res) => {
    try {
        const { command, source, rawVoiceText } = req.body;
        if (!command) return res.status(400).json({ error: 'command is required' });
        db.logCommand(command, source || 'manual', rawVoiceText || null);
        logger.info(`Command logged: ${command} [${source || 'manual'}]`);
        res.status(201).json({ success: true });
    } catch (e) {
        logger.error('Failed to log command', { error: e.message });
        res.status(500).json({ error: e.message });
    }
});

// POST /api/flash - log a flash event
router.post('/flash', (req, res) => {
    try {
        const { firmwareVersion, firmwareSize, pageCount, success, errorMessage, durationMs } = req.body;
        db.logFlash(firmwareVersion, firmwareSize, pageCount, success, errorMessage, durationMs);
        logger.info(`Flash logged: ${firmwareVersion} success=${success}`);
        res.status(201).json({ success: true });
    } catch (e) {
        logger.error('Failed to log flash', { error: e.message });
        res.status(500).json({ error: e.message });
    }
});

// GET /api/events - recent system events
router.get('/events', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const events = db.getRecentEvents(limit);
        res.json({ count: events.length, events });
    } catch (e) {
        logger.error('Failed to fetch events', { error: e.message });
        res.status(500).json({ error: e.message });
    }
});

// POST /api/events - log an event from frontend
router.post('/events', (req, res) => {
    try {
        const { level, source, message, metadata } = req.body;
        db.logEvent(level || 'info', source || 'system', message, metadata);
        res.status(201).json({ success: true });
    } catch (e) {
        logger.error('Failed to log event', { error: e.message });
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
