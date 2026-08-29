/*
 * RoboMate LH-岩爪
 * Four two-joint legs, eight 180-degree servos:
 * upper joints D2..D5, lower joints D6..D9
 * Ultrasonic sensor: Trig D10, Echo D11
 */
#include <Servo.h>
#define MAX_STEPS 20
#define HOME_ANGLE 90
#define LIFT_ANGLE 65
#define STEP_MS 180
const byte upperPin[4]={2,3,4,5},lowerPin[4]={6,7,8,9},TRIG_PIN=10,ECHO_PIN=11;
Servo upper[4],lower[4];
bool autoMode=true; unsigned long lastScan=0;
String pendingCommand="";
void home(){for(byte i=0;i<4;i++){upper[i].write(HOME_ANGLE);lower[i].write(HOME_ANGLE);}}
void pose(byte u0,byte u1,byte u2,byte u3,byte l0,byte l1,byte l2,byte l3){upper[0].write(u0);upper[1].write(u1);upper[2].write(u2);upper[3].write(u3);lower[0].write(l0);lower[1].write(l1);lower[2].write(l2);lower[3].write(l3);}
void waitStep(unsigned long ms){unsigned long t=millis();while(millis()-t<ms){if(Serial.available()){String s=Serial.readStringUntil('\n');s.trim();s.toUpperCase();if(s=="STOP"||s=="HOME"){autoMode=false;home();return;}if(s.length())pendingCommand=s;}delay(5);}}
void gait(bool reverse){for(byte phase=0;phase<2;phase++){byte swing=(phase==0)?(reverse?HOME_ANGLE:LIFT_ANGLE):(reverse?LIFT_ANGLE:HOME_ANGLE);byte support=(phase==0)?(reverse?LIFT_ANGLE:HOME_ANGLE):(reverse?HOME_ANGLE:LIFT_ANGLE);pose(swing,support,support,swing,swing,support,support,swing);waitStep(STEP_MS);home();waitStep(70);}}
void walk(int n,bool reverse){for(int i=0;i<n;i++)gait(reverse);}
void turn(int n,bool right){for(int i=0;i<n;i++){if(right)pose(LIFT_ANGLE,HOME_ANGLE,LIFT_ANGLE,HOME_ANGLE,HOME_ANGLE,LIFT_ANGLE,HOME_ANGLE,LIFT_ANGLE);else pose(HOME_ANGLE,LIFT_ANGLE,HOME_ANGLE,LIFT_ANGLE,LIFT_ANGLE,HOME_ANGLE,LIFT_ANGLE,HOME_ANGLE);waitStep(STEP_MS);home();waitStep(70);}}
int distanceCm(){digitalWrite(TRIG_PIN,LOW);delayMicroseconds(2);digitalWrite(TRIG_PIN,HIGH);delayMicroseconds(10);digitalWrite(TRIG_PIN,LOW);unsigned long us=pulseIn(ECHO_PIN,HIGH,30000UL);return us?(int)(us*0.0343f/2.0f):999;}
void runAuto(){if(millis()-lastScan<250)return;lastScan=millis();if(distanceCm()<20){turn(1,true);}else walk(1,false);}
void runCommand(String line){line.trim();line.toUpperCase();if(!line.length())return;String op=line;int n=1,sp=line.indexOf(' ');if(sp>0){op=line.substring(0,sp);n=line.substring(sp+1).toInt();}n=constrain(n,1,MAX_STEPS);if(op=="START"){autoMode=true;lastScan=0;}else if(op=="FW"){autoMode=false;walk(n,false);}else if(op=="BW"){autoMode=false;walk(n,true);}else if(op=="LT"){autoMode=false;turn(n,false);}else if(op=="RT"){autoMode=false;turn(n,true);}else if(op=="HOME"||op=="STOP"){autoMode=false;home();}else if(op=="DIST"){Serial.print("DIST ");Serial.println(distanceCm());}}
void setup(){Serial.begin(115200);for(byte i=0;i<4;i++){upper[i].attach(upperPin[i]);lower[i].attach(lowerPin[i]);}pinMode(TRIG_PIN,OUTPUT);pinMode(ECHO_PIN,INPUT);home();}
void loop(){if(pendingCommand.length()){String s=pendingCommand;pendingCommand="";runCommand(s);}if(Serial.available())runCommand(Serial.readStringUntil('\n'));if(autoMode)runAuto();}
