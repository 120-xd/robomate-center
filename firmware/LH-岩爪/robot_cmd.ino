/*
 * ============================================================
 *  RoboMate LH4 — 岩爪机器人
 * ============================================================
 *  协议: 115200 baud, {CMD} [N] + '\n'
 *  空闲时不向串口输出（避免干扰 STK500 烧录）
 * ============================================================
 */

#include <Servo.h>

#define MAX_STEPS 20
#define ECHO_CMD  0

const int PIN_LFU = 2;  // 左前上
const int PIN_RFU = 3;  // 右前上
const int PIN_LBU = 4;  // 左后上
const int PIN_RBU = 5;  // 右后上
const int PIN_LFD = 6;  // 左前下
const int PIN_RFD = 7;  // 右前下
const int PIN_LBD = 8;  // 左后下
const int PIN_RBD = 9;  // 右后下
const int TRIG_PIN = 10;
const int ECHO_PIN = 11;

// 180° 舵机常用角度
const int ANGLE_CENTER = 90;
const int ANGLE_LOW    = 45;
const int ANGLE_HIGH   = 135;

Servo LFU;  // 左前上
Servo RFU;  // 右前上
Servo LBU;  // 左后上
Servo RBU;  // 右后上
Servo LFD;  // 左前下
Servo RFD;  // 右前下
Servo LBD;  // 左后下
Servo RBD;  // 右后下

void setup() {
    Serial.begin(115200);
    LFU.attach(PIN_LFU);
    RFU.attach(PIN_RFU);
    LBU.attach(PIN_LBU);
    RBU.attach(PIN_RBU);
    LFD.attach(PIN_LFD);
    RFD.attach(PIN_RFD);
    LBD.attach(PIN_LBD);
    RBD.attach(PIN_RBD);
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
            Serial.print("[LH4] "); Serial.println(line);
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

// 四足 8 舵机: 每条腿分上下两节
void home() {
    LFU.write(90); RFU.write(90); LBU.write(90); RBU.write(90);
    LFD.write(90); RFD.write(90); LBD.write(90); RBD.write(90);
}

void forward(int n) {
    for(int i=0;i<n;i++){
        LFU.write(70);  LFD.write(110); delay(100);  // 抬左前
        LFU.write(110); LFD.write(90);  delay(150);  // 前移
        LFU.write(90);  LFD.write(90);  delay(100);  // 放下
        RBU.write(110); RBD.write(70);  delay(100);  // 抬右后
        RBU.write(70);  RBD.write(90);  delay(150);  // 后移→推前
        RBU.write(90);  RBD.write(90);  delay(100);  // 放下
        RFU.write(110); RFD.write(70);  delay(100);  // 抬右前
        RFU.write(70);  RFD.write(90);  delay(150);  // 前移
        RFU.write(90);  RFD.write(90);  delay(100);  // 放下
        LBU.write(70);  LBD.write(110); delay(100);  // 抬左后
        LBU.write(110); LBD.write(90);  delay(150);  // 后移→推前
        LBU.write(90);  LBD.write(90);  delay(100);  // 放下
    }
}

void backward(int n) {
    for(int i=0;i<n;i++){
        LFU.write(70);  LFD.write(110); delay(100);
        LFU.write(70);  LFD.write(90);  delay(150);
        LFU.write(90);  LFD.write(90);  delay(100);
        RBU.write(110); RBD.write(70);  delay(100);
        RBU.write(110); RBD.write(90);  delay(150);
        RBU.write(90);  RBD.write(90);  delay(100);
        RFU.write(110); RFD.write(70);  delay(100);
        RFU.write(110); RFD.write(90);  delay(150);
        RFU.write(90);  RFD.write(90);  delay(100);
        LBU.write(70);  LBD.write(110); delay(100);
        LBU.write(70);  LBD.write(90);  delay(150);
        LBU.write(90);  LBD.write(90);  delay(100);
    }
}

void turnLeft(int n) {
    for(int i=0;i<n;i++){
        LFU.write(70);  LFD.write(110); delay(100);
        LFU.write(70);  LFD.write(90);  delay(150);
        LFU.write(90);  LFD.write(90);  delay(100);
        LBU.write(70);  LBD.write(110); delay(100);
        LBU.write(70);  LBD.write(90);  delay(150);
        LBU.write(90);  LBD.write(90);  delay(100);
    }
}

void turnRight(int n) {
    for(int i=0;i<n;i++){
        RFU.write(110); RFD.write(70);  delay(100);
        RFU.write(110); RFD.write(90);  delay(150);
        RFU.write(90);  RFD.write(90);  delay(100);
        RBU.write(110); RBD.write(70);  delay(100);
        RBU.write(110); RBD.write(90);  delay(150);
        RBU.write(90);  RBD.write(90);  delay(100);
    }
}

int getDistance() {
    digitalWrite(TRIG_PIN, LOW);  delayMicroseconds(2);
    digitalWrite(TRIG_PIN, HIGH); delayMicroseconds(10);
    digitalWrite(TRIG_PIN, LOW);
    long dur = pulseIn(ECHO_PIN, HIGH, 30000);
    if (dur == 0) return 999;
    return (int)(dur * 0.034 / 2);
}

unsigned long lastIdle = 0;
void idleBehavior() {
    if (millis() - lastIdle < 500) return;
    lastIdle = millis();

    int d = getDistance();
    if (d > 0 && d < 20) {
        // 遇到障碍: 后退+左转+蜂鸣
        if (d < 10) { backward(1); turnLeft(2); }
    }
}
