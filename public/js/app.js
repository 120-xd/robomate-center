/**
 * RoboMate-X1 — Application Controller
 * UI state management, terminal, event coordination
 */

const App = (() => {
    const $ = id => document.getElementById(id);

    // ========== State ==========
    const state = {
        connected: false,
        burning: false,
        ready: false,
        currentDir: 'stop',
        apiBase: '/api',  // backend API base URL
        activeModel: null  // { id, name, type, commands, firmware }
    };

    // ========== DOM Cache ==========
    let els = {};

    function cacheDom() {
        els = {
            mainSphere: $('mainSphere'),
            robotStatusText: $('robotStatusText'),
            statusDot: $('statusDot'),
            connectionLabel: $('connectionLabel'),
            mainTip: $('mainTip'),
            subTip: $('subTip'),
            btnConnect: $('btnConnect'),
            btnBurn: $('btnBurn'),
            connectText: $('connectText'),
            connectIcon: $('connectIcon'),
            progressContainer: $('progressContainer'),
            progressCircle: $('progressCircle'),
            chatPanel: $('chatPanel'),
            actionGroup: $('actionGroup'),
            statusBar: $('statusBar'),
            directionIndicator: $('directionIndicator'),
            directionText: $('directionText'),
            arrowIcon: $('arrowIcon'),
            processingBars: $('processingBars'),
            listeningWave: $('listeningWave'),
            cmdInput: $('cmdInput'),
            btnMic: $('btnMic'),
            micIndicator: $('micIndicator'),
            modelName: $('modelName'),
            modelSelect: $('modelSelect')
        };
    }

    // ========== Progress Ring ==========
    const radius = 108;
    const circumference = radius * 2 * Math.PI;

    function initProgressRing() {
        els.progressCircle.style.strokeDasharray = `${circumference} ${circumference}`;
    }

    function updateProgress(percent) {
        const offset = circumference - (percent / 100 * circumference);
        els.progressCircle.style.strokeDashoffset = offset;
    }

    // ========== Chat Panel ==========
    function addChatMessage(type, text) {
        if (!els.chatPanel) return;
        const wrapper = document.createElement('div');
        wrapper.className = `chat-msg chat-msg-${type}`;

        const modelLabel = getModelLabel();

        if (type === 'user') {
            wrapper.innerHTML = `<span class="chat-label">你</span><span class="chat-text">${escapeHtml(text)}</span>`;
        } else if (type === 'ai') {
            wrapper.innerHTML = `<span class="chat-label">${modelLabel}</span><span class="chat-text">${escapeHtml(text)}</span>`;
        } else if (type === 'cmd') {
            wrapper.innerHTML = `<span class="chat-text">已执行: ${escapeHtml(text)}</span>`;
        } else {
            // system
            wrapper.innerHTML = `<span class="chat-text">${escapeHtml(text)}</span>`;
        }

        els.chatPanel.appendChild(wrapper);
        els.chatPanel.scrollTop = els.chatPanel.scrollHeight;
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // Keep for backward compat — routes to system chat messages
    function writeToTerminal(text, highlighted) {
        addChatMessage('system', text);
    }

    // ========== Helpers ==========
    function getModelDisplayName() {
        return state.activeModel ? state.activeModel.name : 'RoboMate-X1';
    }

    function getModelLabel() {
        return state.activeModel ? '小' + state.activeModel.id.toUpperCase() : '小X1';
    }

    // ========== UI Modes ==========
    function setUIMode(mode) {
        switch (mode) {
            case 'disconnected':
                els.mainSphere.className = 'pearl-sphere sphere-idle';
                els.listeningWave.classList.add('hidden');
                els.processingBars.classList.add('hidden');
                els.progressContainer.classList.add('hidden');
                els.mainTip.innerText = '等待连接机器人';
                els.subTip.innerText = `请先通过 USB 数据线连接您的 ${getModelDisplayName()}`;
                els.statusDot.className = 'w-2 h-2 rounded-full bg-gray-300';
                els.connectionLabel.innerText = '离线状态';
                els.robotStatusText.innerText = '未连接';
                els.statusBar.style.opacity = '0.6';
                els.directionIndicator.style.opacity = '0.2';
                els.actionGroup.classList.add('opacity-30', 'pointer-events-none');
                els.btnBurn.disabled = true;
                els.connectText.innerText = '连接 USB';
                els.connectIcon.setAttribute('icon', 'solar:usb-bold-duotone');
                els.btnConnect.classList.remove('bg-red-50/50');
                if (els.btnMic) els.btnMic.classList.remove('mic-active');
                break;

            case 'connecting':
                els.mainSphere.className = 'pearl-sphere sphere-connecting';
                els.mainTip.innerText = '正在初始化 USB 通道...';
                els.subTip.innerText = '正在建立安全握手协议';
                els.statusDot.className = 'w-2 h-2 rounded-full bg-blue-400 animate-pulse';
                els.connectionLabel.innerText = '正在连接...';
                els.robotStatusText.innerText = '连接中...';
                els.statusBar.style.opacity = '1';
                els.btnBurn.disabled = true;
                break;

            case 'synced':
                els.mainSphere.className = 'pearl-sphere sphere-idle';
                els.listeningWave.classList.remove('hidden');
                els.mainTip.innerText = '设备已同步';
                els.subTip.innerText = '点击「烧录固件」部署控制程序到机器人';
                els.statusDot.className = 'w-2 h-2 rounded-full bg-yellow-400';
                els.connectionLabel.innerText = '已同步 - 待烧录';
                els.robotStatusText.innerText = '待烧录';
                els.btnBurn.disabled = false;
                els.connectText.innerText = '断开连接';
                els.connectIcon.setAttribute('icon', 'solar:plug-circle-bold-duotone');
                els.btnConnect.classList.add('bg-red-50/50');
                break;

            case 'burning':
                els.mainSphere.className = 'pearl-sphere sphere-connecting';
                els.progressContainer.classList.remove('hidden');
                els.listeningWave.classList.add('hidden');
                els.mainTip.innerText = '正在部署控制固件';
                els.subTip.innerText = '版本 v1.0 - 正在写入核心主板驱动';
                els.statusDot.className = 'w-2 h-2 rounded-full bg-blue-400 animate-pulse';
                els.connectionLabel.innerText = '烧录中...';
                els.robotStatusText.innerText = '下载中...';
                els.btnBurn.disabled = true;
                break;

            case 'ready':
                els.mainSphere.className = 'pearl-sphere sphere-idle';
                els.listeningWave.classList.remove('hidden');
                els.progressContainer.classList.add('hidden');
                els.mainTip.innerText = '语音控制就绪';
                els.subTip.innerText = '点击麦克风语音控制，或在下方输入自然语言指令';
                els.statusDot.className = 'w-2 h-2 rounded-full bg-blue-500';
                els.connectionLabel.innerText = '已就绪';
                els.robotStatusText.innerText = '在线 - 聆听中';
                els.btnBurn.disabled = true;
                els.statusBar.style.opacity = '1';
                els.actionGroup.classList.remove('opacity-30', 'pointer-events-none');
                break;

            case 'error':
                els.mainSphere.className = 'pearl-sphere sphere-idle';
                els.listeningWave.classList.add('hidden');
                els.processingBars.classList.add('hidden');
                els.progressContainer.classList.add('hidden');
                els.statusDot.className = 'w-2 h-2 rounded-full bg-red-400';
                els.connectionLabel.innerText = '错误';
                break;
        }
    }

    // ========== Direction Indicator ==========
    let dirTimeout = null;
    function showDirection(cmd) {
        els.directionIndicator.style.opacity = '1';
        if (cmd.startsWith('FW')) {
            els.directionText.innerText = '前进';
            els.arrowIcon.style.transform = 'rotate(0deg)';
        } else if (cmd.startsWith('BW')) {
            els.directionText.innerText = '后退';
            els.arrowIcon.style.transform = 'rotate(180deg)';
        } else if (cmd.startsWith('LT')) {
            els.directionText.innerText = '左转';
            els.arrowIcon.style.transform = 'rotate(-90deg)';
        } else if (cmd.startsWith('RT')) {
            els.directionText.innerText = '右转';
            els.arrowIcon.style.transform = 'rotate(90deg)';
        } else if (cmd === 'MW') {
            els.directionText.innerText = '太空步';
        } else if (cmd === 'HOME') {
            els.directionText.innerText = '归中';
        }
        els.robotStatusText.innerText = `执行: ${cmd}`;
        els.mainTip.innerText = `已发送指令: ${cmd}`;

        clearTimeout(dirTimeout);
        dirTimeout = setTimeout(() => {
            els.directionIndicator.style.opacity = '0.2';
            els.directionText.innerText = '停止';
            els.robotStatusText.innerText = '在线 - 聆听中';
            els.mainTip.innerText = '语音控制就绪';
        }, 3000);
    }

    // ========== API Helpers ==========
    async function apiPost(path, body) {
        try {
            const res = await fetch(state.apiBase + path, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            return await res.json();
        } catch (e) {
            // Backend might not be running — that's OK
            return null;
        }
    }

    // ========== Model Management ==========
    let welcomeShown = false;

    async function loadModels() {
        try {
            const resp = await fetch(state.apiBase + '/models');
            const result = await resp.json();
            if (result && result.models) {
                populateModelSelector(result.models, result.active);
                await refreshActiveModel();
                showWelcomeMessage();
            }
        } catch (e) {
            els.modelSelect.innerHTML = '<option>X1</option>';
        }
    }

    function populateModelSelector(models, activeId) {
        if (!els.modelSelect) return;
        els.modelSelect.innerHTML = '';
        for (const m of models) {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.name;
            if (m.id === activeId) opt.selected = true;
            els.modelSelect.appendChild(opt);
        }
    }

    async function refreshActiveModel() {
        try {
            const resp = await fetch(state.apiBase + '/models/active');
            const model = await resp.json();
            if (model && model.id) {
                state.activeModel = model;
                refreshModelUI();
            }
        } catch (e) {
            // Backend not available
        }
    }

    function refreshModelUI() {
        if (!state.activeModel) return;
        if (els.modelName) els.modelName.textContent = state.activeModel.name;
        // Update subTip if in disconnected state (before connection)
        if (!state.connected) {
            els.subTip.innerText = `请先通过 USB 数据线连接您的 ${state.activeModel.name}`;
        }
    }

    async function switchModel(modelId) {
        if (!modelId || modelId === state.activeModel?.id) return;
        try {
            const resp = await fetch(state.apiBase + '/models/select', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ modelId })
            });
            const result = await resp.json();
            if (result.success) {
                state.activeModel = result.model;
                refreshModelUI();
                welcomeShown = false; // allow new welcome for new model
                showWelcomeMessage();
            }
        } catch (e) {
            addChatMessage('system', '切换机型失败');
        }
    }

    function showWelcomeMessage() {
        if (welcomeShown) return;
        if (!state.activeModel) return;
        welcomeShown = true;
        const label = getModelLabel();
        const name = state.activeModel.name;
        const hint = state.activeModel.type === 'vehicle'
            ? '试试说「启动」开始避障，或「前进」「左转」手动控制'
            : '试试说「前进三步」或「跳个舞」吧';
        addChatMessage('ai', `你好！我是${label}，你的${name}助手～连接 USB 并烧录固件后，就可以语音控制机器人啦！${hint}！`);
    }

    // ========== Connection Flow ==========
    async function toggleConnect() {
        if (state.burning) return;

        if (!state.connected) {
            try {
                setUIMode('connecting');
                writeToTerminal('INFO: 正在请求串口权限...');

                await SerialCore.connect(115200);
                state.connected = true;
                writeToTerminal('SUCCESS: USB 串口已连接 @ 115200 baud', true);

                // Auto sync test
                writeToTerminal('INFO: 正在进行 STK500 握手...');
                const syncResult = await SerialCore.syncTest();

                if (syncResult.success) {
                    writeToTerminal(`SUCCESS: STK500 同步通过 ${syncResult.hexStr}`, true);
                    apiPost('/events', { level: 'info', source: 'serial', message: 'STK500 sync success' });
                    setUIMode('synced');
                } else {
                    writeToTerminal(`WARN: 同步异常 ${syncResult.hexStr}`, false);
                    // Still allow burn attempt
                    setUIMode('synced');
                    els.btnBurn.disabled = false;
                }
            } catch (e) {
                writeToTerminal('ERROR: 连接失败 - ' + e.message);
                setUIMode('disconnected');
                state.connected = false;
                await SerialCore.disconnect();
            }
        } else {
            await SerialCore.disconnect();
            state.connected = false;
            state.ready = false;
            writeToTerminal('WARN: 连接已断开');
            writeToTerminal('// 系统就绪，等待固件注入...');
            apiPost('/events', { level: 'info', source: 'serial', message: 'Disconnected' });
            setUIMode('disconnected');
        }
    }

    // ========== Burn Flow ==========
    async function startBurning() {
        if (!state.connected || state.burning) return;

        try {
            state.burning = true;
            setUIMode('burning');
            updateProgress(0);
            writeToTerminal('========== 开始部署固件 ==========');

            // Fetch hex from server
            // Use active model's firmware path
            const firmwarePath = state.activeModel?.firmware
                ? '/' + state.activeModel.firmware
                : '/firmware/x1/robot_cmd.hex';

            let hexText;
            try {
                const resp = await fetch(firmwarePath);
                hexText = await resp.text();
                writeToTerminal(`INFO: 加载固件 ${firmwarePath}`, true);
            } catch {
                writeToTerminal('ERROR: 无法加载固件文件 /firmware/robot_cmd.hex');
                throw new Error('固件文件加载失败');
            }

            const pages = SerialCore.parseHex(hexText);
            writeToTerminal(`INFO: 固件解析完成: ${pages.length} 页 (${pages.length * 128} bytes)`, true);

            // Enter programming mode
            await SerialCore.enterProgMode();
            writeToTerminal('SUCCESS: 已进入编程模式', true);

            const startTime = Date.now();

            // Burn with progress
            const result = await SerialCore.burnHex(hexText, (pct, done, total) => {
                updateProgress(pct);
                if (done % 4 === 0 || done === total) {
                    writeToTerminal(`PROGRESS: 烧录 ${pct}% (${done}/${total} 页)`);
                }
            });

            const duration = Date.now() - startTime;
            updateProgress(100);

            // Ring flash animation
            els.progressCircle.classList.add('ring-flash');
            setTimeout(() => {
                els.progressContainer.classList.add('hidden');
                els.progressCircle.classList.remove('ring-flash');
            }, 500);

            state.ready = true;
            setUIMode('ready');
            writeToTerminal(`SUCCESS: 固件部署完成！${result.pages} 页 / ${result.bytes} bytes / ${duration}ms`, true);
            const cmdList = state.activeModel?.commands
                ? state.activeModel.commands.map(c => c.cmd + (c.params ? ' ' + c.params : '')).join(' | ')
                : 'FW N | BW N | LT N | RT N | MW | HOME';
            writeToTerminal(`READY: 可用指令: ${cmdList}`);

            apiPost('/flash', {
                firmwareVersion: 'v1.0.0',
                firmwareSize: result.bytes,
                pageCount: result.pages,
                success: true,
                durationMs: duration
            });

        } catch (e) {
            writeToTerminal('ERROR: 烧录失败 - ' + e.message);
            writeToTerminal('HINT: 请确认 Nano 已插好、Bootloader 完好，可尝试重新连接');
            setUIMode('error');
            state.ready = false;

            apiPost('/flash', {
                firmwareVersion: 'v1.0.0',
                success: false,
                errorMessage: e.message
            });
        } finally {
            state.burning = false;
        }
    }

    // ========== Raw Command Send (single direct command) ==========
    async function sendRawCommand(cmd) {
        if (!cmd) return;
        cmd = cmd.toUpperCase().trim();
        if (!cmd) return;

        if (state.ready && SerialCore.isConnected()) {
            try {
                await SerialCore.sendCommand(cmd);
                showDirection(cmd);
                apiPost('/commands', { command: cmd, source: 'manual' });
            } catch (e) {
                addChatMessage('system', '发送失败: ' + e.message);
            }
        } else if (state.connected && !state.ready) {
            addChatMessage('system', '请先烧录固件再发送指令');
        } else {
            addChatMessage('system', '请先连接 USB 并烧录固件');
        }
    }

    // Check if text looks like a raw command (e.g. "FW 3", "HOME", "MW")
    function isRawCommand(text) {
        return /^(FW|BW|LT|RT|MW|HOME)(\s+\d+)?$/i.test(text.trim());
    }

    // ========== Smart Text Command (text input → maybe AI → execute) ==========
    async function sendTextCommand(text) {
        if (!text) return;
        text = text.trim();
        if (!text) return;

        // If it's already a raw command, send directly
        if (isRawCommand(text)) {
            await sendRawCommand(text);
            return;
        }

        // Show user message in chat
        addChatMessage('user', text);
        els.mainTip.innerText = 'AI 正在理解...';
        await sendToAI(text, 'text');
    }

    // ========== Voice → AI → Execute ==========
    async function sendVoiceCommand(text) {
        if (!text) return;
        addChatMessage('user', text);
        await sendToAI(text, 'voice');
    }

    // Shared: send text to backend AI, then execute returned commands
    async function sendToAI(text, source) {
        const result = await apiPost('/voice/command', { text });

        if (!result) {
            // Backend not available — use local fallback
            addChatMessage('system', '后端服务不可用，使用本地解析');
            const cmd = localParseVoice(text);
            if (cmd) {
                addChatMessage('ai', `好的，执行指令: ${cmd}`);
                await sendRawCommand(cmd);
            } else {
                addChatMessage('ai', '抱歉，我没听懂。试试说「前进三步」或者「跳舞」吧！');
                els.mainTip.innerText = '无法理解，请再说一次';
            }
            return;
        }

        if (result.commands && result.commands.length > 0) {
            // AI returned commands — show explanation and execute
            if (result.explanation) {
                addChatMessage('ai', result.explanation);
            } else {
                addChatMessage('ai', `好的，执行: ${result.commands.map(c => c.cmd).join(' → ')}`);
            }
            els.mainTip.innerText = result.commands.map(c => c.cmd).join(' → ');

            for (const item of result.commands) {
                addChatMessage('cmd', item.cmd);
                await sendRawCommand(item.cmd);
                await new Promise(r => setTimeout(r, 300));
            }
            apiPost('/commands', { command: result.commands.map(c => c.cmd).join(','), source, rawVoiceText: text });
            els.mainTip.innerText = '语音控制就绪';
        } else if (result.explanation) {
            // AI returned a conversational response (no commands, just chat)
            addChatMessage('ai', result.explanation);
            els.mainTip.innerText = '语音控制就绪';
        } else if (result.error) {
            // Legacy error field — convert to friendly message
            addChatMessage('ai', result.error);
            els.mainTip.innerText = result.error;
        } else {
            // Nothing useful — fallback
            addChatMessage('ai', '抱歉，我没听懂。试试说「前进三步」或者「跳舞」吧！');
            els.mainTip.innerText = '无法理解，请再说一次';
        }
    }

    // Fallback local voice parsing
    function localParseVoice(text) {
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

    // ========== Web Speech API (Browser-based STT) ==========
    let recognition = null;
    let isListening = false;

    function initSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) return false;

        recognition = new SpeechRecognition();
        recognition.lang = 'zh-CN';
        recognition.continuous = false;
        recognition.interimResults = false;

        recognition.onresult = (event) => {
            const text = event.results[0][0].transcript;
            els.mainTip.innerText = '识别到: ' + text;
            sendVoiceCommand(text);
            stopListening();
        };

        recognition.onerror = (event) => {
            if (event.error !== 'aborted') {
                addChatMessage('system', '语音识别出错，请重试');
            }
            stopListening();
        };

        recognition.onend = () => {
            stopListening();
        };

        return true;
    }

    function startListening() {
        if (!recognition && !initSpeechRecognition()) {
            addChatMessage('system', '浏览器不支持语音识别，请使用 Chrome 浏览器');
            els.mainTip.innerText = '语音识别不可用';
            return;
        }
        if (!state.ready) {
            addChatMessage('system', '请先连接并烧录固件');
            return;
        }
        if (isListening) return;

        isListening = true;
        recognition.start();
        els.mainTip.innerText = '正在聆听...';
        els.subTip.innerText = '请说指令，例如「前进三步」';
        els.processingBars.classList.remove('hidden');
        els.listeningWave.classList.add('hidden');
        if (els.btnMic) els.btnMic.classList.add('mic-active');
        if (els.micIndicator) els.micIndicator.innerText = '聆听中...';
    }

    function stopListening() {
        isListening = false;
        els.processingBars.classList.add('hidden');
        els.listeningWave.classList.remove('hidden');
        if (els.btnMic) els.btnMic.classList.remove('mic-active');
        if (els.micIndicator) els.micIndicator.innerText = '';
        if (state.ready) {
            els.mainTip.innerText = '语音控制就绪';
            els.subTip.innerText = '点击麦克风语音控制，或在下方输入自然语言指令';
        }
    }

    function toggleMic() {
        if (isListening) {
            if (recognition) recognition.abort();
            stopListening();
        } else {
            startListening();
        }
    }

    // ========== Init ==========
    function init() {
        cacheDom();
        initProgressRing();

        // Wire up buttons
        els.btnConnect.addEventListener('click', toggleConnect);
        els.btnBurn.addEventListener('click', startBurning);
        if (els.btnMic) els.btnMic.addEventListener('click', toggleMic);

        // Enter key in input — route through AI
        if (els.cmdInput) {
            els.cmdInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    sendTextCommand(els.cmdInput.value.trim());
                    els.cmdInput.value = '';
                }
            });
        }

        // Init speech recognition
        initSpeechRecognition();

        // Load available robot models
        loadModels();

        // Wire up model selector
        if (els.modelSelect) {
            els.modelSelect.addEventListener('change', () => {
                switchModel(els.modelSelect.value);
            });
        }

        // Welcome message is shown by loadModels() after model data arrives
    }

    // ========== Public API ==========
    return {
        init,
        toggleConnect,
        startBurning,
        sendCommand: sendRawCommand,
        sendTextCommand,
        sendVoiceCommand,
        toggleMic,
        writeToTerminal
    };
})();

// Auto-init on DOM ready
document.addEventListener('DOMContentLoaded', () => App.init());
