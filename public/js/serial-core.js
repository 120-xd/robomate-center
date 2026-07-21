/**
 * RoboMate-X1 — Web Serial + STK500v1 Core
 * 处理所有串口通信、烧录协议、指令发送
 */

const SerialCore = (() => {
    // ========== Private State ==========
    let port = null;
    let writer = null;
    let reader = null;

    const PAGE_SIZE = 128;
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    // ========== Public API ==========

    /** 检查浏览器是否支持 Web Serial */
    function isSupported() {
        return 'serial' in navigator;
    }

    /** 请求串口并打开 */
    async function connect(baudRate = 115200) {
        if (!isSupported()) {
            throw new Error('浏览器不支持 Web Serial API。请使用 Chrome 89+ 或 Edge 89+');
        }
        port = await navigator.serial.requestPort();
        await port.open({ baudRate });
        writer = port.writable.getWriter();
        reader = port.readable.getReader();
    }

    /** 断开串口 */
    async function disconnect() {
        if (reader) { try { reader.releaseLock(); } catch (_) {} reader = null; }
        if (writer) { try { writer.releaseLock(); } catch (_) {} writer = null; }
        if (port) { try { await port.close(); } catch (_) {} port = null; }
    }

    /** 是否已连接 */
    function isConnected() {
        return port !== null && writer !== null;
    }

    /** DTR 复位进入 Bootloader */
    async function resetToBootloader() {
        await port.setSignals({ dataTerminalReady: false });
        await sleep(100);
        await port.setSignals({ dataTerminalReady: true });
        await sleep(200);
    }

    /** 读取应答（带超时 + reader 重建） */
    async function readResponse(expectedLen, timeoutMs = 5000) {
        if (!reader) return new Uint8Array(0);
        const buf = new Uint8Array(expectedLen);
        let offset = 0;
        let expired = false;

        const timer = setTimeout(() => {
            expired = true;
            try { reader.releaseLock(); } catch (_) {}
            reader = port.readable.getReader();
        }, timeoutMs);

        try {
            while (offset < expectedLen && !expired) {
                const result = await reader.read(new Uint8Array(expectedLen - offset));
                if (result.value) {
                    buf.set(result.value, offset);
                    offset += result.value.length;
                }
                if (result.done) break;
            }
        } catch (_) {
            // reader was released by timeout
        } finally {
            clearTimeout(timer);
        }
        return buf.slice(0, offset);
    }

    /** STK500 同步测试 */
    async function syncTest() {
        await resetToBootloader();
        await writer.write(new Uint8Array([0x30, 0x20]));
        const resp = await readResponse(2);
        const hexStr = Array.from(resp).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ');
        const success = resp.length === 2 && resp[0] === 0x14 && resp[1] === 0x10;
        return { success, hexStr, raw: resp };
    }

    /** 读取芯片签名 */
    async function readSignature() {
        await writer.write(new Uint8Array([0x75, 0x20]));
        const resp = await readResponse(5);
        const hexStr = Array.from(resp).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ');
        if (resp.length >= 5 && resp[0] === 0x14) {
            const sig = [resp[1], resp[2], resp[3]];
            return { success: true, hexStr, signature: sig };
        }
        return { success: false, hexStr, signature: null };
    }

    /** 进入编程模式 */
    async function enterProgMode() {
        await resetToBootloader();
        await writer.write(new Uint8Array([0x50, 0x20]));
        const resp = await readResponse(2);
        const hexStr = Array.from(resp).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ');
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

    /** 解析 Intel HEX */
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

    /** 烧录 hex 数据（逐页写入） */
    async function burnHex(hexText, onProgress) {
        const pages = parseHex(hexText);
        const total = pages.length;

        // 从高地址往低地址写
        pages.reverse();

        for (let i = 0; i < total; i++) {
            const page = pages[i];
            const wordAddr = page.addr / 2;
            const addrHi = (wordAddr >> 8) & 0xFF;
            const addrLo = wordAddr & 0xFF;

            // LOAD_ADDRESS (低字节在前)
            await writer.write(new Uint8Array([0x55, addrLo, addrHi, 0x20]));
            await sleep(5);
            const addrResp = await readResponse(2);
            if (!(addrResp[0] === 0x14 && addrResp[1] === 0x10)) {
                const hex = Array.from(addrResp).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ');
                throw new Error(`页${i + 1} 设置地址 0x${page.addr.toString(16)} 失败: ${hex}`);
            }

            // PROG_PAGE: 4头 + 128数据 + 1EOP = 133 字节
            const size = page.data.length;
            const cmd = new Uint8Array(4 + size + 1);
            cmd[0] = 0x64;
            cmd[1] = 0x00;
            cmd[2] = size;
            cmd[3] = 0x46; // Flash
            for (let j = 0; j < size; j++) cmd[4 + j] = page.data[j];
            cmd[4 + size] = 0x20; // CRC_EOP

            await writer.write(cmd);
            await sleep(15);
            const progResp = await readResponse(2);
            if (!(progResp[0] === 0x14 && progResp[1] === 0x10)) {
                const hex = Array.from(progResp).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ');
                throw new Error(`页${i + 1} 写入失败: ${hex}`);
            }

            if (onProgress) onProgress(Math.round((i + 1) / total * 100), i + 1, total);
        }

        // 退出编程模式
        await leaveProgMode();
        return { pages: total, bytes: total * PAGE_SIZE };
    }

    /** 发送串口指令 */
    async function sendCommand(cmd) {
        if (!writer) throw new Error('串口未连接');
        const encoder = new TextEncoder();
        const data = encoder.encode(cmd + '\n');
        await writer.write(data);
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
        sendCommand,
        readResponse,
        resetToBootloader
    };
})();

// Browser global
if (typeof window !== 'undefined') window.SerialCore = SerialCore;
