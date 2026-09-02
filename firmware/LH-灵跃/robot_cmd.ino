/*
 * ============================================================
 *  RoboMate LH8 — 灵跃机器人（Otto9 人形 + OLED 表情屏）
 * ============================================================
 *  主控: ATmega328P (Arduino Nano, 16MHz, 5V)
 *  协议: 115200 baud, 8N1, 指令以 '\n' 结尾
 *  空闲时不向串口输出（避免干扰 STK500 烧录）
 *
 *  【指令集】
 *    FW     1~20  前进 N 步
 *    BW     1~20  后退 N 步
 *    LT     1~20  左转 N 步
 *    RT     1~20  右转 N 步
 *    HOME   -     归中/停止
 *    STOP   -     停止
 *    TXT    <文字> 在 OLED 显示文字（支持中文/英文/数字）
 *    CLS    -     清屏
 *
 *  【OLED】SSD1306 128x64, I2C 地址 0x3C, 引脚 A4(SDA)/A5(SCL)
 *  中文字库为内置 16x16 点阵（宋体），见 han_font.h，
 *  若需显示其他汉字，重新运行 gen_han_font.py 生成后重新编译。
 * ============================================================
 */

#include <Otto9.h>
#include <Wire.h>
#include <EEPROM.h>
#include "han_font.h"

Otto9 otto1;

#define ECHO_CMD 0
#define MAX_STEPS 20

bool autoForward = true;   // 上电默认自动前进，收到 HOME/STOP 时停止

// ============================================================
//  SSD1306 128x64 最小驱动（I2C）
// ============================================================
#define OLED_ADDR 0x3C
#define OLED_W    128
#define OLED_H    64

static uint8_t oled_buf[OLED_W * OLED_H / 8];  // 1024 字节显存

static void oledCmd(uint8_t c) {
    Wire.beginTransmission(OLED_ADDR);
    Wire.write(0x00);
    Wire.write(c);
    Wire.endTransmission();
}

static void oledInit() {
    Wire.begin();
    Wire.setClock(400000);

    static const uint8_t initSeq[] PROGMEM = {
        0xAE,             // 显示关
        0xD5, 0x80,       // 时钟分频
        0xA8, 0x3F,       // 复用率 1/64
        0xD3, 0x00,       // 显示偏移
        0x40,             // 起始行 0
        0x8D, 0x14,       // 电荷泵
        0x20, 0x00,       // 内存寻址模式：水平
        0xA1,             // 段重映射
        0xC8,             // COM 扫描方向
        0xDA, 0x12,       // COM 引脚
        0x81, 0xCF,       // 对比度
        0xD9, 0xF1,       // 预充电
        0xDB, 0x40,       // VCOM 检测
        0xA4,             // 恢复显示 RAM
        0xA6,             // 正常显示
        0xAF              // 显示开
    };
    for (uint8_t i = 0; i < sizeof(initSeq); i++)
        oledCmd(pgm_read_byte(&initSeq[i]));

    oledClear();
    oledDisplay();
}

static void oledClear() {
    memset(oled_buf, 0, sizeof(oled_buf));
}

static void oledSetPixel(int16_t x, int16_t y, bool on) {
    if (x < 0 || x >= OLED_W || y < 0 || y >= OLED_H) return;
    uint16_t idx = x + (y >> 3) * OLED_W;
    uint8_t bit = 1 << (y & 7);
    if (on) oled_buf[idx] |= bit;
    else    oled_buf[idx] &= ~bit;
}

static void oledDisplay() {
    oledCmd(0x21); oledCmd(0x00); oledCmd(0x7F);  // 列地址 0~127
    oledCmd(0x22); oledCmd(0x00); oledCmd(0x07);  // 页地址 0~7
    for (uint16_t i = 0; i < sizeof(oled_buf); i += 16) {
        Wire.beginTransmission(OLED_ADDR);
        Wire.write(0x40);
        uint8_t n = (uint8_t)min(16, (int)(sizeof(oled_buf) - i));
        Wire.write(oled_buf + i, n);
        Wire.endTransmission();
    }
}

// ============================================================
//  字库查找与绘制
// ============================================================
// 在 HAN_FONT 中查找 UTF-8 三字节字符，返回下标；找不到返回 -1
static int16_t hanFind(const uint8_t* utf8) {
    for (uint16_t i = 0; i < HAN_FONT_COUNT; i++) {
        if (pgm_read_byte(&HAN_FONT[i].utf8[0]) == utf8[0] &&
            pgm_read_byte(&HAN_FONT[i].utf8[1]) == utf8[1] &&
            pgm_read_byte(&HAN_FONT[i].utf8[2]) == utf8[2])
            return i;
    }
    return -1;
}

static void oledHan(int16_t x, int16_t y, const uint8_t* utf8) {
    int16_t idx = hanFind(utf8);
    if (idx < 0) {  // 缺字：画空心框占位
        for (int i = 0; i < 16; i++) {
            oledSetPixel(x + i, y, true);
            oledSetPixel(x + i, y + 15, true);
            oledSetPixel(x, y + i, true);
            oledSetPixel(x + 15, y + i, true);
        }
        return;
    }
    for (uint8_t row = 0; row < 16; row++) {
        uint8_t b0 = pgm_read_byte(&HAN_FONT[idx].bmp[row * 2]);
        uint8_t b1 = pgm_read_byte(&HAN_FONT[idx].bmp[row * 2 + 1]);
        uint16_t line = ((uint16_t)b0 << 8) | b1;
        for (uint8_t col = 0; col < 16; col++) {
            if (line & (0x8000 >> col))
                oledSetPixel(x + col, y + row, true);
        }
    }
}

static void oledAscii(int16_t x, int16_t y, char c) {
    uint8_t idx;
    if (c < 0x20 || c > 0x7E) idx = 0;
    else                      idx = (uint8_t)c - 0x20;
    for (uint8_t row = 0; row < 8; row++) {
        uint8_t line = pgm_read_byte(&ASCII_FONT[idx][row]);
        for (uint8_t col = 0; col < 6; col++) {
            if (line & (0x80 >> col))
                oledSetPixel(x + col, y + row, true);
        }
    }
}

// 显示一段 UTF-8 文本（自动换行，最多 4 行）
static void oledShowText(const char* s) {
    oledClear();
    int16_t cx = 0, cy = 0;

    while (*s) {
        uint8_t c = (uint8_t)*s;

        if (c < 0x80) {              // ASCII
            if (cx + 6 > OLED_W) { cx = 0; cy += 16; }
            if (cy + 16 > OLED_H) break;
            oledAscii(cx, cy + 4, (char)c);
            cx += 6;
            s += 1;
        } else if ((c & 0xF0) == 0xE0) {  // 三字节 UTF-8（汉字）
            if (cx + 16 > OLED_W) { cx = 0; cy += 16; }
            if (cy + 16 > OLED_H) break;
            oledHan(cx, cy, (const uint8_t*)s);
            cx += 16;
            s += 3;
        } else {                     // 其他多字节字符：跳过
            if ((c & 0xE0) == 0xC0) s += 2;
            else if ((c & 0xF8) == 0xF0) s += 4;
            else s += 1;
        }
    }

    oledDisplay();
}

// ============================================================
//  OLED 文字持久化（EEPROM，前 4 字节留给舵机校准）
// ============================================================
#define EEPROM_TXT_LEN_ADDR 4
#define EEPROM_TXT_ADDR     5
#define EEPROM_TXT_MAX      63

static bool loadSavedText(char* out, size_t cap) {
    uint8_t len = EEPROM.read(EEPROM_TXT_LEN_ADDR);
    if (len == 0 || len >= cap) return false;   // 空或非法（新板 0xFF 也算非法）
    for (uint8_t i = 0; i < len; i++) out[i] = (char)EEPROM.read(EEPROM_TXT_ADDR + i);
    out[len] = '\0';
    return true;
}

static void saveText(const char* text) {
    size_t len = strlen(text);
    if (len > EEPROM_TXT_MAX) len = EEPROM_TXT_MAX;   // 截断保护

    bool changed = (EEPROM.read(EEPROM_TXT_LEN_ADDR) != (uint8_t)len);
    if (!changed) {
        for (size_t i = 0; i < len; i++) {
            if ((char)EEPROM.read(EEPROM_TXT_ADDR + i) != text[i]) { changed = true; break; }
        }
    }
    if (changed) {
        EEPROM.write(EEPROM_TXT_LEN_ADDR, (uint8_t)len);
        for (size_t i = 0; i < len; i++) EEPROM.write(EEPROM_TXT_ADDR + i, text[i]);
    }
}

// ============================================================
//  初始化
// ============================================================
void setup() {
    Serial.begin(115200);
    otto1.init(2, 3, 4, 5, true, A6, 13, 8, 9);
    otto1.setTrims(2, 3, 4, 5);
    otto1.home();

    oledInit();
    char saved[EEPROM_TXT_MAX + 1];
    if (loadSavedText(saved, sizeof(saved))) oledShowText(saved);
    else oledShowText("灵跃");
}

// ============================================================
//  主循环：串口指令优先，空闲自动前进（不吐串口）
//  用定长缓冲区读取，避免 String 动态内存（RAM 紧张）
// ============================================================
void loop() {
    if (Serial.available()) {
        char buf[64];
        size_t n = Serial.readBytesUntil('\n', buf, sizeof(buf) - 1);
        if (n > 0) {
            buf[n] = '\0';
            char* p = buf;
            while (*p == ' ' || *p == '\t' || *p == '\r') p++;   // 左 trim
            char* end = p + strlen(p);
            while (end > p && (end[-1] == ' ' || end[-1] == '\t' || end[-1] == '\r'))
                *--end = '\0';                                    // 右 trim
#if ECHO_CMD
            Serial.print("[LH8] "); Serial.println(p);
#endif
            if (*p) handleCommand(p);
        }
    } else if (autoForward) {
        otto1.walk(1, 750, FORWARD);   // 无指令时默认前进
    }
}

// ============================================================
//  指令解析与分发（C 字符串，零堆分配）
// ============================================================
void handleCommand(const char* line) {
    const char* sp = strchr(line, ' ');
    size_t headLen = sp ? (size_t)(sp - line) : strlen(line);

    char head[8];
    if (headLen >= sizeof(head)) headLen = sizeof(head) - 1;
    memcpy(head, line, headLen);
    head[headLen] = '\0';
    for (char* q = head; *q; q++) {          // ASCII 转大写
        if (*q >= 'a' && *q <= 'z') *q -= 32;
    }

    // 文本显示（保留原文，不做大小写转换）
    if (strcmp(head, "TXT") == 0) {
        const char* text = sp ? sp + 1 : "";
        while (*text == ' ' || *text == '\t') text++;
        oledShowText(text);
        saveText(text);
        return;
    }

    if (strcmp(head, "CLS") == 0) {
        oledClear();
        oledDisplay();
        EEPROM.write(EEPROM_TXT_LEN_ADDR, 0);   // 清屏同时清除记忆
        return;
    }

    int steps = 1;
    if (sp) steps = atoi(sp + 1);
    if (steps < 1) steps = 1;
    if (steps > MAX_STEPS) steps = MAX_STEPS;

    if      (strcmp(head, "FW")   == 0) { otto1.walk(steps, 750, FORWARD);  autoForward = true; }
    else if (strcmp(head, "BW")   == 0) { otto1.walk(steps, 750, BACKWARD); autoForward = true; }
    else if (strcmp(head, "LT")   == 0) { otto1.turn(steps, 2000, LEFT);    autoForward = true; }
    else if (strcmp(head, "RT")   == 0) { otto1.turn(steps, 2000, RIGHT);   autoForward = true; }
    else if (strcmp(head, "HOME") == 0) { otto1.home(); autoForward = false; }
    else if (strcmp(head, "STOP") == 0) { otto1.home(); autoForward = false; }
}
