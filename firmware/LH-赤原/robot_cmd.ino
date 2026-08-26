/*
 * ============================================================
 *  RoboMate LH11 — 赤原机器人
 * ============================================================
 *  协议: 115200 baud, {CMD} [N] + '\n'
 *  空闲时不向串口输出（避免干扰 STK500 烧录）
 * ============================================================
 */

#include <Servo.h>

#define MAX_STEPS 20
#define ECHO_CMD  0

const int PIN_SLF = 2;  // 左前轮
const int PIN_SRF = 3;  // 右前轮
const int PIN_SLM = 4;  // 左中轮
const int PIN_SRM = 5;  // 右中轮
const int PIN_SLB = 6;  // 左后轮
const int PIN_SRB = 7;  // 右后轮
const int TRIG_PIN = 8;
const int ECHO_PIN = 9;

// 360° 舵机速度: 90=停止, 0/180=正反转（装反了互换即可）
const int STOP_SPD = 90;
const int FWD_SPD  = 0;   // 正向全速
const int BAK_SPD  = 180; // 反向全速

Servo sLF;  // 左前轮
Servo sRF;  // 右前轮
Servo sLM;  // 左中轮
Servo sRM;  // 右中轮
Servo sLB;  // 左后轮
Servo sRB;  // 右后轮

void setup() {
    Serial.begin(115200);
    sLF.attach(PIN_SLF);
    sRF.attach(PIN_SRF);
    sLM.attach(PIN_SLM);
    sRM.attach(PIN_SRM);
    sLB.attach(PIN_SLB);
    sRB.attach(PIN_SRB);
    pinMode(TRIG_PIN, OUTPUT);
    pinMode(ECHO_PIN, INPUT);
    home();  // 上电归位/停止
}

void loop() {
    if (Serial.available()) {
        String line = Serial.readStringUntil('\n');
        line.trim();
        if (line.length() > 0) {
#if ECHO_CMD
            Serial.print("[ROBO] "); Serial.println(line);
#endif
            handleCommand(line);
        }
    }
    else if (autoCruise) {
        runCruise();
    }
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

// 六轮摇臂: 同侧三轮同速
void forward(int n)  { for(int i=0;i<n;i++){ sLF.write(FWD_SPD); sRF.write(FWD_SPD); sLM.write(FWD_SPD); sRM.write(FWD_SPD); sLB.write(FWD_SPD); sRB.write(FWD_SPD); delay(400); home(); delay(100); } }
void backward(int n) { for(int i=0;i<n;i++){ sLF.write(BAK_SPD); sRF.write(BAK_SPD); sLM.write(BAK_SPD); sRM.write(BAK_SPD); sLB.write(BAK_SPD); sRB.write(BAK_SPD); delay(400); home(); delay(100); } }
void turnLeft(int n) { for(int i=0;i<n;i++){ sLF.write(BAK_SPD); sRF.write(FWD_SPD); sLM.write(BAK_SPD); sRM.write(FWD_SPD); sLB.write(BAK_SPD); sRB.write(FWD_SPD); delay(300); home(); delay(100); } }
void turnRight(int n){ for(int i=0;i<n;i++){ sLF.write(FWD_SPD); sRF.write(BAK_SPD); sLM.write(FWD_SPD); sRM.write(BAK_SPD); sLB.write(FWD_SPD); sRB.write(BAK_SPD); delay(300); home(); delay(100); } }
void home()          { sLF.write(STOP_SPD); sRF.write(STOP_SPD); sLM.write(STOP_SPD); sRM.write(STOP_SPD); sLB.write(STOP_SPD); sRB.write(STOP_SPD); }

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
//   默认持续前进，每 200ms 扫描前方障碍
//   遇障时：停 → 后退 → 左转 → 恢复前进
// ============================================================
bool autoCruise = true;   // 上电默认启动巡航
bool inAvoid    = false;  // 正在执行避障动作
unsigned long avoidStart = 0;
unsigned long lastScan   = 0;

void runCruise() {
    unsigned long now = millis();

    if (!inAvoid) {
        // ---------- 正常前进 ----------
        sLF.write(FWD_SPD); sRF.write(FWD_SPD); sLM.write(FWD_SPD); sRM.write(FWD_SPD); sLB.write(FWD_SPD); sRB.write(FWD_SPD);

        // 每 200ms 扫描一次障碍
        if (now - lastScan > 200) {
            lastScan = now;
            if (getDistance() < 20) {
                inAvoid = true;
                avoidStart = now;
                sLF.write(STOP_SPD); sRF.write(STOP_SPD); sLM.write(STOP_SPD); sRM.write(STOP_SPD); sLB.write(STOP_SPD); sRB.write(STOP_SPD);
            }
        }
    }
    else {
        // ---------- 避障序列 ----------
        unsigned long t = now - avoidStart;

        if (t < 150) {
            sLF.write(STOP_SPD); sRF.write(STOP_SPD); sLM.write(STOP_SPD); sRM.write(STOP_SPD); sLB.write(STOP_SPD); sRB.write(STOP_SPD);
        }
        else if (t < 550) {
            sLF.write(BAK_SPD); sRF.write(BAK_SPD); sLM.write(BAK_SPD); sRM.write(BAK_SPD); sLB.write(BAK_SPD); sRB.write(BAK_SPD);
        }
        else if (t < 700) {
            sLF.write(STOP_SPD); sRF.write(STOP_SPD); sLM.write(STOP_SPD); sRM.write(STOP_SPD); sLB.write(STOP_SPD); sRB.write(STOP_SPD);
        }
        else if (t < 1000) {
            sLF.write(BAK_SPD); sRF.write(FWD_SPD); sLM.write(BAK_SPD); sRM.write(FWD_SPD); sLB.write(BAK_SPD); sRB.write(FWD_SPD);
        }
        else {
            inAvoid = false;
            sLF.write(STOP_SPD); sRF.write(STOP_SPD); sLM.write(STOP_SPD); sRM.write(STOP_SPD); sLB.write(STOP_SPD); sRB.write(STOP_SPD);
            lastScan = now;
        }
    }
}
