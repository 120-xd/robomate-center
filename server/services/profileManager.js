/**
 * ProfileManager — 机器人机型描述文件管理
 * 加载 profiles/ 目录下的所有 JSON，提供查询和 AI 提示词生成
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

class ProfileManager {
    constructor() {
        this.profiles = new Map();
        this.profilesDir = path.join(__dirname, '..', '..', 'profiles');
    }

    /** 加载所有机型描述文件 */
    loadAll() {
        if (!fs.existsSync(this.profilesDir)) {
            logger.warn(`Profiles directory not found: ${this.profilesDir}`);
            return;
        }

        const files = fs.readdirSync(this.profilesDir).filter(f => f.endsWith('.json'));
        this.profiles.clear();

        for (const file of files) {
            try {
                const fullPath = path.join(this.profilesDir, file);
                const raw = fs.readFileSync(fullPath, 'utf-8');
                const profile = JSON.parse(raw);

                if (!profile.id) {
                    logger.warn(`Profile ${file} missing 'id' field, skipping`);
                    continue;
                }

                this.profiles.set(profile.id, profile);
                logger.info(`Profile loaded: ${profile.id} (${profile.name})`);
            } catch (e) {
                logger.error(`Failed to load profile ${file}: ${e.message}`);
            }
        }

        // Model selection is request-scoped. Do not keep a process-wide
        // active model because multiple browsers may use this server.
        logger.info(`ProfileManager: ${this.profiles.size} profiles loaded`);
    }

    /** 获取指定机型 */
    get(id) {
        return this.profiles.get(id) || null;
    }

    /** 列出所有机型（摘要） */
    list() {
        const result = [];
        for (const [id, p] of this.profiles) {
            result.push({
                id: p.id,
                name: p.name,
                type: p.type,
                description: p.description,
                active: false
            });
        }
        return result;
    }

    /** 切换当前机型 */
    setActive(id) {
        if (!this.profiles.has(id)) {
            throw new Error(`Unknown model: ${id}. Available: ${[...this.profiles.keys()].join(', ')}`);
        }
        logger.info(`Model selected for request: ${id}`);
        return this.profiles.get(id);
    }

    /** 从 profile 生成 AI 系统提示词 */
    generateSystemPrompt(profile) {
        if (!profile) return '';

        const id = profile.id.toUpperCase();
        const typeLabel = { humanoid: '人形机器人', vehicle: '智能小车', arm: '机械臂' }[profile.type] || '机器人';

        // 硬件组件描述
        const hwLines = profile.hardware.components.map(c =>
            `- ${c.name} (${c.pin}${c.type ? ', ' + c.type : ''})`
        ).join('\n');

        // 指令表
        const cmdLines = profile.commands.map(c =>
            `| ${c.cmd}${c.params ? ' ' + c.params : ''} | ${c.params ? c.params : '无'} | ${c.desc} |`
        ).join('\n');

        // 语义快捷方式
        const shortcutLines = Object.entries(profile.semanticRules.shortcuts || {})
            .map(([phrase, cmds]) => `- "${phrase}" → ${cmds.join(', ')}`)
            .join('\n');

        const defaultSteps = profile.semanticRules.defaultSteps || 1;
        const severalSteps = profile.semanticRules.severalSteps || 3;
        const maxSteps = profile.semanticRules.maxSteps || 20;
        const codeRules = profile.commands.map(c =>
            `- ${c.cmd}${c.method ? ` → robot.${c.method}(${c.params ? '参数' : ''})` : ' → robot.execute(原始串口命令)'}`
        ).join('\n');

        return `你是"小${profile.id.toUpperCase()}"，一个专门帮小学生控制${typeLabel}的 AI 助手。你的性格热情、耐心，像大哥哥一样。

## 机器人介绍
${profile.description}
${profile.promptExtras || ''}

## 机器人硬件
- 主控: ${profile.hardware.chip}
- 通信: ${profile.hardware.communication}
${hwLines}

## 可用指令
| 指令 | 参数 | 说明 |
|------|------|------|
${cmdLines}

## 指令格式
${profile.commandFormat}（N 范围 1~${maxSteps}）

## 语义规则
- 未指定步数：走路默认 ${defaultSteps} 步，"走几步"/"走走"默认 ${severalSteps} 步
${shortcutLines}

## 语音转写容错（重要！）
语音识别经常出错，遇到明显不合理的文字要主动纠正：
- 同音/近音字还原：如"时不"/"是布"→"十步"，"左转椅"→"左转一"
- 数字模糊时取最可能的数值
- 完全无法理解时，友好地请用户再说一次

## 对话策略（你是面向小学生的 AI 助手）
1. 用户问好（你好/嗨/hello）：热情自我介绍，引导用户体验机器人指令
2. 用户问天气/时间等日常问题：友好说明你做不到，但立即引导回机器人控制
3. 用户问游戏/明星等娱乐话题：简单回应后礼貌引导回机器人
4. 用户问简单数学/知识：可以帮忙但不要做复杂辅导，引导回机器人
5. 用户说谢谢/夸奖/再见：开心回应，鼓励继续玩
6. 始终记住你是机器人助手，最终目标是让孩子和机器人互动起来

## 返回格式（严格JSON，不要markdown代码块）
如果有可执行的指令，除 commands 和 explanation 外，还要包含一个 code 字段，里面是给孩子展示的 Arduino 代码片段：
{"commands":[{"cmd":"FW 3"},{"cmd":"LT 1"}],"explanation":"好的，前进3步，然后向左转1步！","code":"// 前进3步，然后左转\nrobot.forward(3);\nrobot.turnLeft(1);"}

code 字段要求：
- 第一行用 // 写上这段代码的功能（中文）
- 每行一条 robot.xxx() 调用，行尾用 // 注释说明中文含义
- 不需要 #include、setup()、loop() 等框架代码，只写核心控制语句
${codeRules}
- 代码要通俗易懂，让小学生也能看懂「AI 写的代码」

如果是指令+闲聊混合：先处理指令，explanation 里既回应闲聊又说明指令
如果是纯闲聊：commands 为空数组，explanation 里友好回应并引导，不需要 code 字段
{"commands":[],"explanation":"你好呀！我是小${profile.id.toUpperCase()}，你的机器人助手~ 试试对我说「前进三步」吧！"}

重要：永远不要返回 error 字段。对于非指令内容，通过 explanation 友好引导。`;
    }

    /** 获取当前机型的指令校验正则 */
    getCommandValidation(profile) {
        return profile?.commandValidation || null;
    }

    /** 从当前机型的 shortcuts 做本地 fallback 解析 */
    fallbackParse(profile, text) {
        if (!profile) return { commands: [], explanation: '' };

        const shortcuts = Object.entries(profile.semanticRules.shortcuts || {})
            // Prefer a specific phrase (e.g. "自动爬行") over a shorter one ("爬行").
            .sort((a, b) => b[0].length - a[0].length);
        const commands = [];

        const chineseNumber = (value) => {
            const digits = { '\u96f6': 0, '\u4e00': 1, '\u4e8c': 2, '\u4e24': 2, '\u4e09': 3, '\u56db': 4, '\u4e94': 5, '\u516d': 6, '\u4e03': 7, '\u516b': 8, '\u4e5d': 9 };
            if (/^\d+$/.test(value)) return value;
            if (value === '\u5341') return '10';
            const ten = value.indexOf('\u5341');
            if (ten >= 0) {
                const left = ten ? (digits[value[0]] || 1) : 1;
                const right = ten < value.length - 1 ? (digits[value[ten + 1]] || 0) : 0;
                return String(left * 10 + right);
            }
            return digits[value] == null ? '1' : String(digits[value]);
        };

        const extractSteps = (value) => {
            const match = value.match(/(\d+|[\u96f6\u4e00\u4e8c\u4e24\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341]{1,3})/);
            return match ? chineseNumber(match[1]) : '1';
        };

        // Split by connectors
        const parts = text.split(/\s*(?:然后|接着|再|之后|，|,)\s*/);

        for (const part of parts) {
            const pt = part.replace(/[。！？、\s]/g, '').toLowerCase();
            if (!pt) continue;

            // These high-priority intents must win over the generic "爬行" shortcut.
            if (/自\u52a8|自\u4e3b/.test(pt) && /爬\u884c|避\u969c/.test(pt)) {
                commands.push({ cmd: 'START' });
                continue;
            }
            if (/测\u8ddd|距\u79bb/.test(pt)) {
                commands.push({ cmd: 'DIST' });
                continue;
            }

            let matched = false;
            for (const [phrase, cmds] of shortcuts) {
                if (pt.includes(phrase)) {
                    for (const cmd of cmds) {
                        // Replace {n} placeholder with extracted number or default 1
                        const n = extractSteps(pt);
                        commands.push({ cmd: cmd.replace('{n}', n) });
                    }
                    matched = true;
                    break;
                }
            }
            if (!matched) {
                // 显示文字：显示/写上/打出 xxx → TXT xxx
                const showMatch = part.match(/^(?:显示屏显示|屏幕显示|显示|写上|打出)\s*(.+)$/);
                if (showMatch && showMatch[1].trim()) {
                    commands.push({ cmd: `TXT ${showMatch[1].trim()}` });
                } else if (/前进|向前|往前|直走/.test(pt)) {
                    const steps = pt.match(/(\d+)/);
                    commands.push({ cmd: `FW ${steps ? steps[1] : '1'}` });
                } else if (/后退|向后|往后退|倒车/.test(pt)) {
                    const steps = pt.match(/(\d+)/);
                    commands.push({ cmd: `BW ${steps ? steps[1] : '1'}` });
                } else if (/左转|向左|往左/.test(pt)) {
                    const steps = pt.match(/(\d+)/);
                    commands.push({ cmd: `LT ${steps ? steps[1] : '1'}` });
                } else if (/右转|向右|往右/.test(pt)) {
                    const steps = pt.match(/(\d+)/);
                    commands.push({ cmd: `RT ${steps ? steps[1] : '1'}` });
                }
            }
        }

        return {
            commands,
            explanation: commands.length > 0
                ? `本地解析: ${commands.map(c => c.cmd).join(' → ')}`
                : ''
        };
    }
}

// Singleton
module.exports = new ProfileManager();
