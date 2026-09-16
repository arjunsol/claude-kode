// Minimal Kode Dot starter: lights the onboard NeoPixel while the top
// button is held. Deliberately has no display/LVGL dependency - see
// skills/kode-dot-dev/SKILL.md for how to add the display driver.
#include <Arduino.h>
#include <Adafruit_NeoPixel.h>
#include "kode_pins.h"

static Adafruit_NeoPixel pixel(LED_STRIP_NUM_LEDS, LED_STRIP_PIN, NEO_GRB + NEO_KHZ800);

void setup() {
  Serial.begin(115200);
  pinMode(BUTTON_TOP, INPUT_PULLUP);
  pixel.begin();
  pixel.setBrightness(40);
}

void loop() {
  bool pressed = digitalRead(BUTTON_TOP) == LOW;
  pixel.setPixelColor(0, pressed ? pixel.Color(0, 255, 0) : pixel.Color(20, 0, 40));
  pixel.show();
  delay(50);
}
