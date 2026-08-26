/*
 * ============================================================
 *  RoboMate LH2 — 砺途机器人（四舵机六轮/四轮避障越野车）
 * ============================================================
 *
 * 【平台契约】
 *   - 主控: ATmega328P, Bootloader: STK500v1
 *   - 运行串口: 115200 baud, 8N1
 *   - 指令协议: {大写指令} [参数] + '\n'
 *   - 空闲时【不得】向串口持续输出数据
 *
 * 【硬件】
 *   4×360°舵机: 左前轮D2 右前轮D3 左后轮D4 右后轮D5
 *   3×超声波:   前D8/D9  左D10/D11  右D6/D7
 *   LED 指示灯: D13
 *   蜂鸣器:     D12
 *
 * 【指令集】
 *   START  - 启动自主避障模式
 *   STOP   - 停止/紧急刹车
 *   FW N   - 手动前进 N 步
 *   BW N   - 手动后退 N 步
 *   LT N   - 手动左转 N 步
 *   RT N   - 手动右转 N 步
 *   HOME   - 归中/停止
 * ============================================================
 */

#include <Servo.h>

#define MAX_STEPS 20
#define ECHO_CMD  0

// ---------- 引脚 ----------
const int PIN_LF = 2;   // 左前轮
const int PIN_RF = 3;   // 右前轮
const int PIN_LB = 4;   // 左后轮
const int PIN_RB = 5;   // 右后轮

const int TRIG_F = 8;   // 前方超声波 Trig
const int ECHO_F = 9;   // 前方超声波 Echo
const int TRIG_L = 10;  // 左侧超声波 Trig
const int ECHO_L = 11;  // 左侧超声波 Echo
const int TRIG_R = 6;   // 右侧超声波 Trig
const int ECHO_R = 7;   // 右侧超声波 Echo

const int LED_PIN  = 13;
const int BUZZ_PIN = 12;

// ---------- 360° 舵机速度 ----------
const int STOP_SPD = 90;
const int FWD_SPD  = 0;
const int BAK_SPD  = 180;

Servo sLF, sRF, sLB, sRB;

// ---------- 自主模式状态机 ----------
enum Mode { MODE_MANUAL, MODE_AUTO };
Mode currentMode = MODE_MANUAL;

// ============================================================
//  初始化
// ============================================================
void setup() {
    Serial.begin(115200);

    sLF.attach(PIN_LF);
    sRF.attach(PIN_RF);
    sLB.attach(PIN_LB);
    sRB.attach(PIN_RB);

    pinMode(TRIG_F, OUTPUT); pinMode(ECHO_F, INPUT);
    pinMode(TRIG_L, OUTPUT); pinMode(ECHO_L, INPUT);
    pinMode(TRIG_R, OUTPUT); pinMode(ECHO_R, INPUT);

    pinMode(LED_PIN, OUTPUT);
    pinMode(BUZZ_PIN, OUTPUT);

    home();
}

// ============================================================
//  主循环
// ============================================================
void loop() {
    // 1) 串口指令优先
    if (Serial.available()) {
        String line = Serial.readStringUntil('\n');
        line.trim();
        if (line.length() > 0) {
#if ECHO_CMD
            Serial.print("[LH2] "); Serial.println(line);
#endif
            handleCommand(line);
        }
    }

    // 2) 自主避障模式
    if (currentMode == MODE_AUTO) {
        autoAvoid();
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

    if      (cmd == "START") { currentMode = MODE_AUTO;  digitalWrite(LED_PIN, HIGH); }
    else if (cmd == "STOP")  { currentMode = MODE_MANUAL; home(); digitalWrite(LED_PIN, LOW); }
    else if (cmd == "FW")    { currentMode = MODE_MANUAL; forward(steps); }
    else if (cmd == "BW")    { currentMode = MODE_MANUAL; backward(steps); }
    else if (cmd == "LT")    { currentMode = MODE_MANUAL; turnLeft(steps); }
    else if (cmd == "RT")    { currentMode = MODE_MANUAL; turnRight(steps); }
    else if (cmd == "HOME")  { currentMode = MODE_MANUAL; home(); }
}

// ============================================================
//  基础动作
// ============================================================
void forward(int n)  {
    for(int i=0;i<n;i++){
        sLF.write(FWD_SPD); sRF.write(FWD_SPD); sLB.write(FWD_SPD); sRB.write(FWD_SPD);
        delay(400); home(); delay(100);
    }
}
void backward(int n) {
    for(int i=0;i<n;i++){
        sLF.write(BAK_SPD); sRF.write(BAK_SPD); sLB.write(BAK_SPD); sRB.write(BAK_SPD);
        delay(400); home(); delay(100);
    }
}
void turnLeft(int n) {
    for(int i=0;i<n;i++){
        sLF.write(BAK_SPD); sRF.write(FWD_SPD); sLB.write(BAK_SPD); sRB.write(FWD_SPD);
        delay(300); home(); delay(100);
    }
}
void turnRight(int n){
    for(int i=0;i<n;i++){
        sLF.write(FWD_SPD); sRF.write(BAK_SPD); sLB.write(FWD_SPD); sRB.write(BAK_SPD);
        delay(300); home(); delay(100);
    }
}
void home() {
    sLF.write(STOP_SPD); sRF.write(STOP_SPD); sLB.write(STOP_SPD); sRB.write(STOP_SPD);
}

void beep(int freq, int dur) {
    tone(BUZZ_PIN, freq, dur);
}

// ============================================================
//  超声波测距
// ============================================================
int getDist(int trig, int echo) {
    digitalWrite(trig, LOW);  delayMicroseconds(2);
    digitalWrite(trig, HIGH); delayMicroseconds(10);
    digitalWrite(trig, LOW);
    long dur = pulseIn(echo, HIGH, 30000);
    if (dur == 0) return 999;
    return (int)(dur * 0.034 / 2);
}

// ============================================================
//  自主避障模式（非阻塞状态机）
// ============================================================
unsigned long autoTimer = 0;
int autoState = 0;   // 0=前进 1=后退 2=左转 3=右转

void autoAvoid() {
    if (millis() - autoTimer < 300) return;  // 最小动作间隔
    autoTimer = millis();

    int df = getDist(TRIG_F, ECHO_F);  // 前方
    int dl = getDist(TRIG_L, ECHO_L);  // 左侧
    int dr = getDist(TRIG_R, ECHO_R);  // 右侧

    // LED 闪烁表示自主模式运行中
    digitalWrite(LED_PIN, (millis() / 250) % 2);

    if (df < 15) {
        // 前方遇障
        beep(1500, 100);
        if (dl > dr && dl > 15) {
            // 左边更空，左转
            turnLeft(1);
        } else if (dr > dl && dr > 15) {
            // 右边更空，右转
            turnRight(1);
        } else {
            // 两边都没空间，后退
            backward(1);
            beep(1000, 200);
        }
    } else if (df < 30) {
        // 前方较远有障碍，减速前进并蜂鸣提示
        forward(1);
        beep(800, 50);
    } else {
        // 前方畅通，前进
        forward(1);
    }
}
