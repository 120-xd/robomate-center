// ============================================================
// AI 语音服务 (占位模块)
// 后续在此接入：
//   - Azure Speech Services (语音识别 + 合成)
//   - OpenAI Whisper / GPT-4o (语音理解)
//   - 本地 VAD (语音活动检测)
//   - WebRTC 流式音频处理
// ============================================================

class VoiceService {
    constructor() {
        this.provider = null;       // 'azure' | 'openai' | 'local'
        this.isConfigured = false;
        this.activeSession = null;
    }

    // 检查语音服务是否已配置
    checkConfig() {
        if (process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION) {
            this.provider = 'azure';
            this.isConfigured = true;
            return true;
        }
        if (process.env.OPENAI_API_KEY) {
            this.provider = 'openai';
            this.isConfigured = true;
            return true;
        }
        return false;
    }

    // 语音识别 (STT) — 占位
    async speechToText(audioBuffer) {
        if (!this.isConfigured) {
            throw new Error('Voice service not configured. Set AZURE_SPEECH_KEY or OPENAI_API_KEY in .env');
        }
        // TODO: 实现真实的 STT
        throw new Error('STT not yet implemented');
    }

    // 文字转语音 (TTS) — 占位
    async textToSpeech(text) {
        if (!this.isConfigured) {
            throw new Error('Voice service not configured');
        }
        // TODO: 实现真实的 TTS
        throw new Error('TTS not yet implemented');
    }

    // 指令理解 (NLU) — 占位
    async understandIntent(text) {
        if (!this.isConfigured) {
            throw new Error('Voice service not configured');
        }
        // TODO: 调用 LLM 理解意图并映射为机器人指令
        throw new Error('NLU not yet implemented');
    }
}

module.exports = new VoiceService();
