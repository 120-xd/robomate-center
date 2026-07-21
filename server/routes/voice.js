const express = require('express');
const router = express.Router();
const logger = require('../services/logger');

// ============================================================
// AI 语音接口 (占位 — 后续接入语音识别/合成服务)
// ============================================================

// POST /api/voice/command - 接收语音文本，解析为机器人指令
router.post('/command', (req, res) => {
    try {
        const { text } = req.body;
        if (!text) return res.status(400).json({ error: 'text is required' });

        // 简易指令映射 (后续替换为 AI/NLP 解析)
        const command = parseVoiceCommand(text);
        logger.info(`Voice parsed: "${text}" → "${command}"`);

        res.json({
            original: text,
            command: command,
            confidence: command ? 1.0 : 0.0
        });
    } catch (e) {
        logger.error('Voice command parsing failed', { error: e.message });
        res.status(500).json({ error: e.message });
    }
});

// POST /api/voice/synthesize - 文字转语音 (占位)
router.post('/synthesize', (req, res) => {
    // TODO: 接入 TTS 服务 (Azure / OpenAI / 百度)
    res.json({
        message: 'TTS not yet configured. Set AZURE_SPEECH_KEY in .env',
        text: req.body.text
    });
});

// GET /api/voice/sessions - 获取历史对话
router.get('/sessions', (req, res) => {
    // TODO: 从 voice_session 表读取
    res.json({ sessions: [], message: 'Voice sessions will be available after AI integration' });
});

// 简易中文指令解析 (后续升级为 AI 模型)
function parseVoiceCommand(text) {
    const t = text.replace(/[，。！？、\s]/g, '').toLowerCase();

    if (/前进|向前|往前|直走|走/.test(t)) {
        const steps = t.match(/(\d+)/);
        return steps ? `FW ${steps[1]}` : 'FW 1';
    }
    if (/后退|向后|往后退|倒车/.test(t)) {
        const steps = t.match(/(\d+)/);
        return steps ? `BW ${steps[1]}` : 'BW 1';
    }
    if (/左转|向左|往左/.test(t)) {
        const steps = t.match(/(\d+)/);
        return steps ? `LT ${steps[1]}` : 'LT 1';
    }
    if (/右转|向右|往右/.test(t)) {
        const steps = t.match(/(\d+)/);
        return steps ? `RT ${steps[1]}` : 'RT 1';
    }
    if (/太空步|太空|月球漫步|moonwalk/i.test(t)) return 'MW';
    if (/归中|回中|回家|home/i.test(t)) return 'HOME';
    if (/跳舞|舞蹈|dance/i.test(t)) return 'MW';
    if (/停|停止|站住/.test(t)) return 'HOME';

    return null;
}

module.exports = router;
