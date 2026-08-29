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
 * Returns: { commands: [{cmd: "FW 3"}], explanation: "...", code: "robot.forward(3);", modelId: "LH1" }
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

        // The snippet is explanatory only. Build it from the active profile and
        // never let AI invent an executable method or command mapping.
        const code = generateCodeSnippet(validCommands, profile);

        res.json({
            original: text,
            commands: validCommands,
            explanation: parsed.explanation || '',
            code,
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
        return /^(FW|BW|LT|RT)(\s+\d{1,2})?$|^(MW|HOME|START|STOP)$/.test(cmd);
    }).map(c => ({ cmd: c.cmd.toUpperCase().trim() }));
}

/** Fallback parser — delegates to profile-aware logic */
function fallbackParse(text, profile) {
    if (profile) {
        const result = profileManager.fallbackParse(profile, text);
        return {
            original: text,
            commands: filterCommands(result.commands, profile),
            explanation: result.explanation,
            code: generateCodeSnippet(filterCommands(result.commands, profile), profile),
            model: 'fallback-profile'
        };
    }
    // No profile loaded — should not happen in normal operation
    return { original: text, commands: [], explanation: '', code: '', model: 'fallback-generic' };
}

/** Generate Arduino-style code snippet from commands (local fallback) */
function generateCodeSnippet(commands, profile) {
    if (!commands || commands.length === 0) return '';
    const lines = [];
    for (const item of commands) {
        const parts = item.cmd.split(/\s+/);
        const op = parts[0];
        const val = parts[1];
        const definition = profile?.commands?.find(c => item.cmd === c.cmd || item.cmd.startsWith(c.cmd + ' '));
        const method = definition?.method;
        const label = definition?.label || op;
        const args = val && definition?.unit ? val : '';
        if (method) {
            lines.push(`robot.${method}(${args}); // ${label}${val && definition.unit ? val + definition.unit : ''}`);
        } else {
            lines.push(`robot.execute("${item.cmd.replace(/"/g, '\\"')}"); // ${label}`);
        }
    }
    return lines.join('\n');
}

/** Minimal default prompt when no profile is loaded */
function getDefaultPrompt() {
    return `你是机器人控制助手，把用户自然语言翻译为指令序列。
返回格式（严格JSON）：
{"commands":[{"cmd":"FW 3"}],"explanation":"前进3步"}
非指令内容：{"commands":[],"explanation":"友好引导用户说指令"}`;
}

module.exports = router;
