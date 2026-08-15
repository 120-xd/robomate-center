/**
 * RoboMate — Web Serial + STK500v1 Core
 * 处理所有串口通信、烧录协议、指令发送
 */

const SerialCore = (() => {
    // ========== Private State ==========
    let port = null;
    let writer = null;
    let reader = null;

    const PAGE_SIZE = 128;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const BAUD_RATES = [115200, 57600, 9600];

    const SERIAL_OPTIONS = {
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        flowControl: 'none'
    };

    // ========== Public API ==========

    function isSupported() {
        return 'serial' in navigator;
    }

    /** 请求串口并打开 */
    async function connect(baudRate = 115200) {
        if (!isSupported()) {
            throw new Error('浏览器不支持 Web Serial API。请使用 Chrome 89+ 或 Edge 89+');
        }
        port = await navigator.serial.requestPort();
        await port.open({ baudRate, ...SERIAL_OPTIONS });
        writer = port.writable.getWriter();
        reader = port.readable.getReader();
    }

    /** 断开串口 */
    async function disconnect() {
        if (reader) { try { reader.releaseLock(); } catch (_) {} reader = null; }
        if (writer) { try { writer.releaseLock(); } catch (_) {} writer = null; }
        if (port) { try { await port.close(); } catch (_) {} port = null; }
    }

    function isConnected() {
        return port !== null && writer !== null;
    }

    // ========== 内部工具 ==========

    /** 关闭并以指定波特率重新打开串口（Windows 上 CreateFile 会触发 DTR 复位） */
    async function reopenPort(baud) {
        if (reader) { try { reader.releaseLock(); } catch (_) {} reader = null; }
        if (writer) { try { writer.releaseLock(); } catch (_) {} writer = null; }
        await port.close();
        await sleep(200);
        await port.open({ baudRate: baud, ...SERIAL_OPTIONS });
        await sleep(300); // 等待 Bootloader 初始化
        writer = port.writable.getWriter();
        reader = port.readable.getReader();
        await flushInput();
    }

    /** DTR 复位进入 Bootloader */
    async function resetToBootloader() {
        try {
            await port.setSignals({ dataTerminalReady: true });
            await sleep(10);
            await port.setSignals({ dataTerminalReady: false });
            await sleep(100);
            await port.setSignals({ dataTerminalReady: true });
            await sleep(300);
        } catch (e) {
            // setSignals 不支持的驱动（少数 CH340）→ 寄希望于 port.open() 时的 DTR 翻转
            await sleep(300);
        }
    }

    /** 清空串口接收缓冲区 */
    async function flushInput() {
        if (!reader) return;
        try {
            while (true) {
                const chunk = await Promise.race([
                    reader.read(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('FLUSH_DONE')), 150))
                ]);
                if (chunk.done) break;
            }
        } catch (e) {
            if (e.message !== 'FLUSH_DONE') throw e;
            try { reader.releaseLock(); } catch (_) {}
            reader = port.readable.getReader();
        }
    }

    /**
     * 读取应答（带超时）
     * deadline 模式：每次迭代创建新的超时 Promise，避免 Promise.race 复用已 settled 的 Promise
     */
    async function readResponse(expectedLen, timeoutMs = 5000) {
        if (!reader) return { data: new Uint8Array(0), complete: false };

        const buf = new Uint8Array(expectedLen);
        let offset = 0;
        const deadline = Date.now() + timeoutMs;

        while (offset < expectedLen) {
            const remaining = deadline - Date.now();
            if (remaining <= 0) {
                try { reader.releaseLock(); } catch (_) {}
                reader = port.readable.getReader();
                return { data: buf.slice(0, offset), complete: false };
            }

            let chunk;
            try {
                chunk = await Promise.race([
                    reader.read(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('READ_TIMEOUT')), remaining))
                ]);
            } catch (e) {
                if (e.message !== 'READ_TIMEOUT') throw e;
                try { reader.releaseLock(); } catch (_) {}
                reader = port.readable.getReader();
                return { data: buf.slice(0, offset), complete: false };
            }

            if (chunk.done) break;
            if (chunk.value && chunk.value.length > 0) {
                const toCopy = Math.min(chunk.value.length, expectedLen - offset);
                buf.set(chunk.value.subarray(0, toCopy), offset);
                offset += toCopy;
            }
        }

        return { data: buf.slice(0, offset), complete: offset === expectedLen };
    }

    // ========== STK500 握手 ==========

    /**
     * STK500 同步测试
     *
     * 策略：依次尝试 115200 → 57600 → 9600 三种波特率。
     * 每种波特率：DTR 复位 → 清空缓冲区 → 发 STK_GET_SYNC 三次。
     * 任一成功即返回，全部失败则报错。
     */
    async function syncTest() {
        for (const baud of BAUD_RATES) {
            if (baud !== 115200) await reopenPort(baud);
            await resetToBootloader();
            await flushInput();

            for (let i = 0; i < 3; i++) {
                try {
                    await writer.write(new Uint8Array([0x30, 0x20]));
                } catch (e) {
                    break; // writer 损坏，跳到下一波特率
                }

                const { data: resp, complete } = await readResponse(2, 2000);

                if (complete && resp[0] === 0x14 && resp[1] === 0x10) {
                    return { success: true, hexStr: '0x14 0x10', raw: resp, timeout: false };
                }

                if (resp.length > 0) {
                    await flushInput();
                }
            }
        }

        return { success: false, hexStr: '', raw: new Uint8Array(0), timeout: true };
    }

    // ========== STK500 编程 ==========

    /** 读取芯片签名 */
    async function readSignature() {
        await writer.write(new Uint8Array([0x75, 0x20]));
        const { data: resp, complete } = await readResponse(5);
        const hexStr = Array.from(resp).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ');
        if (complete && resp[0] === 0x14) {
            return { success: true, hexStr, signature: [resp[1], resp[2], resp[3]] };
        }
        return { success: false, hexStr, signature: null, timeout: !complete };
    }

    /** 进入编程模式（先 DTR 复位，因为 sync 后 Bootloader 可能已超时） */
    async function enterProgMode() {
        await resetToBootloader();
        await flushInput();
        await writer.write(new Uint8Array([0x50, 0x20]));
        const { data: resp, complete } = await readResponse(2, 3000);
        const hexStr = Array.from(resp).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ');
        if (!complete) {
            throw new Error('进入编程模式超时：串口无应答');
        }
        if (resp[0] === 0x14 && resp[1] === 0x10) {
            return { success: true, hexStr };
        }
        throw new Error('进入编程模式失败，响应: ' + hexStr);
    }

    /** 退出编程模式 */
    async function leaveProgMode() {
        await writer.write(new Uint8Array([0x51, 0x20]));
        return await readResponse(2);
    }

    // ========== Intel HEX 解析 & 烧录 ==========

    function parseHex(hexText) {
        const lines = hexText.trim().split('\n');
        const pages = [];
        let currentAddr = 0;
        let currentData = [];

        for (const line of lines) {
            if (!line.startsWith(':')) continue;
            const len = parseInt(line.slice(1, 3), 16);
            const addr = parseInt(line.slice(3, 7), 16);
            const type = parseInt(line.slice(7, 9), 16);
            const dataStr = line.slice(9, 9 + len * 2);

            if (type === 0x00) {
                if (currentData.length > 0 && addr !== currentAddr + currentData.length) {
                    while (currentData.length < PAGE_SIZE) currentData.push(0xFF);
                    pages.push({ addr: currentAddr, data: [...currentData] });
                    currentData = [];
                }
                if (currentData.length === 0) currentAddr = addr;
                for (let i = 0; i < len; i++) {
                    currentData.push(parseInt(dataStr.slice(i * 2, i * 2 + 2), 16));
                }
                while (currentData.length >= PAGE_SIZE) {
                    pages.push({ addr: currentAddr, data: currentData.slice(0, PAGE_SIZE) });
                    currentAddr += PAGE_SIZE;
                    currentData = currentData.slice(PAGE_SIZE);
                }
            }
        }
        if (currentData.length > 0) {
            while (currentData.length < PAGE_SIZE) currentData.push(0xFF);
            pages.push({ addr: currentAddr, data: currentData });
        }
        return pages;
    }

    function buildProgPageCmd(page) {
        const cmd = new Uint8Array(4 + page.data.length + 1);
        cmd[0] = 0x64;
        cmd[1] = 0x00;
        cmd[2] = page.data.length;
        cmd[3] = 0x46; // Flash
        for (let j = 0; j < page.data.length; j++) cmd[4 + j] = page.data[j];
        cmd[4 + page.data.length] = 0x20; // CRC_EOP
        return cmd;
    }

    /** 烧录 hex 数据（逐页写入） */
    async function burnHex(hexText, onProgress) {
        const pages = parseHex(hexText);
        const total = pages.length;
        pages.reverse(); // 高地址 → 低地址

        for (let i = 0; i < total; i++) {
            const page = pages[i];
            const wordAddr = page.addr / 2;

            // LOAD_ADDRESS
            await writer.write(new Uint8Array([0x55, wordAddr & 0xFF, (wordAddr >> 8) & 0xFF, 0x20]));
            await sleep(5);
            const { data: addrResp, complete: addrOk } = await readResponse(2);
            if (!addrOk) throw new Error(`页${i + 1} 设置地址超时：串口无应答`);
            if (!(addrResp[0] === 0x14 && addrResp[1] === 0x10)) {
                const hex = Array.from(addrResp).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ');
                throw new Error(`页${i + 1} 设置地址 0x${page.addr.toString(16)} 失败: ${hex}`);
            }

            // PROG_PAGE
            await writer.write(buildProgPageCmd(page));
            await sleep(15);
            const { data: progResp, complete: progOk } = await readResponse(2);
            if (!progOk) throw new Error(`页${i + 1} 写入超时：串口无应答`);
            if (!(progResp[0] === 0x14 && progResp[1] === 0x10)) {
                const hex = Array.from(progResp).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ');
                throw new Error(`页${i + 1} 写入失败: ${hex}`);
            }

            if (onProgress) onProgress(Math.round((i + 1) / total * 100), i + 1, total);
        }

        // 退出编程模式（Arduino 复位运行应用固件）
        await leaveProgMode();
        // 应用固件固定 115200，非 115200 同步的需切回
        await reopenPort(115200);

        return { pages: total, bytes: total * PAGE_SIZE };
    }

    // ========== 运行时指令 ==========

    async function sendCommand(cmd) {
        if (!writer) throw new Error('串口未连接');
        const encoder = new TextEncoder();
        await writer.write(encoder.encode(cmd + '\n'));
    }

    // ========== Exports ==========
    return {
        isSupported,
        connect,
        disconnect,
        isConnected,
        syncTest,
        readSignature,
        enterProgMode,
        leaveProgMode,
        parseHex,
        burnHex,
        sendCommand
    };
})();

// Browser global
if (typeof window !== 'undefined') window.SerialCore = SerialCore;
