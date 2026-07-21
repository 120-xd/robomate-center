const express = require('express');
const router = express.Router();
const logger = require('../services/logger');

// ============================================================
// AI 语义理解 — deepseek-v4-pro Agent
// 将自然语言文本解析为机器人指令序列
// ============================================================

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

// 固件上下文 — 注入给 AI 的完整机器人能力描述
const SYSTEM_PROMPT = `你是一个四舵机机器人的控制大脑。你的任务是把用户的自然语言指令翻译成机器人可以执行的指令序列。

## 机器人硬件
- 四条舵机: 左腿(D10), 右腿(D11), 左脚(D2), 右脚(D3)
- 固件: robot_cmd v1.0 (四舵机串口指令控制)
- 通信: 串口 115200 baud, 每条指令以换行符结束

## 可用指令
| 指令 | 参数 | 说明 |
|------|------|------|
| FW N  | N=1~20步 | 前进 N 步 |
| BW N  | N=1~20步 | 后退 N 步 |
| LT N  | N=1~20步 | 左转 N 步 |
| RT N  | N=1~20步 | 右转 N 步 |
| MW    | 无 | 太空步(月球漫步) |
| HOME  | 无 | 归中/停止/回到原点 |

## 解析规则
1. 理解用户的自然语言意图，拆解为有序的多步指令序列
2. 如果没有指定步数，默认使用 1 步(走路)或 3 步(表示"走几步")
3. "转一圈" = RT 4 (4步约等于转一圈)
4. "扭屁股" = 左右交替: LT 1, RT 1, LT 1, RT 1
5. "跳舞" = MW (太空步)
6. "回去"/"停下"/"归位" = HOME
7. 对于日常对话或非指令内容(如"你好""今天天气"), 返回 {"error": "这不是机器人指令，请尝试说前进、后退、左转、右转、太空步等"}
8. 保持友好，在 explanation 字段用中文简短解释你的理解

## 返回格式（严格JSON，不要markdown代码块）
{"commands":[{"cmd":"FW 3"},{"cmd":"LT 1"}],"explanation":"前进3步后向左转1步"}

如果用户的输入不涉及机器人动作，返回:
{"commands":[],"error":"请说机器人指令，例如：前进、后退、左转、太空步"}`;

/**
 * POST /api/voice/command
 * Body: { text: "往前走三步然后转一圈" }
 * Returns: { commands: [{cmd: "FW 3"}, {cmd: "RT 4"}], explanation: "..." }
 */
router.post('/command', async (req, res) => {
    try {
        const { text } = req.body;
        if (!text) return res.status(400).json({ error: 'text is required', commands: [] });

        logger.info(`Voice input: "${text}"`);

        // If no API key, fall back to simple regex parser
        if (!DEEPSEEK_API_KEY) {
            logger.warn('No DEEPSEEK_API_KEY configured, using fallback parser');
            const result = fallbackParse(text);
            return res.json(result);
        }

        // Call deepseek-v4
        const response = await fetch(DEEPSEEK_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: text }
                ],
                temperature: 0.3,
                max_tokens: 500
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            logger.error(`Deepseek API error: ${response.status} ${errText}`);
            // Fallback to regex
            const result = fallbackParse(text);
            return res.json(result);
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
            const result = fallbackParse(text);
            return res.json(result);
        }

        // Validate
        if (!parsed.commands || !Array.isArray(parsed.commands)) {
            parsed.commands = [];
        }

        // Filter to valid commands only
        const validCommands = parsed.commands.filter(c => {
            const cmd = (c.cmd || '').toUpperCase().trim();
            return /^(FW|BW|LT|RT)\s+\d{1,2}$/.test(cmd) ||
                   /^(MW|HOME)$/.test(cmd);
        }).map(c => ({ cmd: c.cmd.toUpperCase().trim() }));

        logger.info(`AI parsed: "${text}" → [${validCommands.map(c => c.cmd).join(', ')}]`);

        res.json({
            original: text,
            commands: validCommands,
            explanation: parsed.explanation || '',
            error: parsed.error || '',
            model: 'deepseek-v4'
        });

    } catch (e) {
        logger.error('Voice command error', { error: e.message });
        const result = fallbackParse(req.body?.text || '');
        res.json(result);
    }
});

// ========== Fallback: Regex-based parser (no API key needed) ==========
function fallbackParse(text) {
    const t = text.replace(/[，。！？、\s]/g, '').toLowerCase();
    const commands = [];

    // 尝试匹配多步指令
    // "前进3步然后左转" → FW 3, LT 1
    // "前进3步然后左转2步" → FW 3, LT 2

    // Split by connectors
    const parts = text.split(/[然后接着再之后，,]\s*/);

    for (const part of parts) {
        const pt = part.replace(/[。！？、\s]/g, '').toLowerCase();
        if (!pt) continue;

        if (/前进|向前|往前|直走|走|往前/.test(pt)) {
            const steps = pt.match(/(\d+)/);
            commands.push({ cmd: `FW ${steps ? steps[1] : '1'}` });
        } else if (/后退|向后|往后退|倒车|往后/.test(pt)) {
            const steps = pt.match(/(\d+)/);
            commands.push({ cmd: `BW ${steps ? steps[1] : '1'}` });
        } else if (/左转|向左|往左/.test(pt)) {
            const steps = pt.match(/(\d+)/);
            commands.push({ cmd: `LT ${steps ? steps[1] : '1'}` });
        } else if (/右转|向右|往右/.test(pt)) {
            const steps = pt.match(/(\d+)/);
            commands.push({ cmd: `RT ${steps ? steps[1] : '1'}` });
        } else if (/太空步|太空|月球漫步|moonwalk/i.test(pt)) {
            commands.push({ cmd: 'MW' });
        } else if (/归中|回中|回家|home|停|停止|站住/i.test(pt)) {
            commands.push({ cmd: 'HOME' });
        } else if (/跳舞|舞蹈|dance/i.test(pt)) {
            commands.push({ cmd: 'MW' });
        } else if (/转圈|转一圈|转个圈|旋转/.test(pt)) {
            commands.push({ cmd: 'RT 4' });
        } else if (/扭|摇摆|晃/.test(pt)) {
            commands.push({ cmd: 'LT 1' }, { cmd: 'RT 1' }, { cmd: 'LT 1' }, { cmd: 'RT 1' });
        }
    }

    if (commands.length === 0) {
        // Check whole text
        if (/前进|向前|往前|走/.test(t)) {
            const steps = t.match(/(\d+)/);
            commands.push({ cmd: `FW ${steps ? steps[1] : '1'}` });
        } else if (/后退|向后|往后/.test(t)) {
            const steps = t.match(/(\d+)/);
            commands.push({ cmd: `BW ${steps ? steps[1] : '1'}` });
        } else if (/左转|向左/.test(t)) {
            const steps = t.match(/(\d+)/);
            commands.push({ cmd: `LT ${steps ? steps[1] : '1'}` });
        } else if (/右转|向右/.test(t)) {
            const steps = t.match(/(\d+)/);
            commands.push({ cmd: `RT ${steps ? steps[1] : '1'}` });
        } else if (/太空步|月球|moonwalk/i.test(t)) {
            commands.push({ cmd: 'MW' });
        } else if (/转圈|一圈/.test(t)) {
            commands.push({ cmd: 'RT 4' });
        } else if (/归|停|home/i.test(t)) {
            commands.push({ cmd: 'HOME' });
        }
    }

    return {
        original: text,
        commands,
        explanation: commands.length > 0 ? `本地解析: ${commands.map(c => c.cmd).join(' → ')}` : '',
        model: 'fallback-regex'
    };
}

module.exports = router;
