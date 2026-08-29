/*
 * RoboMate LH-赤原
 * Six-wheel rocker vehicle: six 360-degree servos on D2..D7
 * Ultrasonic sensor: Trig D8, Echo D9
 */
#include <Servo.h>
#define MAX_STEPS 20
#define STOP 90
#define STEP_MS 400
#define TURN_MS 25000
#define AUTO_TURN_MS 50000
#define AUTO_STOP_MS 500
#define AUTO_BACK_MS 700
#define AUTO_PAUSE_MS 300
#define FIRMWARE_VERSION "LH11-AUTO-R6"
#define FRONT_LIMIT_CM 20
const byte LF_PIN=2,RF_PIN=3,LM_PIN=4,RM_PIN=5,LR_PIN=6,RR_PIN=7,TRIG_PIN=8,ECHO_PIN=9;
const byte LF_FWD=180,LF_REV=0,RF_FWD=0,RF_REV=180,LM_FWD=180,LM_REV=0,RM_FWD=0,RM_REV=180,LR_FWD=180,LR_REV=0,RR_FWD=0,RR_REV=180;
Servo lf,rf,lm,rm,lr,rr;bool autoMode=true,autoRight=true;byte autoPhase=0;unsigned long phaseAt=0,lastScan=0;
String pendingCommand="";
void stopAll(){lf.write(STOP);rf.write(STOP);lm.write(STOP);rm.write(STOP);lr.write(STOP);rr.write(STOP);}
void setDrive(byte a,byte b,byte c,byte d,byte e,byte f){lf.write(a);rf.write(b);lm.write(c);rm.write(d);lr.write(e);rr.write(f);}
int distanceCm(){digitalWrite(TRIG_PIN,LOW);delayMicroseconds(2);digitalWrite(TRIG_PIN,HIGH);delayMicroseconds(10);digitalWrite(TRIG_PIN,LOW);unsigned long us=pulseIn(ECHO_PIN,HIGH,30000UL);return us?(int)(us*0.0343f/2.0f):999;}
void moveFor(byte a,byte b,byte c,byte d,byte e,byte f,unsigned long ms){autoMode=false;setDrive(a,b,c,d,e,f);unsigned long t=millis();while(millis()-t<ms){if(Serial.available()){String s=Serial.readStringUntil('\n');s.trim();s.toUpperCase();if(s=="STOP"||s=="HOME"){stopAll();return;}if(s.length())pendingCommand=s;}delay(5);}stopAll();}
void forward(int n){moveFor(LF_FWD,RF_FWD,LM_FWD,RM_FWD,LR_FWD,RR_FWD,(unsigned long)n*STEP_MS);}
void backward(int n){moveFor(LF_REV,RF_REV,LM_REV,RM_REV,LR_REV,RR_REV,(unsigned long)n*STEP_MS);}
// The left and right servo bodies are mounted as mirror images.
// Therefore the same PWM value on both sides produces opposite
// physical wheel directions and turns the rover in place.
void turnLeft(int n){moveFor(LF_REV,RF_FWD,LM_REV,RM_FWD,LR_REV,RR_FWD,(unsigned long)n*TURN_MS);}
void turnRight(int n){moveFor(LF_FWD,RF_REV,LM_FWD,RM_REV,LR_FWD,RR_REV,(unsigned long)n*TURN_MS);}
void runAuto(){
  unsigned long now=millis();
  if(autoPhase==0){
    setDrive(LF_FWD,RF_FWD,LM_FWD,RM_FWD,LR_FWD,RR_FWD);
    if(now-lastScan>=150){lastScan=now;if(distanceCm()<=FRONT_LIMIT_CM){stopAll();autoRight=!autoRight;autoPhase=1;phaseAt=now;}}
  }else if(autoPhase==1){
    stopAll();
    if(now-phaseAt>=AUTO_STOP_MS){autoPhase=2;phaseAt=now;}
  }else if(autoPhase==2){
    setDrive(LF_REV,RF_REV,LM_REV,RM_REV,LR_REV,RR_REV);
    if(now-phaseAt>=AUTO_BACK_MS){autoPhase=3;phaseAt=now;}
  }else if(autoPhase==3){
    stopAll();
    if(now-phaseAt>=AUTO_PAUSE_MS){autoPhase=4;phaseAt=now;}
  }else{
    if(autoRight)setDrive(LF_FWD,RF_REV,LM_FWD,RM_REV,LR_FWD,RR_REV);
    else setDrive(LF_REV,RF_FWD,LM_REV,RM_FWD,LR_REV,RR_FWD);
    if(now-phaseAt>=AUTO_TURN_MS){autoPhase=0;lastScan=now;stopAll();}
  }
}
void runCommand(String line){line.trim();line.toUpperCase();if(!line.length())return;String op=line;int n=1,sp=line.indexOf(' ');if(sp>0){op=line.substring(0,sp);n=line.substring(sp+1).toInt();}n=constrain(n,1,MAX_STEPS);if(op=="START"){autoMode=true;autoPhase=0;lastScan=0;}else if(op=="STOP"||op=="HOME"){autoMode=false;autoPhase=0;stopAll();}else if(op=="FW")forward(n);else if(op=="BW")backward(n);else if(op=="LT")turnLeft(n);else if(op=="RT")turnRight(n);else if(op=="DIST"){Serial.print("DIST ");Serial.println(distanceCm());}}
void setup(){Serial.begin(115200);lf.attach(LF_PIN);rf.attach(RF_PIN);lm.attach(LM_PIN);rm.attach(RM_PIN);lr.attach(LR_PIN);rr.attach(RR_PIN);pinMode(TRIG_PIN,OUTPUT);pinMode(ECHO_PIN,INPUT);stopAll();}
void printStatus(){Serial.print("VERSION ");Serial.print(FIRMWARE_VERSION);Serial.print(" AUTO ");Serial.print(autoMode?1:0);Serial.print(" PHASE ");Serial.println(autoPhase);}
void testTurn(bool right){autoMode=false;autoPhase=0;stopAll();delay(500);if(right)setDrive(LF_FWD,RF_REV,LM_FWD,RM_REV,LR_FWD,RR_REV);else setDrive(LF_REV,RF_FWD,LM_REV,RM_FWD,LR_REV,RR_FWD);delay(5000);stopAll();}
void loop(){if(pendingCommand.length()){String line=pendingCommand;pendingCommand="";runCommand(line);}if(Serial.available()){String line=Serial.readStringUntil('\n');line.trim();line.toUpperCase();if(line=="STATUS")printStatus();else if(line=="TEST_LEFT")testTurn(false);else if(line=="TEST_RIGHT")testTurn(true);else runCommand(line);}if(autoMode)runAuto();}
