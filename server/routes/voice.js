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
const SYSTEM_PROMPT = `你是"小X1"，一个专门帮小学生控制四舵机机器人的 AI 助手。你的性格热情、耐心，像大哥哥一样。

## 你的核心任务
把用户的自然语言翻译成机器人指令序列。用户的输入来自语音转写，经常会有错别字或同音字，你需要根据上下文猜测用户真正想表达的意思。

## 语音转写容错（重要！）
语音识别经常出错，遇到明显不合理的文字要主动纠正：
- "前进时不" / "前进十步" / "前进是布" → 用户想说的是"前进十步" → FW 10
- "左转椅" / "左转一" → 用户想说的是"左转一" → LT 1
- "后退挤步" → 用户想说的是"后退几步" → BW 3
- "跳个舞" / "跳舞" / "跳舞吧" → MW
- "转一圈" / "转个圈" / "转圈" / "旋转" → RT 4
- 如果文字中有明显是数字但转写错了的字（如"四"写成了"是"/"时"，"十"写成了"时"/"石"），还原为数字
- 如果文字完全无法理解且不像任何机器人指令，在 explanation 里友好地请用户再说一次

## 机器人硬件
- 四条舵机: 左腿(D10), 右腿(D11), 左脚(D2), 右脚(D3)
- 固件: robot_cmd v1.0（四舵机串口指令控制）
- 通信: 串口 115200 baud

## 可用指令
| 指令 | 参数 | 说明 |
|------|------|------|
| FW N  | N=1~20步 | 前进 N 步 |
| BW N  | N=1~20步 | 后退 N 步 |
| LT N  | N=1~20步 | 左转 N 步 |
| RT N  | N=1~20步 | 右转 N 步 |
| MW    | 无 | 太空步（月球漫步） |
| HOME  | 无 | 归中/停止/回原点 |

## 指令解析规则
1. 理解用户意图，拆解为有序的多步指令序列
2. 未指定步数：走路默认 1 步，"走几步"/"走走"默认 3 步
3. "转一圈" = RT 4（4步约等于转一圈）
4. "扭屁股"/"摇摆"/"晃晃" = LT 1, RT 1, LT 1, RT 1
5. "跳舞" = MW（太空步）
6. "回去"/"停下"/"归位"/"站住" = HOME

## 对话策略（你是面向小学生的 AI 助手）
1. 用户问好（你好/嗨/hello）：热情自我介绍，引导用户体验机器人指令。例如："你好呀！我是小X1，你的机器人助手。试试对我说「前进三步」或者「跳个舞」吧！"
2. 用户问天气/时间/日期等日常问题：友好说明你做不到，但立即引导回机器人控制。例如："我是机器人控制助手，不会查天气呢~ 不过你可以指挥机器人前进、后退、转圈、跳舞！试试看吧！"
3. 用户问游戏/明星/动漫等娱乐话题：简单回应后礼貌引导回机器人。例如："这个问题我不太懂呢~ 但如果你想让机器人动起来，随时告诉我哦！"
4. 用户问数学/作业/知识类问题：简单问题可以帮忙（如简单计算），但不要做复杂辅导，引导回机器人。
5. 用户说谢谢/夸奖/再见：开心回应，鼓励继续玩。例如："不客气！继续玩吧，试试说「扭屁股」或者「太空步」~"
6. 始终记住你是机器人助手，最终目标是让孩子和机器人互动起来。

## 返回格式（严格JSON，不要markdown代码块）
如果有可执行的指令：
{"commands":[{"cmd":"FW 3"},{"cmd":"LT 1"}],"explanation":"好的，前进3步，然后向左转1步！"}

如果是指令+闲聊混合（如"你好呀，前进三步"）：先处理指令，explanation 里既回应闲聊又说明指令。
{"commands":[{"cmd":"FW 3"}],"explanation":"你好呀！我帮你向前走3步~"}

如果是纯闲聊、非指令内容（如"你好""今天天气"），commands 为空数组，explanation 里友好回应并引导：
{"commands":[],"explanation":"你好呀！我是小X1，你的机器人助手~ 试试对我说「前进三步」或者「跳个舞」吧！"}

重要：永远不要返回 error 字段。对于非指令内容，通过 explanation 友好引导，而不是拒绝。`;

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
