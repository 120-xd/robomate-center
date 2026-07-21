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
        this.activeId = null;
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

        // Default active = first loaded
        if (!this.activeId && this.profiles.size > 0) {
            this.activeId = this.profiles.keys().next().value;
        }

        logger.info(`ProfileManager: ${this.profiles.size} profiles loaded, active=${this.activeId}`);
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
                active: id === this.activeId
            });
        }
        return result;
    }

    /** 获取当前激活的机型 */
    getActive() {
        if (!this.activeId) return null;
        return this.profiles.get(this.activeId) || null;
    }

    /** 切换当前机型 */
    setActive(id) {
        if (!this.profiles.has(id)) {
            throw new Error(`Unknown model: ${id}. Available: ${[...this.profiles.keys()].join(', ')}`);
        }
        this.activeId = id;
        logger.info(`Model switched to: ${id}`);
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
如果有可执行的指令：
{"commands":[{"cmd":"FW 3"},{"cmd":"LT 1"}],"explanation":"好的，前进3步，然后向左转1步！"}

如果是指令+闲聊混合：先处理指令，explanation 里既回应闲聊又说明指令
如果是纯闲聊：commands 为空数组，explanation 里友好回应并引导
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

        const shortcuts = profile.semanticRules.shortcuts || {};
        const commands = [];

        // Split by connectors
        const parts = text.split(/[然后接着再之后，,]\s*/);

        for (const part of parts) {
            const pt = part.replace(/[。！？、\s]/g, '').toLowerCase();
            if (!pt) continue;

            let matched = false;
            for (const [phrase, cmds] of Object.entries(shortcuts)) {
                if (pt.includes(phrase)) {
                    for (const cmd of cmds) {
                        // Replace {n} placeholder with extracted number or default 1
                        const numMatch = pt.match(/(\d+)/);
                        const n = numMatch ? numMatch[1] : '1';
                        commands.push({ cmd: cmd.replace('{n}', n) });
                    }
                    matched = true;
                    break;
                }
            }
            if (!matched) {
                // Try generic direction matching
                if (/前进|向前|往前|直走/.test(pt)) {
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
