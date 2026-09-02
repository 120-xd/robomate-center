/*
 * ============================================================
 *  RoboMate LH3 — 万向机器人（全向轮三轮）
 * ============================================================
 *  默认行为: 自动巡航前进，遇障左转约90°并重复检测
 *  协议: 115200 baud, {CMD} [N] + '\n'
 *  调试: 打开串口监视器(115200)可看到状态变化
 * ============================================================
 */

#include <Servo.h>

#define MAX_STEPS 20
#define ECHO_CMD  0

// ---------- 引脚 ----------
const int PIN_SL = 2;  // 左前轮
const int PIN_SR = 3;  // 右前轮
const int PIN_SB = 4;  // 后轮
const int TRIG_PIN = 8;
const int ECHO_PIN = 9;

Servo sL, sR, sB;

// ---------- 自动巡航状态机 ----------
// 状态: 0=巡航 1=转弯前停止 2=左转90度 3=转弯后停止并复测
int avoidPhase = 0;
unsigned long phaseStart = 0;
unsigned long lastScan = 0;
const unsigned long SCAN_INTERVAL = 300;
const int OBSTACLE_CM = 20;
const unsigned long OBSTACLE_STOP_MS = 200;
// 旧逻辑实测 1500ms 约等于 405°，90°约为333ms，这里取330ms。
const unsigned long TURN_90_MS = 330;
const unsigned long TURN_SETTLE_MS = 200;

void setup() {
    Serial.begin(115200);
    sL.attach(PIN_SL);
    sR.attach(PIN_SR);
    sB.attach(PIN_SB);
    pinMode(TRIG_PIN, OUTPUT);
    pinMode(ECHO_PIN, INPUT);
    stopAll();
    avoidPhase = 0;
    Serial.println("[万向] 启动，默认巡航前进");
}

void loop() {
    if (Serial.available()) {
        String line = Serial.readStringUntil('\n');
        line.trim();
        if (line.length() > 0) {
#if ECHO_CMD
            Serial.print("[LH3] "); Serial.println(line);
#endif
            handleCommand(line);
        }
    }
    runAutoCruise();
}

// ============================================================
// 命令解析
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

    stopAll();
    avoidPhase = 99;  // 暂停自动巡航

    if      (cmd == "FW")   forwardSteps(steps);
    else if (cmd == "BW")   backwardSteps(steps);
    else if (cmd == "LT")   turnLeftSteps(steps);
    else if (cmd == "RT")   turnRightSteps(steps);
    else if (cmd == "ROT")  rotateSteps(steps);
    else if (cmd == "HOME") { Serial.println("[状态] 停止"); }
    else if (cmd == "STOP") { Serial.println("[状态] 停止"); }
    else if (cmd == "TEST1") { sL.write(0); delay(1000); sL.write(90); }
    else if (cmd == "TEST2") { sR.write(0); delay(1000); sR.write(90); }
    else if (cmd == "TEST3") { sB.write(0); delay(1000); sB.write(90); }
    else if (cmd == "START") { avoidPhase = 0; lastScan = millis(); Serial.println("[状态] 恢复巡航"); }
    else { Serial.println("[状态] 未知命令，暂停巡航"); }
}

// ============================================================
// 自动巡航（带明显停顿的避障序列）
// ============================================================
void runAutoCruise() {
    unsigned long now = millis();

    if (avoidPhase == 0) {
        // ---------- 巡航前进 ----------
        if (now - lastScan >= SCAN_INTERVAL) {
            lastScan = now;
            int d = getDistance();
            if (d > 0 && d < OBSTACLE_CM) {
                Serial.print("[避障] 检测到障碍，距离="); Serial.print(d); Serial.println("cm");
                avoidPhase = 1;
                phaseStart = now;
            }
        }
        moveForward();
    }
    else if (avoidPhase == 3) {
        // 转弯后先停稳，再测量前方；仍有障碍就继续左转90度。
        stopAll();
        if (now - phaseStart >= TURN_SETTLE_MS) {
            int checkDistance = getDistance();
            if (checkDistance > 0 && checkDistance < OBSTACLE_CM) {
                Serial.println("[avoid] still blocked, turn left 90 again");
                avoidPhase = 2;
                phaseStart = now;
            } else {
                Serial.println("[avoid] path clear, resume forward");
                avoidPhase = 0;
                lastScan = now;
            }
        }
    }
    else if (avoidPhase >= 1 && avoidPhase <= 2) {
        // ---------- 避障序列 ----------
        unsigned long t = now - phaseStart;

        switch (avoidPhase) {
            case 1:  // 阶段1: 急停 200ms
                stopAll();
                if (t >= OBSTACLE_STOP_MS) {
                    Serial.println("[避障] 开始后退");
                    avoidPhase = 2;
                    phaseStart = now;
                }
                break;

            case 2:  // 阶段2: 后退 1000ms
                moveTurnLeft();
                if (t >= TURN_90_MS) {
                    Serial.println("[避障] 后退完成，准备左转");
                    avoidPhase = 3;
                    phaseStart = now;
                }
                break;

            case 3:  // 阶段3: 停 200ms
                stopAll();
                if (t >= 200) {
                    Serial.println("[避障] 开始左转");
                    avoidPhase = 4;
                    phaseStart = now;
                }
                break;

            case 4:  // 阶段4: 原地左转 1500ms
                moveTurnLeft();
                if (t >= 1500) {
                    Serial.println("[避障] 左转完成，恢复巡航");
                    avoidPhase = 5;
                    phaseStart = now;
                }
                break;

            case 5:  // 阶段5: 停 200ms
                stopAll();
                if (t >= 200) {
                    avoidPhase = 0;
                    lastScan = now;
                    Serial.println("[状态] 恢复巡航前进");
                }
                break;
        }
    }
    else if (avoidPhase == 99) {
        // 暂停状态（收到手动命令后）
        stopAll();
    }
}

// ============================================================
// 基础运动（按实测数据）
// ============================================================

// 前进: D2反(180), D3正(0), D4停(90)
void moveForward() {
    sL.write(180);
    sR.write(0);
    sB.write(90);
}

// 后退: D2正(0), D3反(180), D4停(90)
void moveBackward() {
    sL.write(0);
    sR.write(180);
    sB.write(90);
}

// 原地左转(逆时针): D2/D3/D4都正(0)
void moveTurnLeft() {
    sL.write(0);
    sR.write(0);
    sB.write(0);
}

// 原地右转(顺时针): D2/D3/D4都反(180)
void moveTurnRight() {
    sL.write(180);
    sR.write(180);
    sB.write(180);
}

void stopAll() {
    sL.write(90);
    sR.write(90);
    sB.write(90);
}

// ============================================================
// 步进式命令
// ============================================================
void forwardSteps(int n) {
    for (int i = 0; i < n; i++) {
        moveForward(); delay(400);
        stopAll();     delay(100);
    }
}
void backwardSteps(int n) {
    for (int i = 0; i < n; i++) {
        moveBackward(); delay(400);
        stopAll();      delay(100);
    }
}
void turnLeftSteps(int n) {
    for (int i = 0; i < n; i++) {
        moveTurnLeft(); delay(300);
        stopAll();      delay(100);
    }
}
void turnRightSteps(int n) {
    for (int i = 0; i < n; i++) {
        moveTurnRight(); delay(300);
        stopAll();       delay(100);
    }
}
void rotateSteps(int n) {
    for (int i = 0; i < n; i++) {
        moveTurnLeft(); delay(300);
        stopAll();      delay(100);
    }
}

// ============================================================
// 传感器
// ============================================================
int getDistance() {
    digitalWrite(TRIG_PIN, LOW);  delayMicroseconds(2);
    digitalWrite(TRIG_PIN, HIGH); delayMicroseconds(10);
    digitalWrite(TRIG_PIN, LOW);
    long dur = pulseIn(ECHO_PIN, HIGH, 30000);
    if (dur == 0) return 999;
    return (int)(dur * 0.034 / 2);
}
