const express = require('express');
const router = express.Router();
const logger = require('../services/logger');
const profileManager = require('../services/profileManager');

// ============================================================
// AI 语义理解 — deepseek-v4-pro Agent
// 根据当前激活的机器人机型动态生成系统提示词
// ============================================================

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

/**
 * POST /api/voice/command
 * Body: { text: "往前走三步然后转一圈" }
 * Returns: { commands: [{cmd: "FW 3"}, {cmd: "RT 4"}], explanation: "...", modelId: "x1" }
 */
router.post('/command', async (req, res) => {
    try {
        const { text } = req.body;
        if (!text) return res.status(400).json({ error: 'text is required', commands: [] });

        const profile = profileManager.getActive();
        const modelId = profile ? profile.id : 'unknown';

        logger.info(`[${modelId}] Voice input: "${text}"`);

        // If no API key, fall back to profile-based parser
        if (!DEEPSEEK_API_KEY) {
            logger.warn('No DEEPSEEK_API_KEY configured, using fallback parser');
            const result = fallbackParse(text, profile);
            return res.json({ ...result, modelId });
        }

        // Generate system prompt from active profile
        const systemPrompt = profile
            ? profileManager.generateSystemPrompt(profile)
            : getDefaultPrompt();

        // Call deepseek
        const response = await fetch(DEEPSEEK_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: text }
                ],
                temperature: 0.3,
                max_tokens: 500
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            logger.error(`Deepseek API error: ${response.status} ${errText}`);
            const result = fallbackParse(text, profile);
            return res.json({ ...result, modelId });
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';

        // Parse JSON from AI response (strip possible markdown fences)
        let parsed;
        try {
            const cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
            parsed = JSON.parse(cleaned);
        } catch (e) {
            logger.error(`Failed to parse AI response: ${content}`);
            const result = fallbackParse(text, profile);
            return res.json({ ...result, modelId });
        }

        // Validate
        if (!parsed.commands || !Array.isArray(parsed.commands)) {
            parsed.commands = [];
        }

        // Filter to valid commands using profile's validation pattern
        const validCommands = filterCommands(parsed.commands, profile);

        logger.info(`[${modelId}] AI parsed: "${text}" → [${validCommands.map(c => c.cmd).join(', ')}]`);

        res.json({
            original: text,
            commands: validCommands,
            explanation: parsed.explanation || '',
            error: parsed.error || '',
            model: 'deepseek-v4',
            modelId
        });

    } catch (e) {
        logger.error('Voice command error', { error: e.message });
        const profile = profileManager.getActive();
        const result = fallbackParse(req.body?.text || '', profile);
        res.json({ ...result, modelId: profile?.id || 'unknown' });
    }
});

// ========== Helpers ==========

/** Filter and normalize commands against the active profile's validation pattern */
function filterCommands(commands, profile) {
    const validationPattern = profileManager.getCommandValidation(profile);

    return commands.filter(c => {
        const cmd = (c.cmd || '').toUpperCase().trim();
        if (validationPattern) {
            return new RegExp(validationPattern).test(cmd);
        }
        // Fallback default validation
        return /^(FW|BW|LT|RT)\s+\d{1,2}$|^(MW|HOME|START|STOP)$/.test(cmd);
    }).map(c => ({ cmd: c.cmd.toUpperCase().trim() }));
}

/** Fallback parser using profile shortcuts */
function fallbackParse(text, profile) {
    if (profile) {
        const result = profileManager.fallbackParse(profile, text);
        return {
            original: text,
            commands: result.commands,
            explanation: result.explanation,
            model: 'fallback-profile'
        };
    }

    // Generic fallback (no profile loaded)
    const commands = [];
    const t = text.replace(/[，。！？、\s]/g, '').toLowerCase();

    const patterns = [
        { regex: /前进|向前|往前|直走|走/, cmd: 'FW', defaultN: '1' },
        { regex: /后退|向后|往后退|倒车/, cmd: 'BW', defaultN: '1' },
        { regex: /左转|向左|往左/, cmd: 'LT', defaultN: '1' },
        { regex: /右转|向右|往右/, cmd: 'RT', defaultN: '1' },
    ];

    for (const { regex, cmd, defaultN } of patterns) {
        if (regex.test(t)) {
            const steps = t.match(/(\d+)/);
            commands.push({ cmd: `${cmd} ${steps ? steps[1] : defaultN}` });
        }
    }

    if (/太空步|月球|moonwalk|跳舞|舞蹈/i.test(t)) commands.push({ cmd: 'MW' });
    if (/转圈|一圈/.test(t)) commands.push({ cmd: 'RT 4' });
    if (/归|停|home/i.test(t)) commands.push({ cmd: 'HOME' });

    return {
        original: text,
        commands,
        explanation: commands.length > 0 ? `本地解析: ${commands.map(c => c.cmd).join(' → ')}` : '',
        model: 'fallback-generic'
    };
}

/** Minimal default prompt when no profile is loaded */
function getDefaultPrompt() {
    return `你是机器人控制助手，把用户自然语言翻译为指令序列。
返回格式（严格JSON）：
{"commands":[{"cmd":"FW 3"}],"explanation":"前进3步"}
非指令内容：{"commands":[],"explanation":"友好引导用户说指令"}`;
}

module.exports = router;
