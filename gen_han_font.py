# -*- coding: utf-8 -*-
"""
生成灵跃机器人 OLED 字库头文件 han_font.h
 - 中文: 宋体 simsun.ttc 16x16, row-major, MSB-first (与 MindPlus DFRobot 字模一致)
 - ASCII: 6x8 等宽字体
输出: firmware/LH-灵跃/han_font.h
"""
import os
from PIL import Image, ImageDraw, ImageFont

SIMHEI = r"C:\Windows\Fonts\simhei.ttf"
SIMSUN = r"C:\Windows\Fonts\simsun.ttc"
CONSOLA = r"C:\Windows\Fonts\consola.ttf"

OUT = r"C:\Users\120\Desktop\robomate-center\firmware\LH-灵跃\han_font.h"

# ---- 中文常用字符集（按需增删，重新运行本脚本即可） ----
HAN_CHARS = (
    # 名字 / 问候
    "灵跃你好嗨欢迎再见谢谢早安晚安早上"
    # 表情 / 情绪
    "开心高兴快乐难过生气愤怒惊讶害怕无聊伤心兴奋酷帅棒厉害太了加油爱你喜欢"
    # 动作 / 状态
    "前进后退左右转停止走跳停跑中"
    # 常用字
    "我你他她它的吗什么很在请问不会能有没大家是最"
    # 数字中文
    "一二三四五六七八九十"
    # 标点（全角，均 3 字节 UTF-8）
    "！？。，、：；…～（）“”‘’"
)

# 去重（保序）
seen = set()
chars = []
for ch in HAN_CHARS:
    if ch not in seen:
        seen.add(ch)
        chars.append(ch)


def render_han(ch, font_path, size=16):
    img = Image.new('1', (size, size), 0)
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(font_path, size)
    d.text((0, 0), ch, font=f, fill=1)
    return img


def han_to_bytes(img):
    out = []
    for y in range(16):
        row = 0
        for x in range(16):
            if img.getpixel((x, y)):
                row |= (1 << (15 - x))
        out.append((row >> 8) & 0xFF)
        out.append(row & 0xFF)
    return out


def render_ascii(code, font_path, w=6, h=8, size=8):
    img = Image.new('1', (w, h), 0)
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(font_path, size)
    d.text((0, -1), chr(code), font=f, fill=1)
    return img


def ascii_to_bytes(img, w=6, h=8):
    out = []
    for y in range(h):
        row = 0
        for x in range(w):
            if img.getpixel((x, y)):
                row |= (1 << (w - 1 - x))
        out.append(row)
    return out


def fmt_bytes(bs, per_line=8):
    lines = []
    for i in range(0, len(bs), per_line):
        lines.append(", ".join("0x%02x" % b for b in bs[i:i + per_line]))
    return ",\n        ".join(lines)


def main():
    lines = []
    lines.append("// 自动生成，勿手改。重新生成: python gen_han_font.py")
    lines.append("#ifndef HAN_FONT_H")
    lines.append("#define HAN_FONT_H")
    lines.append("#include <avr/pgmspace.h>")
    lines.append("")

    # ---- ASCII 6x8 ----
    lines.append("// ASCII 6x8, 0x20-0x7E, 每字符 8 字节(每字节一行, bit7=最左像素)")
    lines.append("static const uint8_t ASCII_FONT[][8] PROGMEM = {")
    for code in range(0x20, 0x7F):
        img = render_ascii(code, CONSOLA)
        bs = ascii_to_bytes(img)
        ch = chr(code)
        if ch == '\\':
            ch = '\\\\'
        elif ch == "'":
            ch = "\\'"
        lines.append("    { " + ", ".join("0x%02x" % b for b in bs) + " },  // '%s' (0x%02x)" % (ch, code))
    lines.append("};")
    lines.append("")

    # ---- 中文 16x16 ----
    lines.append("// 中文 16x16 (宋体), 每字符 32 字节 (16行x2字节, row-major, MSB-first)")
    lines.append("typedef struct { const uint8_t utf8[3]; const uint8_t bmp[32]; } HanGlyph;")
    lines.append("static const HanGlyph HAN_FONT[] PROGMEM = {")
    for ch in chars:
        b = ch.encode('utf-8')
        assert len(b) == 3, f"非三字节UTF8字符: {ch}"
        img = render_han(ch, SIMSUN)
        bs = han_to_bytes(img)
        lines.append("    { {0x%02x, 0x%02x, 0x%02x}, { %s } },  // %s" % (
            b[0], b[1], b[2], fmt_bytes(bs), ch))
    lines.append("};")
    lines.append("")
    lines.append("#define HAN_FONT_COUNT (sizeof(HAN_FONT) / sizeof(HanGlyph))")
    lines.append("#endif")

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    print(f"[OK] 生成 {len(chars)} 个汉字 + 95 个 ASCII -> {OUT}")
    print(f"     汉字: {''.join(chars)}")


if __name__ == "__main__":
    main()
