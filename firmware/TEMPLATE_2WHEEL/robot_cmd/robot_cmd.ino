/**
 * ============================================================
 *  RoboMate — 机器人代码批量生成器
 *  输出: firmware/{id}/robot_cmd.ino  +  profiles/{id}.json
 * ============================================================
 */

#include <Servo.h>

// ============================================================
//  通用串口协议 + 参数定义（所有机器人共用）
// ============================================================
#define MAX_STEPS 20
#define ECHO_CMD  0

// ============================================================
//  【A 类】2轮/3轮 差速小车模板（360°连续旋转舵机）
//  适用: 拓界(LH5)、捷巡(LH6)、行迹(LH9)、风驰(LH12)
// ============================================================
/*
   引脚映射（根据组装手册）：
   LEFT_PIN  = D2   左轮舵机
   RIGHT_PIN = D3   右轮舵机
   TRIG_PIN  = D8   超声波Trig
   ECHO_PIN  = D9   超声波Echo
   BUZZ_PIN  = D13  蜂鸣器（如有）
   LED_PIN   = D13  LED（如有）

   360°舵机速度约定（Servo.write）：
   90 = 停止,  0 = 全速正向,  180 = 全速反向
   （若实际方向相反，把 LEFT_FWD/LEFT_BAK 互换即可）
*/

// ---------- 引脚配置（按具体机型修改） ----------
const int LEFT_PIN  = 2;
const int RIGHT_PIN = 3;
const int TRIG_PIN  = 8;
const int ECHO_PIN  = 9;
const int BUZZ_PIN  = 13;   // 无蜂鸣器时忽略

// ---------- 360°舵机速度常量 ----------
const int STOP_VAL  = 90;
const int LEFT_FWD  = 0;    // 左轮前进（方向不对就改成180）
const int LEFT_BAK  = 180;  // 左轮后退
const int RIGHT_FWD = 180;  // 右轮前进（方向不对就改成0）
const int RIGHT_BAK = 0;    // 右轮后退

// ---------- 动作节拍 ----------
const int STEP_TIME = 400;   // 每"步"持续时间(ms)
const int TURN_TIME = 300;   // 每"转"持续时间(ms)

Servo servoL, servoR;

// ============================================================
//  初始化
// ============================================================
void setup() {
    Serial.begin(115200);
    servoL.attach(LEFT_PIN);
    servoR.attach(RIGHT_PIN);
    pinMode(TRIG_PIN, OUTPUT);
    pinMode(ECHO_PIN, INPUT);
    pinMode(BUZZ_PIN, OUTPUT);
    home();                     // 上电即停止
}

// ============================================================
//  主循环
// ============================================================
void loop() {
    // 1) 优先处理串口指令
    if (Serial.available()) {
        String line = Serial.readStringUntil('\n');
        line.trim();
        if (line.length() > 0) {
#if ECHO_CMD
            Serial.print("[BOT] "); Serial.println(line);
#endif
            handleCommand(line);
        }
    }

    // 2) 空闲时执行默认行为（避障 + 随机动作）
    idleBehavior();
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

    if      (cmd == "FW")   forward(steps);
    else if (cmd == "BW")   backward(steps);
    else if (cmd == "LT")   turnLeft(steps);
    else if (cmd == "RT")   turnRight(steps);
    else if (cmd == "HOME") home();
    else if (cmd == "STOP") home();
    else if (cmd == "BEEP") beep();
}

// ============================================================
//  基础动作（差速驱动）
// ============================================================
void forward(int n)  { for(int i=0;i<n;i++){ servoL.write(LEFT_FWD); servoR.write(RIGHT_FWD); delay(STEP_TIME); home(); delay(100); } }
void backward(int n) { for(int i=0;i<n;i++){ servoL.write(LEFT_BAK); servoR.write(RIGHT_BAK); delay(STEP_TIME); home(); delay(100); } }
void turnLeft(int n) { for(int i=0;i<n;i++){ servoL.write(LEFT_BAK); servoR.write(RIGHT_FWD); delay(TURN_TIME); home(); delay(100); } }
void turnRight(int n){ for(int i=0;i<n;i++){ servoL.write(LEFT_FWD); servoR.write(RIGHT_BAK); delay(TURN_TIME); home(); delay(100); } }
void home()          { servoL.write(STOP_VAL); servoR.write(STOP_VAL); }
void beep()          { tone(BUZZ_PIN, 1000, 200); }

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
//  空闲默认行为：遇障后退→左转→继续前进
// ============================================================
unsigned long lastIdle = 0;
void idleBehavior() {
    if (millis() - lastIdle < 500) return;   // 每500ms检测一次
    lastIdle = millis();

    int d = getDistance();
    if (d > 0 && d < 20) {                   // 前方20cm内有障碍
        backward(1);                          // 后退1步
        turnLeft(2);                          // 左转
        // 然后继续前进（由下次loop执行）
    }
}
