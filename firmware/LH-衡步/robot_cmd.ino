/*
 * ============================================================
 *  RoboMate LH10 — 衡步机器人
 * ============================================================
 *  协议: 115200 baud, {CMD} [N] + '\n'
 *  空闲时不向串口输出（避免干扰 STK500 烧录）
 * ============================================================
 */

#include <Servo.h>

#define MAX_STEPS 20
#define ECHO_CMD  0

const int PIN_SYL = 2;  // 左腿
const int PIN_SYR = 3;  // 右腿
const int PIN_SRL = 4;  // 左脚
const int PIN_SRR = 5;  // 右脚
const int TRIG_PIN = 8;
const int ECHO_PIN = 9;
const int BUZZ_PIN = 13;

// 180° 舵机常用角度
const int ANGLE_CENTER = 90;
const int ANGLE_LOW    = 45;
const int ANGLE_HIGH   = 135;

Servo sYL;  // 左腿
Servo sYR;  // 右腿
Servo sRL;  // 左脚
Servo sRR;  // 右脚

void setup() {
    Serial.begin(115200);
    sYL.attach(PIN_SYL);
    sYR.attach(PIN_SYR);
    sRL.attach(PIN_SRL);
    sRR.attach(PIN_SRR);
    pinMode(TRIG_PIN, OUTPUT);
    pinMode(ECHO_PIN, INPUT);
    pinMode(BUZZ_PIN, OUTPUT);
    home();  // 上电归位/停止
}

void loop() {
    if (Serial.available()) {
        String line = Serial.readStringUntil('\n');
        line.trim();
        if (line.length() > 0) {
#if ECHO_CMD
            Serial.print("[LH10] "); Serial.println(line);
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
    else if (cmd == "MW")   moonwalk();
    else if (cmd == "HOME") home();
    else if (cmd == "STOP") home();
    else if (cmd == "BEEP") beep();
}

// 双足步态: 4 个 180° 舵机
void home() {
    sYL.write(90); sYR.write(90); sRL.write(90); sRR.write(90);
}

void forward(int n) {
    for(int i=0;i<n;i++){
        sYL.write(110); sRL.write(70);  delay(200);
        sYL.write(90);  sRL.write(90);  delay(100);
        sYR.write(70);  sRR.write(110); delay(200);
        sYR.write(90);  sRR.write(90);  delay(100);
    }
}

void backward(int n) {
    for(int i=0;i<n;i++){
        sYR.write(110); sRR.write(70);  delay(200);
        sYR.write(90);  sRR.write(90);  delay(100);
        sYL.write(70);  sRL.write(110); delay(200);
        sYL.write(90);  sRL.write(90);  delay(100);
    }
}

void turnLeft(int n) {
    for(int i=0;i<n;i++){
        sYL.write(70);  sRL.write(110); delay(200);
        sYL.write(90);  sRL.write(90);  delay(100);
    }
}

void turnRight(int n) {
    for(int i=0;i<n;i++){
        sYR.write(110); sRR.write(70);  delay(200);
        sYR.write(90);  sRR.write(90);  delay(100);
    }
}

void moonwalk() {
    for(int i=0;i<3;i++){
        sYL.write(110); sRL.write(70);  sYR.write(90);  sRR.write(90);  delay(200);
        sYL.write(90);  sRL.write(90);  sYR.write(70);  sRR.write(110); delay(200);
    }
    home();
}

int getDistance() {
    digitalWrite(TRIG_PIN, LOW);  delayMicroseconds(2);
    digitalWrite(TRIG_PIN, HIGH); delayMicroseconds(10);
    digitalWrite(TRIG_PIN, LOW);
    long dur = pulseIn(ECHO_PIN, HIGH, 30000);
    if (dur == 0) return 999;
    return (int)(dur * 0.034 / 2);
}

void beep() {
    tone(BUZZ_PIN, 1000, 200);
}

unsigned long lastIdle = 0;
void idleBehavior() {
    if (millis() - lastIdle < 500) return;
    lastIdle = millis();

    int d = getDistance();
    if (d > 0 && d < 20) {
        // 遇到障碍: 后退+左转+蜂鸣
        if (d < 10) { backward(1); turnLeft(2); }
        beep();
    }
}
