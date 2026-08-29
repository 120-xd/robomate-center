const express = require('express');
const router = express.Router();
const db = require('../db');
const logger = require('../services/logger');
const profileManager = require('../services/profileManager');

function publicProfile(profile) {
    if (!profile) return null;
    return {
        id: profile.id,
        name: profile.name,
        type: profile.type,
        description: profile.description,
        hardware: profile.hardware,
        commands: profile.commands,
        commandFormat: profile.commandFormat,
        commandValidation: profile.commandValidation,
        semanticRules: profile.semanticRules,
        directionMap: profile.directionMap,
        promptExtras: profile.promptExtras,
        firmware: profile.firmware
    };
}

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

// ========== Model Management ==========

// GET /api/models - list all available robot models
router.get('/models', (req, res) => {
    try {
        const models = profileManager.list();
        res.json({ models, active: profileManager.activeId });
    } catch (e) {
        logger.error('Failed to list models', { error: e.message });
        res.status(500).json({ error: e.message });
    }
});

// GET /api/models/active - get current active model
router.get('/models/active', (req, res) => {
    try {
        const profile = profileManager.getActive();
        if (!profile) return res.status(404).json({ error: 'No active model' });
        res.json(publicProfile(profile));
    } catch (e) {
        logger.error('Failed to get active model', { error: e.message });
        res.status(500).json({ error: e.message });
    }
});

// POST /api/models/select - switch active model
router.post('/models/select', (req, res) => {
    try {
        const { modelId } = req.body;
        if (!modelId) return res.status(400).json({ error: 'modelId is required' });

        const profile = profileManager.setActive(modelId);
        logger.info(`Model switched to: ${modelId} (${profile.name})`);
        res.json({
            success: true,
            model: publicProfile(profile)
        });
    } catch (e) {
        logger.error('Failed to switch model', { error: e.message });
        res.status(400).json({ error: e.message });
    }
});

module.exports = router;
