/*
 * ============================================================
 *  RoboMate LH8 — 灵跃机器人
 * ============================================================
 *  协议: 115200 baud, {CMD} [N] + '\n'
 *  空闲时不向串口输出（避免干扰 STK500 烧录）
 * ============================================================
 */

#include <Servo.h>

#define MAX_STEPS 20
#define ECHO_CMD  0

const int PIN_SLF = 2;  // 左前腿
const int PIN_SRF = 3;  // 右前腿
const int PIN_SLB = 4;  // 左后腿
const int PIN_SRB = 5;  // 右后腿

// 180° 舵机常用角度
const int ANGLE_CENTER = 90;
const int ANGLE_LOW    = 45;
const int ANGLE_HIGH   = 135;

Servo sLF;  // 左前腿
Servo sRF;  // 右前腿
Servo sLB;  // 左后腿
Servo sRB;  // 右后腿

// OLED 支持预留（需安装 U8g2 库后取消注释）
// #include <U8x8lib.h>
// U8X8_SSD1306_128X64_NONAME_HW_I2C u8x8(U8X8_PIN_NONE);

void setup() {
    Serial.begin(115200);
    sLF.attach(PIN_SLF);
    sRF.attach(PIN_SRF);
    sLB.attach(PIN_SLB);
    sRB.attach(PIN_SRB);
    // u8x8.begin();
    // u8x8.setPowerSave(0);
    home();  // 上电归位/停止
}

void loop() {
    if (Serial.available()) {
        String line = Serial.readStringUntil('\n');
        line.trim();
        if (line.length() > 0) {
#if ECHO_CMD
            Serial.print("[LH8] "); Serial.println(line);
#endif
            handleCommand(line);
        }
    }
    idleBehavior();
}

void handleCommand(String line) {
    line.toUpperCase();
    String cmd = line;
    int steps = 1;
    int sp = line.indexOf(' ');
    if (sp > 0) {
        cmd = line.substring(0, sp);
        steps = line.substring(sp + 1).toInt();
    }
    if (steps < 1) steps = 1;
    if (steps > MAX_STEPS) steps = MAX_STEPS;

    if      (cmd == "FW")   forward(steps);
    else if (cmd == "BW")   backward(steps);
    else if (cmd == "LT")   turnLeft(steps);
    else if (cmd == "RT")   turnRight(steps);
    else if (cmd == "HOME") home();
    else if (cmd == "STOP") home();
}

// 四足 4 舵机: 每条腿 1 个舵机（trot gait）
void home() {
    sLF.write(90); sRF.write(90); sLB.write(90); sRB.write(90);
}

void forward(int n) {
    for(int i=0;i<n;i++){
        sLF.write(60);  sRB.write(60);  delay(150);
        sLF.write(90);  sRB.write(90);  delay(100);
        sRF.write(120); sLB.write(120); delay(150);
        sRF.write(90);  sLB.write(90);  delay(100);
    }
}

void backward(int n) {
    for(int i=0;i<n;i++){
        sRF.write(60);  sLB.write(60);  delay(150);
        sRF.write(90);  sLB.write(90);  delay(100);
        sLF.write(120); sRB.write(120); delay(150);
        sLF.write(90);  sRB.write(90);  delay(100);
    }
}

void turnLeft(int n) {
    for(int i=0;i<n;i++){
        sLF.write(120); sRB.write(120); delay(150);
        sLF.write(90);  sRB.write(90);  delay(100);
    }
}

void turnRight(int n) {
    for(int i=0;i<n;i++){
        sRF.write(60);  sLB.write(60);  delay(150);
        sRF.write(90);  sLB.write(90);  delay(100);
    }
}

unsigned long lastIdle = 0;
void idleBehavior() {
    if (millis() - lastIdle < 500) return;
    lastIdle = millis();

    // 无超声波，空闲时保持静止（或可加随机动作）
}
