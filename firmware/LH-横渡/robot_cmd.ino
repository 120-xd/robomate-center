/*
 * RoboMate LH-横渡
 * Four mecanum 360-degree servos: D2..D5
 * Ultrasonic sensor: Trig D8, Echo D9
 * Protocol: 115200 baud, one command per line
 */
#include <Servo.h>

#define MAX_STEPS 20
#define STOP 90
#define STEP_MS 400
#define TURN_MS 300
#define AUTO_TURN_MS 220

const byte FL_PIN=2,FR_PIN=3,RL_PIN=4,RR_PIN=5,TRIG_PIN=8,ECHO_PIN=9;
// Calibrate only these values if one wheel runs in the opposite direction.
const byte FL_FWD=180,FL_REV=0,FR_FWD=0,FR_REV=180;
const byte RL_FWD=180,RL_REV=0,RR_FWD=0,RR_REV=180;
Servo fl,fr,rl,rr;
bool autoMode=true; byte avoidPhase=0; bool avoidRight=true; unsigned long phaseAt=0,lastScan=0;

void stopAll(){fl.write(STOP);fr.write(STOP);rl.write(STOP);rr.write(STOP);}
void setWheels(byte a,byte b,byte c,byte d){fl.write(a);fr.write(b);rl.write(c);rr.write(d);}
int distanceCm(){digitalWrite(TRIG_PIN,LOW);delayMicroseconds(2);digitalWrite(TRIG_PIN,HIGH);delayMicroseconds(10);digitalWrite(TRIG_PIN,LOW);unsigned long us=pulseIn(ECHO_PIN,HIGH,30000UL);return us?(int)(us*0.0343f/2.0f):999;}
void moveFor(byte a,byte b,byte c,byte d,unsigned long ms){
  autoMode=false;setWheels(a,b,c,d);unsigned long started=millis();
  while(millis()-started<ms){if(Serial.available()){String s=Serial.readStringUntil('\n');s.trim();s.toUpperCase();if(s=="STOP"||s=="HOME"){stopAll();return;}}delay(5);}stopAll();
}
void runAuto(){
  unsigned long now=millis();
  if(avoidPhase==0){
    setWheels(FL_FWD,FR_FWD,RL_FWD,RR_FWD);
    if(now-lastScan>=200){lastScan=now;if(distanceCm()<20){stopAll();avoidPhase=1;phaseAt=now;avoidRight=!avoidRight;}}
  }else if(avoidPhase==1){
    // Give the chassis time to stop before changing direction.
    stopAll();
    if(now-phaseAt>=500){avoidPhase=2;phaseAt=now;}
  }else if(avoidPhase==2){
    // Move sideways far enough to clear a wall or a corner.
    if(avoidRight)setWheels(FL_FWD,FR_REV,RL_REV,RR_FWD);
    else setWheels(FL_REV,FR_FWD,RL_FWD,RR_REV);
    if(now-phaseAt>=900){avoidPhase=3;phaseAt=now;}
  }else if(avoidPhase==3){
    stopAll();
    if(now-phaseAt>=300){avoidPhase=4;phaseAt=now;}
  }else{
    // Turn a visible amount so the next forward segment is not parallel to the wall.
    setWheels(FL_FWD,FR_REV,RL_FWD,RR_REV);
    if(now-phaseAt>=AUTO_TURN_MS){avoidPhase=0;lastScan=now;stopAll();}
  }
}
void runCommand(String line){
  line.trim();line.toUpperCase();if(!line.length())return;String op=line;int n=1,sp=line.indexOf(' ');
  if(sp>0){op=line.substring(0,sp);n=line.substring(sp+1).toInt();}n=constrain(n,1,MAX_STEPS);
  if(op=="START"){autoMode=true;avoidPhase=0;lastScan=0;}
  else if(op=="FW")moveFor(FL_FWD,FR_FWD,RL_FWD,RR_FWD,(unsigned long)n*STEP_MS);
  else if(op=="BW")moveFor(FL_REV,FR_REV,RL_REV,RR_REV,(unsigned long)n*STEP_MS);
  else if(op=="SL")moveFor(FL_REV,FR_FWD,RL_FWD,RR_REV,(unsigned long)n*STEP_MS);
  else if(op=="SR")moveFor(FL_FWD,FR_REV,RL_REV,RR_FWD,(unsigned long)n*STEP_MS);
  else if(op=="LT")moveFor(FL_REV,FR_FWD,RL_REV,RR_FWD,(unsigned long)n*TURN_MS);
  else if(op=="RT")moveFor(FL_FWD,FR_REV,RL_FWD,RR_REV,(unsigned long)n*TURN_MS);
  else if(op=="ROT")moveFor(FL_REV,FR_FWD,RL_REV,RR_FWD,(unsigned long)n*TURN_MS);
  else if(op=="HOME"||op=="STOP"){autoMode=false;avoidPhase=0;stopAll();}
  else if(op=="DIST"){Serial.print("DIST ");Serial.println(distanceCm());}
}
void setup(){Serial.begin(115200);fl.attach(FL_PIN);fr.attach(FR_PIN);rl.attach(RL_PIN);rr.attach(RR_PIN);pinMode(TRIG_PIN,OUTPUT);pinMode(ECHO_PIN,INPUT);stopAll();}
void loop(){if(Serial.available())runCommand(Serial.readStringUntil('\n'));if(autoMode)runAuto();}
