/*
 * ============================================================
 *  RoboMate LH-星行 — 四舵机人形机器人（基于 Otto9 库）
 *  默认行为：自动前进巡航，遇障 → 摆臂太空步 → 左转避障
 * ============================================================
 *
 * 【平台契约】
 *   - 主控: ATmega328P (Arduino Nano/Uno, 16MHz, 5V)
 *   - Bootloader: STK500v1 (Optiboot)
 *   - 运行串口: 115200 baud, 8N1
 *   - 指令协议: {大写指令} [参数] + 换行符 '\n'
 *   - 空闲时【不得】向串口持续输出数据
 *
 * 【指令集】
 *   FW    1~20  前进 N 步
 *   BW    1~20  后退 N 步
 *   LT    1~20  左转 N 步
 *   RT    1~20  右转 N 步
 *   MW    -     太空步
 *   FLAP  1~20  摆动手臂 N 下
 *   SWING 1~20  扭屁股 / 左右摇摆 N 下
 *   WAVE  -     打招呼（挥动一只"手"）
 *   HOME  -     归中/停止
 *   STOP  -     停止
 *
 * 【默认行为（无指令时）】
 *   持续前进；每步前超声波测距，若前方 < 20cm：
 *     摆动手臂 → 太空步 → 左转 → 恢复前进
 * ============================================================
 */

#include <Otto9.h>
#include <Servo.h>

Otto9 otto1;

#define MAX_STEPS 20
#define ECHO_CMD  0

// 超声波引脚（Otto9 init 里已配置，这里单独声明用于手动测距）
const int TRIG_PIN = 8;
const int ECHO_PIN = 9;

// 手舵机：Otto9 库本身只有 4 个舵机（腿+脚），没有"手"。
// 手额外接到 6、7 口，用 Servo.h 单独驱动。
const int LEFT_HAND_PIN  = 6;
const int RIGHT_HAND_PIN = 7;
Servo leftHand;
Servo rightHand;

// ============================================================
//  初始化
// ============================================================
void setup() {
    Serial.begin(115200);
    // 组装手册：D2 左腿，D3 右腿，D4 左脚，D5 右脚
    otto1.init(2, 3, 4, 5, true, A6, 13, 8, 9);
    otto1.home();

    // 手舵机：接入并归中（90°）
    leftHand.attach(LEFT_HAND_PIN);
    rightHand.attach(RIGHT_HAND_PIN);
    leftHand.write(90);
    rightHand.write(90);
}

// ============================================================
//  主循环：串口指令优先，空闲时自动前进 + 避障
// ============================================================
void loop() {
    // 1) 串口指令优先处理
    if (Serial.available()) {
        String line = Serial.readStringUntil('\n');
        line.trim();
        if (line.length() > 0) {
#if ECHO_CMD
            Serial.print("[星行] "); Serial.println(line);
#endif
            handleCommand(line);
        }
    }
    // 2) 空闲时默认前进 + 避障
    else {
        cruiseForward();
    }
}

// ============================================================
//  指令解析与分发
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

    if      (cmd == "FW")    otto1.walk(steps, 1000, FORWARD);
    else if (cmd == "BW")    otto1.walk(steps, 1000, BACKWARD);
    else if (cmd == "LT")    otto1.turn(steps, 2000, LEFT);
    else if (cmd == "RT")    otto1.turn(steps, 2000, RIGHT);
    else if (cmd == "MW")    otto1.moonwalker(1, 1000, 25, RIGHT);
    else if (cmd == "FLAP")  otto1.flapping(steps, 1000, 20, 1);
    else if (cmd == "SWING") otto1.swing(steps, 1000, 20);
    else if (cmd == "WAVE")  waveGesture();
    else if (cmd == "HOME")  otto1.home();
    else if (cmd == "STOP")  otto1.home();
}

// ============================================================
//  打招呼：挥右手（真正的手舵机，引脚 7）
//  若挥手方向反了（手往下摆），把下面 60 和 150 对调即可
// ============================================================
void waveGesture() {
    leftHand.write(90);              // 左手保持归中
    rightHand.write(150);            // 右手举起到头顶一侧
    delay(300);

    for (int i = 0; i < 4; i++) {    // 左右挥动 4 下
        rightHand.write((i % 2 == 0) ? 60 : 150);
        delay(180);
    }

    rightHand.write(90);             // 右手归中
    delay(200);
}

// ============================================================
//  超声波测距（直接操作引脚，不依赖 Otto9 内部）
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
//  默认前进 + 避障
//   每步前测距：< 20cm → 摆臂 → 太空步 → 左转；否则前进一步
// ============================================================
void cruiseForward() {
    int d = getDistance();

    if (d > 0 && d < 20) {
        // 遇障：挥手（真正的手舵机）→ 太空步 → 左转
        waveGesture();
        otto1.moonwalker(2, 800, 25, 1);
        otto1.turn(2, 2000, LEFT);
    } else {
        // 无障碍：前进一步
        otto1.walk(1, 600, FORWARD);
    }
}
