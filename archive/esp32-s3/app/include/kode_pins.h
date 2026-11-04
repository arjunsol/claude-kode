#pragma once
// Kode Dot (ESP32-S3) pin map.
//
// Values verified against kodediy/kodedot_examples pin_config.h on
// 2026-09-16 for hardware compatibility. Re-check against docs.kode.diy
// if your unit's hardware/firmware revision differs - the device shipped
// to backers only recently and pin assignments could still change.

// ---- Buttons ----
#define BUTTON_TOP             0   // GPIO0, doubles as the BOOT button
// Bottom button and the D-pad are NOT raw GPIOs - see the IO-expander
// section below.

// ---- Addressable LED (single WS2812-style NeoPixel) ----
#define LED_STRIP_PIN           4
#define LED_STRIP_NUM_LEDS      1

// ---- LCD panel: 410x502 AMOLED over QSPI (esp_lcd_co5300 driver) ----
#define LCD_WIDTH              410
#define LCD_HEIGHT             502
#define LCD_SCLK                17
#define LCD_SDIO0                15
#define LCD_SDIO1                14
#define LCD_SDIO2                16
#define LCD_SDIO3                10
#define LCD_RST                   8
#define LCD_CS                    9

// ---- Touch controller + IO expander share this I2C bus ----
#define TOUCH_I2C_SCL            47
#define TOUCH_I2C_SDA            48
#define IOEXP_I2C_ADDR         0x20   // TCA9555
#define IOEXP_INT_PIN             18

// ---- microSD (1-bit SDMMC) ----
#define SD_PIN_CMD                 5
#define SD_PIN_CLK                 6
#define SD_PIN_D0                  7

// ---- Microphone (I2S) ----
#define MIC_I2S_SCK               38
#define MIC_I2S_WS                45
#define MIC_I2S_DIN               21

// ---- Power management ----
#define BQ25896_I2C_ADDRESS    0x6A   // charger / PMIC
// Fuel-gauge address below is MAX17048-style per the verified source
// header, but a kode_BQ27220 driver also exists in the kodediy org for a
// different fuel-gauge chip. UNVERIFIED which one is on current hardware -
// check before depending on this address.
#define FUEL_GAUGE_I2C_ADDRESS  0x36

// ---- TCA9555 IO-expander pin map (expander bit numbers, not GPIOs) ----
#define EXPANDER_MAG_INT          0   // P00 - magnetometer interrupt
#define EXPANDER_RTC_INTB         1   // P01 - RTC INTB
#define EXPANDER_RTC_INTA         2   // P02 - RTC INTA
#define EXPANDER_SPK_SHUTDOWN     3   // P03 - speaker shutdown
#define EXPANDER_PWR_PHRL         4   // P04 - power PHRL
#define EXPANDER_FG_ALRT          5   // P05 - fuel gauge alert
#define EXPANDER_PAD_TOP          6   // P06 - D-pad TOP
#define EXPANDER_PAD_LEFT         7   // P07 - D-pad LEFT
#define EXPANDER_PAD_BOTTOM       8   // P10 - D-pad BOTTOM
#define EXPANDER_BUTTON_BOTTOM    9   // P11 - bottom button
#define EXPANDER_PWR_INT         10   // P12 - power INT
#define EXPANDER_PAD_RIGHT       11   // P13 - D-pad RIGHT
#define EXPANDER_SD_CD           14   // P16 - SD card detect
