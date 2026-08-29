/*
 * RoboMate LH-赤原
 * Six-wheel rocker vehicle: six 360-degree servos on D2..D7
 * Ultrasonic sensor: Trig D8, Echo D9
 */
#include <Servo.h>
#define MAX_STEPS 20
#define STOP 90
#define STEP_MS 400
#define TURN_MS 1000
#define AUTO_TURN_MS 1000
#define AUTO_STOP_MS 1000
#define AUTO_CLEAR_MS 500
#define FIRMWARE_VERSION "LH11-AUTO-R8"
#define FRONT_LIMIT_CM 30
const byte LF_PIN = 2;
const byte RF_PIN = 3;
const byte LM_PIN = 4;
const byte RM_PIN = 5;
const byte LR_PIN = 6;
const byte RR_PIN = 7;
const byte TRIG_PIN = 8;
const byte ECHO_PIN = 9;

const byte LF_FWD = 180;
const byte LF_REV = 0;
const byte RF_FWD = 0;
const byte RF_REV = 180;
const byte LM_FWD = 180;
const byte LM_REV = 0;
const byte RM_FWD = 0;
const byte RM_REV = 180;
const byte LR_FWD = 180;
const byte LR_REV = 0;
const byte RR_FWD = 0;
const byte RR_REV = 180;

Servo lf;
Servo rf;
Servo lm;
Servo rm;
Servo lr;
Servo rr;

bool autoMode = true;
bool autoRight = true;
byte autoPhase = 0;
unsigned long phaseAt = 0;
unsigned long lastScan = 0;
enum AutoPhase { AUTO_DRIVE=0, AUTO_STOP=1, AUTO_TURN=2, AUTO_CLEAR=3 };
String pendingCommand = "";
void stopAll() {
  lf.write(STOP);
  rf.write(STOP);
  lm.write(STOP);
  rm.write(STOP);
  lr.write(STOP);
  rr.write(STOP);
}

void setDrive(byte lfValue, byte rfValue,
              byte lmValue, byte rmValue,
              byte lrValue, byte rrValue) {
  lf.write(lfValue);
  rf.write(rfValue);
  lm.write(lmValue);
  rm.write(rmValue);
  lr.write(lrValue);
  rr.write(rrValue);
}

int distanceCm() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  unsigned long echoUs = pulseIn(ECHO_PIN, HIGH, 30000UL);
  return echoUs ? (int)(echoUs * 0.0343f / 2.0f) : 999;
}

void moveFor(byte lfValue, byte rfValue,
             byte lmValue, byte rmValue,
             byte lrValue, byte rrValue,
             unsigned long durationMs) {
  autoMode = false;
  setDrive(lfValue, rfValue, lmValue, rmValue, lrValue, rrValue);

  unsigned long start = millis();
  while (millis() - start < durationMs) {
    if (Serial.available()) {
      String incoming = Serial.readStringUntil('\n');
      incoming.trim();
      incoming.toUpperCase();

      if (incoming == "STOP" || incoming == "HOME") {
        stopAll();
        return;
      }
      if (incoming.length()) pendingCommand = incoming;
    }
    delay(5);
  }

  stopAll();
}

void forward(int steps) {
  moveFor(LF_FWD, RF_FWD, LM_FWD, RM_FWD, LR_FWD, RR_FWD,
          (unsigned long)steps * STEP_MS);
}

void backward(int steps) {
  moveFor(LF_REV, RF_REV, LM_REV, RM_REV, LR_REV, RR_REV,
          (unsigned long)steps * STEP_MS);
}
// The left and right servo bodies are mounted as mirror images.
// Therefore the same PWM value on both sides produces opposite
// physical wheel directions and turns the rover in place.
void turnLeft(int steps) {
  // Left side stopped, right side forward.
  moveFor(STOP, RF_FWD, STOP, RM_FWD, STOP, RR_FWD,
          (unsigned long)steps * TURN_MS);
}

void turnRight(int steps) {
  // Left side forward, right side stopped.
  moveFor(LF_FWD, STOP, LM_FWD, STOP, LR_FWD, STOP,
          (unsigned long)steps * TURN_MS);
}
void autoAvoidTurn() {
  // 这是一次完整、不可被下一次测距覆盖的避障动作
  stopAll();
  delay(AUTO_STOP_MS);

  // 左转：左侧 D2/D4/D6 反转，右侧 D3/D5/D7 正转
  // 右转：左侧正转，右侧 D3/D5/D7 反转
  if (autoRight) {
    setDrive(LF_FWD, STOP, LM_FWD, STOP, LR_FWD, STOP);
  } else {
    setDrive(STOP, RF_FWD, STOP, RM_FWD, STOP, RR_FWD);
  }
  delay(AUTO_TURN_MS);

  stopAll();
  delay(AUTO_CLEAR_MS);
}
void runAuto() {
  if (autoPhase != AUTO_DRIVE) return;

  setDrive(LF_FWD, RF_FWD, LM_FWD, RM_FWD, LR_FWD, RR_FWD);

  unsigned long now = millis();
  if (now - lastScan >= 150) {
    lastScan=now;
    if (distanceCm() <= FRONT_LIMIT_CM) {
      autoRight = !autoRight;
      autoPhase = AUTO_TURN;
      autoAvoidTurn();
      autoPhase = AUTO_DRIVE;
      lastScan = millis();
    }
  }
}
void runCommand(String line) {
  line.trim();
  line.toUpperCase();
  if (!line.length()) return;

  String op = line;
  int steps = 1;
  int space = line.indexOf(' ');
  if (space > 0) {
    op = line.substring(0, space);
    steps = line.substring(space + 1).toInt();
  }
  steps = constrain(steps, 1, MAX_STEPS);

  if (op == "START") {
    autoMode = true;
    autoPhase = AUTO_DRIVE;
    lastScan = 0;
  } else if (op == "STOP" || op == "HOME") {
    autoMode = false;
    autoPhase = AUTO_DRIVE;
    stopAll();
  } else if (op == "FW") {
    forward(steps);
  } else if (op == "BW") {
    backward(steps);
  } else if (op == "LT") {
    turnLeft(steps);
  } else if (op == "RT") {
    turnRight(steps);
  } else if (op == "DIST") {
    Serial.print("DIST ");
    Serial.println(distanceCm());
  }
}

void setup() {
  Serial.begin(115200);

  lf.attach(LF_PIN);
  rf.attach(RF_PIN);
  lm.attach(LM_PIN);
  rm.attach(RM_PIN);
  lr.attach(LR_PIN);
  rr.attach(RR_PIN);

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  stopAll();
}

void printStatus() {
  Serial.print("VERSION ");
  Serial.print(FIRMWARE_VERSION);
  Serial.print(" AUTO ");
  Serial.print(autoMode ? 1 : 0);
  Serial.print(" PHASE ");
  Serial.println(autoPhase);
}

void testTurn(bool right) {
  autoMode = false;
  autoPhase = AUTO_DRIVE;
  stopAll();
  delay(500);

  if (right) {
    setDrive(LF_FWD, STOP, LM_FWD, STOP, LR_FWD, STOP);
  } else {
    setDrive(STOP, RF_FWD, STOP, RM_FWD, STOP, RR_FWD);
  }
  delay(5000);
  stopAll();
}

void loop() {
  if (pendingCommand.length()) {
    String command = pendingCommand;
    pendingCommand = "";
    runCommand(command);
  }

  if (Serial.available()) {
    String line = Serial.readStringUntil('\n');
    line.trim();
    line.toUpperCase();

    if (line == "STATUS") {
      printStatus();
    } else if (line == "TEST_LEFT") {
      testTurn(false);
    } else if (line == "TEST_RIGHT") {
      testTurn(true);
    } else {
      runCommand(line);
    }
  }

  if (autoMode) runAuto();
}
