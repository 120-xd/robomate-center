/*
 * ============================================================
 *  RoboMate LH-行迹 — 双舵机轮式机器人
 *  默认行为：自动巡航（持续前进），遇障左转避障
 * ============================================================
 *
 * 【方向校准】
 *   如果某个轮子的实际转动方向与预期相反，把对应舵机的 FWD/BAK 值互换。
 *   例如右轮往前走时它却在后退，就把 RIGHT_FWD 和 RIGHT_BAK 互换。
 *
 * 【协议】
 *   115200 baud, {CMD} [N] + '\n'
 *   FW/BW/LT/RT/HOME/STOP/START
 * ============================================================
 */

#include <Servo.h>

#define MAX_STEPS 20
#define ECHO_CMD  0

// ---------- 引脚 ----------
const int PIN_L = 2;   // 左轮舵机
const int PIN_R = 3;   // 右轮舵机
const int TRIG_PIN = 8;   // 超声波 Trig
const int ECHO_PIN = 9;   // 超声波 Echo

// ---------- 360° 舵机速度 ----------
// 90 = 停止，0 和 180 是相反的两个方向
const int STOP_SPD = 90;

// 【差速小车】左右轮需要相反方向转动才能让小车前进
// 如果实际方向反了，把对应两行的数值互换即可
const int LEFT_FWD  = 180;  // 左轮前进（如果反了，改成 0）
const int LEFT_BAK  = 0;    // 左轮后退（如果反了，改成 180）
const int RIGHT_FWD = 0;    // 右轮前进（如果反了，改成 180）
const int RIGHT_BAK = 180;  // 右轮后退（如果反了，改成 0）

Servo sL, sR;

// ---------- 运行模式 ----------
bool autoCruise = true;   // true = 自动巡航前进
bool inAvoid    = false;  // true = 正在执行避障动作
unsigned long avoidStart = 0;
unsigned long lastScan   = 0;

void setup() {
    Serial.begin(115200);
    sL.attach(PIN_L);
    sR.attach(PIN_R);
    pinMode(TRIG_PIN, OUTPUT);
    pinMode(ECHO_PIN, INPUT);
    home();
}

void loop() {
    // 1) 串口指令优先（任何时候都能打断巡航）
    if (Serial.available()) {
        String line = Serial.readStringUntil('\n');
        line.trim();
        if (line.length() > 0) {
#if ECHO_CMD
            Serial.print("[行迹] "); Serial.println(line);
#endif
            handleCommand(line);
        }
    }
    // 2) 自动巡航
    else if (autoCruise) {
        runCruise();
    }
}

// ============================================================
//  指令解析
// ============================================================
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

    // 手动指令：先停稳，退出巡航
    autoCruise = false;
    inAvoid = false;
    home();
    delay(50);

    if      (cmd == "FW")   { drive(LEFT_FWD,  RIGHT_FWD,  steps * 400); }
    else if (cmd == "BW")   { drive(LEFT_BAK,  RIGHT_BAK,  steps * 400); }
    else if (cmd == "LT")   { drive(LEFT_BAK,  RIGHT_FWD,  steps * 300); }
    else if (cmd == "RT")   { drive(LEFT_FWD,  RIGHT_BAK,  steps * 300); }
    else if (cmd == "HOME") { home(); }
    else if (cmd == "STOP") { home(); autoCruise = false; }
    else if (cmd == "START"){ autoCruise = true; inAvoid = false; lastScan = millis(); }
}

// 通用驱动：设速度 → delay → 停
void drive(int leftSpd, int rightSpd, int durationMs) {
    sL.write(leftSpd);
    sR.write(rightSpd);
    delay(durationMs);
    home();
}

void home() {
    sL.write(STOP_SPD);
    sR.write(STOP_SPD);
}

// ============================================================
//  超声波测距
// ============================================================
int getDistance() {
    digitalWrite(TRIG_PIN, LOW);  delayMicroseconds(2);
    digitalWrite(TRIG_PIN, HIGH); delayMicroseconds(10);
    digitalWrite(TRIG_PIN, LOW);
    long dur = pulseIn(ECHO_PIN, HIGH, 30000);
    if (dur == 0) return 999;
    return (int)(dur * 0.034 / 2);
}

// ============================================================
//  自动巡航（非阻塞状态机）
//   正常时持续前进，每 200ms 扫描前方障碍
//   遇障时：停 → 后退 → 停 → 左转 → 恢复前进
// ============================================================
void runCruise() {
    unsigned long now = millis();

    if (!inAvoid) {
        // ---------- 正常前进 ----------
        sL.write(LEFT_FWD);
        sR.write(RIGHT_FWD);

        // 每 200ms 扫描一次障碍
        if (now - lastScan > 200) {
            lastScan = now;
            if (getDistance() < 20) {
                // 触发避障
                inAvoid = true;
                avoidStart = now;
                home();  // 先停
            }
        }
    }
    else {
        // ---------- 避障序列 ----------
        unsigned long t = now - avoidStart;

        if (t < 150) {
            // 阶段 0：短暂停稳
            home();
        }
        else if (t < 550) {
            // 阶段 1：后退约 400ms
            sL.write(LEFT_BAK);
            sR.write(RIGHT_BAK);
        }
        else if (t < 700) {
            // 阶段 2：停
            home();
        }
        else if (t < 1000) {
            // 阶段 3：左转约 300ms
            sL.write(LEFT_BAK);
            sR.write(RIGHT_FWD);
        }
        else {
            // 阶段 4：避障完成，恢复巡航
            inAvoid = false;
            home();
            lastScan = now;
        }
    }
}
