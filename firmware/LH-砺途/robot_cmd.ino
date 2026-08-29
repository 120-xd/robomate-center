/*
 * RoboMate LH-砺途
 * Four 360-degree wheel servos D2..D5
 * Ultrasonic sensors: front D10/D11, left D6/D7, right D8/D9
 * LED D13, buzzer D12
 */
#include <Servo.h>
#define MAX_STEPS 20
#define STOP 90
#define STEP_MS 400
#define TURN_MS 300
#define FRONT_STOP 20
#define SIDE_LIMIT 15
const byte LF_PIN=2,RF_PIN=3,LR_PIN=4,RR_PIN=5,LT=6,LE=7,RT=8,RE=9,FT=10,FE=11,BUZZER=12,LED=13;
const byte LF_FWD=180,LF_REV=0,RF_FWD=0,RF_REV=180,LR_FWD=180,LR_REV=0,RR_FWD=0,RR_REV=180;
Servo leftFront,rightFront,leftRear,rightRear;bool autoMode=true;byte phase=0;unsigned long phaseAt=0,lastScan=0;
void stopAll(){leftFront.write(STOP);rightFront.write(STOP);leftRear.write(STOP);rightRear.write(STOP);}
void drive(byte a,byte b,byte c,byte d){leftFront.write(a);rightFront.write(b);leftRear.write(c);rightRear.write(d);}
int readDistance(byte trig,byte echo){digitalWrite(trig,LOW);delayMicroseconds(2);digitalWrite(trig,HIGH);delayMicroseconds(10);digitalWrite(trig,LOW);unsigned long us=pulseIn(echo,HIGH,30000UL);return us?(int)(us*0.0343f/2.0f):999;}
void beep(){tone(BUZZER,1200,120);}
void moveFor(byte a,byte b,byte c,byte d,unsigned long ms){autoMode=false;digitalWrite(LED,LOW);drive(a,b,c,d);unsigned long t=millis();while(millis()-t<ms){if(Serial.available()){String s=Serial.readStringUntil('\n');s.trim();s.toUpperCase();if(s=="STOP"||s=="HOME"){stopAll();return;}}delay(5);}stopAll();}
void forward(int n){moveFor(LF_FWD,RF_FWD,LR_FWD,RR_FWD,(unsigned long)n*STEP_MS);}
void backward(int n){moveFor(LF_REV,RF_REV,LR_REV,RR_REV,(unsigned long)n*STEP_MS);}
void turnLeft(int n){moveFor(LF_REV,RF_FWD,LR_REV,RR_FWD,(unsigned long)n*TURN_MS);}
void turnRight(int n){moveFor(LF_FWD,RF_REV,LR_FWD,RR_REV,(unsigned long)n*TURN_MS);}
void runAuto(){unsigned long now=millis();if(phase==0){digitalWrite(LED,LOW);drive(LF_FWD,RF_FWD,LR_FWD,RR_FWD);if(now-lastScan>=150){lastScan=now;int f=readDistance(FT,FE),l=readDistance(LT,LE),r=readDistance(RT,RE);if(f<FRONT_STOP){stopAll();beep();phase=1;phaseAt=now;}else if(l<SIDE_LIMIT||r<SIDE_LIMIT)digitalWrite(LED,HIGH);}}else if(phase==1){drive(LF_REV,RF_REV,LR_REV,RR_REV);if(now-phaseAt>=450){phase=2;phaseAt=now;}}else{drive(LF_FWD,RF_REV,LR_FWD,RR_REV);if(now-phaseAt>=450){phase=0;lastScan=now;stopAll();}}}
void runCommand(String line){line.trim();line.toUpperCase();if(!line.length())return;if(line=="LED ON"){digitalWrite(LED,HIGH);return;}if(line=="LED OFF"){digitalWrite(LED,LOW);return;}String op=line;int n=1,sp=line.indexOf(' ');if(sp>0){op=line.substring(0,sp);n=line.substring(sp+1).toInt();}n=constrain(n,1,MAX_STEPS);if(op=="START"){autoMode=true;phase=0;lastScan=0;digitalWrite(LED,HIGH);}else if(op=="STOP"||op=="HOME"){autoMode=false;phase=0;stopAll();digitalWrite(LED,LOW);noTone(BUZZER);}else if(op=="FW")forward(n);else if(op=="BW")backward(n);else if(op=="LT")turnLeft(n);else if(op=="RT")turnRight(n);else if(op=="DIST"){Serial.print("FRONT ");Serial.print(readDistance(FT,FE));Serial.print(" LEFT ");Serial.print(readDistance(LT,LE));Serial.print(" RIGHT ");Serial.println(readDistance(RT,RE));}else if(op=="BEEP")beep();}
void setup(){Serial.begin(115200);leftFront.attach(LF_PIN);rightFront.attach(RF_PIN);leftRear.attach(LR_PIN);rightRear.attach(RR_PIN);pinMode(LT,OUTPUT);pinMode(LE,INPUT);pinMode(RT,OUTPUT);pinMode(RE,INPUT);pinMode(FT,OUTPUT);pinMode(FE,INPUT);pinMode(BUZZER,OUTPUT);pinMode(LED,OUTPUT);stopAll();}
void loop(){if(Serial.available())runCommand(Serial.readStringUntil('\n'));if(autoMode)runAuto();}
