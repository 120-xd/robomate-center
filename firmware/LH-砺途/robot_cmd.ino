/*
 * RoboMate LH-砺途
 * Four 360-degree wheel servos D2..D5
 * Ultrasonic sensors: front D8/D9, left D6/D7, right D10/D11
 * No LED or buzzer is used on this model.
 */
#include <Servo.h>

// ---------- Limits and timing ----------
#define MAX_STEPS       20
#define STOP_VALUE      90
#define STEP_MS         400
#define TURN_MS         450
#define TURN_AROUND_MS  900
#define FRONT_SAFE_CM   30
#define SIDE_SAFE_CM    30
#define SIDE_MIN_CM     25
#define BACKUP_MS       500
#define STOP_DELAY_MS   200
#define CLEAR_DELAY_MS  300
#define NUDGE_MS        200
#define SCAN_INTERVAL_MS 150

// ---------- Hardware pins from the assembly manual ----------
const byte LF_PIN = 2;
const byte RF_PIN = 3;
const byte LR_PIN = 4;
const byte RR_PIN = 5;

const byte LEFT_TRIG_PIN  = 6;
const byte LEFT_ECHO_PIN  = 7;
const byte FRONT_TRIG_PIN = 8;
const byte FRONT_ECHO_PIN = 9;
const byte RIGHT_TRIG_PIN = 10;
const byte RIGHT_ECHO_PIN = 11;

// The left and right wheel servos are mirror mounted.
const byte LF_FWD = 180;
const byte LF_REV = 0;
const byte RF_FWD = 0;
const byte RF_REV = 180;
const byte LR_FWD = 180;
const byte LR_REV = 0;
const byte RR_FWD = 0;
const byte RR_REV = 180;

Servo leftFront;
Servo rightFront;
Servo leftRear;
Servo rightRear;

bool autoMode = true;
bool turnRightChoice = true;
bool nudgeRightChoice = true;
unsigned long phaseAt = 0;
unsigned long lastScan = 0;
unsigned long turnDuration = TURN_MS;
String pendingCommand = "";

enum AutoPhase {
  AUTO_CRUISE,
  AUTO_STOP,
  AUTO_BACKUP,
  AUTO_BACKUP_STOP,
  AUTO_TURN,
  AUTO_CLEAR,
  AUTO_NUDGE
};

AutoPhase phase = AUTO_CRUISE;

// ---------- Basic wheel and sensor functions ----------
void stopAll() {
  leftFront.write(STOP_VALUE);
  rightFront.write(STOP_VALUE);
  leftRear.write(STOP_VALUE);
  rightRear.write(STOP_VALUE);
}

void drive(byte leftFrontValue, byte rightFrontValue,
           byte leftRearValue, byte rightRearValue) {
  leftFront.write(leftFrontValue);
  rightFront.write(rightFrontValue);
  leftRear.write(leftRearValue);
  rightRear.write(rightRearValue);
}

int readDistance(byte trigPin, byte echoPin) {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);

  unsigned long echoUs = pulseIn(echoPin, HIGH, 30000UL);
  if (!echoUs) return 999;
  return (int)(echoUs * 0.0343f / 2.0f);
}

void moveFor(byte leftFrontValue, byte rightFrontValue,
             byte leftRearValue, byte rightRearValue,
             unsigned long durationMs) {
  autoMode = false;
  drive(leftFrontValue, rightFrontValue, leftRearValue, rightRearValue);

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
  moveFor(LF_FWD, RF_FWD, LR_FWD, RR_FWD,
          (unsigned long)steps * STEP_MS);
}

void backward(int steps) {
  moveFor(LF_REV, RF_REV, LR_REV, RR_REV,
          (unsigned long)steps * STEP_MS);
}

void turnLeft(int steps) {
  // Left side reverse, right side forward.
  moveFor(LF_REV, RF_FWD, LR_REV, RR_FWD,
          (unsigned long)steps * TURN_MS);
}

void turnRight(int steps) {
  // Left side forward, right side reverse.
  moveFor(LF_FWD, RF_REV, LR_FWD, RR_REV,
          (unsigned long)steps * TURN_MS);
}

void startAutoTurn(bool right, unsigned long durationMs) {
  turnRightChoice = right;
  turnDuration = durationMs;

  if (right) {
    drive(LF_FWD, RF_REV, LR_FWD, RR_REV);
  } else {
    drive(LF_REV, RF_FWD, LR_REV, RR_FWD);
  }
}

void startNudge(bool right) {
  nudgeRightChoice = right;

  if (right) {
    // Left side forward, right side stopped: move away from a left wall.
    drive(LF_FWD, STOP_VALUE, LR_FWD, STOP_VALUE);
  } else {
    // Left side stopped, right side forward: move away from a right wall.
    drive(STOP_VALUE, RF_FWD, STOP_VALUE, RR_FWD);
  }
}

// ---------- Three-ultrasonic obstacle avoidance ----------
void runAuto() {
  unsigned long now = millis();

  switch (phase) {
    case AUTO_CRUISE: {
      if (now - lastScan < SCAN_INTERVAL_MS) return;
      lastScan = now;

      int front = readDistance(FRONT_TRIG_PIN, FRONT_ECHO_PIN);
      delay(15);
      int left = readDistance(LEFT_TRIG_PIN, LEFT_ECHO_PIN);
      delay(15);
      int right = readDistance(RIGHT_TRIG_PIN, RIGHT_ECHO_PIN);

      if (front <= FRONT_SAFE_CM) {
        stopAll();
        phase = AUTO_STOP;
        phaseAt = millis();
      } else if (left < SIDE_MIN_CM && right > SIDE_SAFE_CM) {
        startNudge(true);
        phase = AUTO_NUDGE;
        phaseAt = millis();
      } else if (right < SIDE_MIN_CM && left > SIDE_SAFE_CM) {
        startNudge(false);
        phase = AUTO_NUDGE;
        phaseAt = millis();
      } else {
        drive(LF_FWD, RF_FWD, LR_FWD, RR_FWD);
      }
      break;
    }

    case AUTO_STOP:
      stopAll();
      if (now - phaseAt >= STOP_DELAY_MS) {
        drive(LF_REV, RF_REV, LR_REV, RR_REV);
        phase = AUTO_BACKUP;
        phaseAt = now;
      }
      break;

    case AUTO_BACKUP:
      drive(LF_REV, RF_REV, LR_REV, RR_REV);
      if (now - phaseAt >= BACKUP_MS) {
        stopAll();
        phase = AUTO_BACKUP_STOP;
        phaseAt = now;
      }
      break;

    case AUTO_BACKUP_STOP:
      stopAll();
      if (now - phaseAt >= STOP_DELAY_MS) {
        int left = readDistance(LEFT_TRIG_PIN, LEFT_ECHO_PIN);
        delay(15);
        int right = readDistance(RIGHT_TRIG_PIN, RIGHT_ECHO_PIN);

        if (left > right && left > SIDE_SAFE_CM) {
          turnRightChoice = false;
          turnDuration = TURN_MS;
        } else if (right > left && right > SIDE_SAFE_CM) {
          turnRightChoice = true;
          turnDuration = TURN_MS;
        } else if (left > SIDE_SAFE_CM) {
          turnRightChoice = false;
          turnDuration = TURN_MS;
        } else if (right > SIDE_SAFE_CM) {
          turnRightChoice = true;
          turnDuration = TURN_MS;
        } else {
          // Both sides are blocked: turn around.
          turnRightChoice = true;
          turnDuration = TURN_AROUND_MS;
        }

        startAutoTurn(turnRightChoice, turnDuration);
        phase = AUTO_TURN;
        phaseAt = millis();
      }
      break;

    case AUTO_TURN:
      // No ultrasonic measurement is performed during this phase.
      if (now - phaseAt >= turnDuration) {
        stopAll();
        phase = AUTO_CLEAR;
        phaseAt = now;
      }
      break;

    case AUTO_CLEAR:
      stopAll();
      if (now - phaseAt >= CLEAR_DELAY_MS) {
        phase = AUTO_CRUISE;
        lastScan = millis();
      }
      break;

    case AUTO_NUDGE:
      if (now - phaseAt >= NUDGE_MS) {
        stopAll();
        phase = AUTO_CRUISE;
        lastScan = millis();
      }
      break;
  }
}

// ---------- Serial command handling ----------
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
    phase = AUTO_CRUISE;
    lastScan = 0;
  } else if (op == "STOP" || op == "HOME") {
    autoMode = false;
    phase = AUTO_CRUISE;
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
    Serial.print("FRONT ");
    Serial.print(readDistance(FRONT_TRIG_PIN, FRONT_ECHO_PIN));
    delay(15);
    Serial.print(" LEFT ");
    Serial.print(readDistance(LEFT_TRIG_PIN, LEFT_ECHO_PIN));
    delay(15);
    Serial.print(" RIGHT ");
    Serial.println(readDistance(RIGHT_TRIG_PIN, RIGHT_ECHO_PIN));
  }
}

// ---------- Arduino lifecycle ----------
void setup() {
  Serial.begin(115200);

  leftFront.attach(LF_PIN);
  rightFront.attach(RF_PIN);
  leftRear.attach(LR_PIN);
  rightRear.attach(RR_PIN);

  pinMode(LEFT_TRIG_PIN, OUTPUT);
  pinMode(LEFT_ECHO_PIN, INPUT);
  pinMode(RIGHT_TRIG_PIN, OUTPUT);
  pinMode(RIGHT_ECHO_PIN, INPUT);
  pinMode(FRONT_TRIG_PIN, OUTPUT);
  pinMode(FRONT_ECHO_PIN, INPUT);

  stopAll();
}

void loop() {
  if (pendingCommand.length()) {
    String command = pendingCommand;
    pendingCommand = "";
    runCommand(command);
  }

  if (Serial.available()) {
    runCommand(Serial.readStringUntil('\n'));
  }

  if (autoMode) runAuto();
}
