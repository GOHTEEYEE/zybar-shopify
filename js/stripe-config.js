/**
 * Stripe Checkout configuration for product pages.
 * 1) Set publishableKey from Stripe Dashboard.
 * 2) Set price IDs for each product slug and size.
 */
(function () {
  window.ZYBAR_STRIPE_CONFIG = window.ZYBAR_STRIPE_CONFIG || {
    publishableKey: "pk_live_51RpPz032satLY6UqpvVhmnV8U5xVORlMOgjIvP4ivxIORZOxlcuQidIPWN7zAlT4XOK4mTajGkeaFqkAlo84waYf00y7eZJAAd",
    // After successful payment, send customers to the digital postcard page.
    successUrl: (window.location && window.location.origin ? window.location.origin : "") + "/purchase-confirmation.html",
    cancelUrl: "",
    // If your checkout API is on another origin, set it (e.g. "https://api.example.com").
    apiBaseUrl: "",
    // Display prices by size (USD) used on product page UI.
    sizePricesUSD: {"30x45":110,"40x60":150},
    // Optional shared Stripe Price IDs if all products use same pricing.
    // Fill these and you can skip per-product prices below.
    sharedPriceIdsBySize: {
      "30x45": "price_1TABYg32satLY6Uq6YDazH9S",
      "40x60": "price_1TABYh32satLY6UquOmmgpm1"
    },
    prices:       {
        "audi-r8-white": {
          "30x45": "price_1TJYPq32satLY6UqJwOGN6Zj",
          "40x60": "price_1TJYPr32satLY6Uq3zJyVb70"
        },
        "audi-r8-yellow": {
          "30x45": "price_1TJYPs32satLY6UqaSEFBQXH",
          "40x60": "price_1TJYPt32satLY6UqbTDY6Leb"
        },
        "audi-r8-gt3": {
          "30x45": "price_1TJYPu32satLY6Uqll7CDRk8",
          "40x60": "price_1TJYPv32satLY6Uq3apD6pJP"
        },
        "audi-rs6": {
          "30x45": "price_1TJYPx32satLY6UqeayYITZs",
          "40x60": "price_1TJYPx32satLY6UqsJGDOlrH"
        },
        "b-ferrari-f40": {
          "30x45": "price_1TJYPz32satLY6Uq1WeRliut",
          "40x60": "price_1TJYPz32satLY6Uq8PmtWaW5"
        },
        "b-maserati-mc20": {
          "30x45": "price_1TJYQ132satLY6UqTC9xBmS2",
          "40x60": "price_1TJYQ232satLY6UqZWriCWAQ"
        },
        "b-dodge-hellcat-02": {
          "30x45": "price_1TJYQ332satLY6UqtKoKpmuj",
          "40x60": "price_1TJYQ432satLY6UqElRP0y68"
        },
        "b-dodge-hellcat-03": {
          "30x45": "price_1TJYQ532satLY6UqdAjBEOeU",
          "40x60": "price_1TJYQ632satLY6Uqbh71icyj"
        }
      },
        "audi-r8-yellow": {
          "30x45": "price_1TABYi32satLY6Uq9j0gFaT4",
          "40x60": "price_1TABYj32satLY6UqQB5sHt2R"
        },
        "audi-r8-gt3": {
          "30x45": "price_1TABYk32satLY6UqUSeM86Iz",
          "40x60": "price_1TABYl32satLY6UqNf1Xv5tc"
        },
        "audi-rs6": {
          "30x45": "price_1TABYm32satLY6UqsRfwdsZu",
          "40x60": "price_1TABYn32satLY6UqPSIni6yl"
        },
        "b-ferrari-f40": {
          "30x45": "price_1TABYo32satLY6UqNrPrJ46p",
          "40x60": "price_1TABYp32satLY6UqJ3OyuEM5"
        },
        "b-maserati-mc20": {
          "30x45": "price_1TABYr32satLY6Uqgzs5PLfA",
          "40x60": "price_1TABYr32satLY6UqnRTHuZnL"
        },
        "b-dodge-hellcat-02": {
          "30x45": "price_1TABYt32satLY6UqaTOR21wn",
          "40x60": "price_1TABYt32satLY6Uqo2JsLFfU"
        },
        "b-dodge-hellcat-03": {
          "30x45": "price_1TABYv32satLY6UqeaeQPt6N",
          "40x60": "price_1TABYv32satLY6UqTxJw79NJ"
        }
      },
        "audi-r8-yellow": {
          "30x45": "price_1TABYi32satLY6Uq9j0gFaT4",
          "40x60": "price_1TABYj32satLY6UqQB5sHt2R"
        },
        "audi-r8-gt3": {
          "30x45": "price_1TABYk32satLY6UqUSeM86Iz",
          "40x60": "price_1TABYl32satLY6UqNf1Xv5tc"
        },
        "audi-rs6": {
          "30x45": "price_1TABYm32satLY6UqsRfwdsZu",
          "40x60": "price_1TABYn32satLY6UqPSIni6yl"
        },
        "b-ferrari-f40": {
          "30x45": "price_1TABYo32satLY6UqNrPrJ46p",
          "40x60": "price_1TABYp32satLY6UqJ3OyuEM5"
        },
        "b-maserati-mc20": {
          "30x45": "price_1TABYr32satLY6Uqgzs5PLfA",
          "40x60": "price_1TABYr32satLY6UqnRTHuZnL"
        },
        "b-dodge-hellcat-02": {
          "30x45": "price_1TABYt32satLY6UqaTOR21wn",
          "40x60": "price_1TABYt32satLY6Uqo2JsLFfU"
        },
        "b-dodge-hellcat-03": {
          "30x45": "price_1TABYv32satLY6UqeaeQPt6N",
          "40x60": "price_1TABYv32satLY6UqTxJw79NJ"
        }
      },
        "audi-r8-yellow": {
          "30x45": "price_1TABYi32satLY6Uq9j0gFaT4",
          "40x60": "price_1TABYj32satLY6UqQB5sHt2R"
        },
        "audi-r8-gt3": {
          "30x45": "price_1TABYk32satLY6UqUSeM86Iz",
          "40x60": "price_1TABYl32satLY6UqNf1Xv5tc"
        },
        "audi-rs6": {
          "30x45": "price_1TABYm32satLY6UqsRfwdsZu",
          "40x60": "price_1TABYn32satLY6UqPSIni6yl"
        },
        "b-ferrari-f40": {
          "30x45": "price_1TABYo32satLY6UqNrPrJ46p",
          "40x60": "price_1TABYp32satLY6UqJ3OyuEM5"
        },
        "b-maserati-mc20": {
          "30x45": "price_1TABYr32satLY6Uqgzs5PLfA",
          "40x60": "price_1TABYr32satLY6UqnRTHuZnL"
        },
        "b-dodge-hellcat-02": {
          "30x45": "price_1TABYt32satLY6UqaTOR21wn",
          "40x60": "price_1TABYt32satLY6Uqo2JsLFfU"
        },
        "b-dodge-hellcat-03": {
          "30x45": "price_1TABYv32satLY6UqeaeQPt6N",
          "40x60": "price_1TABYv32satLY6UqTxJw79NJ"
        }
      },
        "audi-r8-yellow": {
          "30x45": "price_1TABYi32satLY6Uq9j0gFaT4",
          "40x60": "price_1TABYj32satLY6UqQB5sHt2R"
        },
        "audi-r8-gt3": {
          "30x45": "price_1TABYk32satLY6UqUSeM86Iz",
          "40x60": "price_1TABYl32satLY6UqNf1Xv5tc"
        },
        "audi-rs6": {
          "30x45": "price_1TABYm32satLY6UqsRfwdsZu",
          "40x60": "price_1TABYn32satLY6UqPSIni6yl"
        },
        "b-ferrari-f40": {
          "30x45": "price_1TABYo32satLY6UqNrPrJ46p",
          "40x60": "price_1TABYp32satLY6UqJ3OyuEM5"
        },
        "b-maserati-mc20": {
          "30x45": "price_1TABYr32satLY6Uqgzs5PLfA",
          "40x60": "price_1TABYr32satLY6UqnRTHuZnL"
        },
        "b-dodge-hellcat-02": {
          "30x45": "price_1TABYt32satLY6UqaTOR21wn",
          "40x60": "price_1TABYt32satLY6Uqo2JsLFfU"
        },
        "b-dodge-hellcat-03": {
          "30x45": "price_1TABYv32satLY6UqeaeQPt6N",
          "40x60": "price_1TABYv32satLY6UqTxJw79NJ"
        }
      },
        "audi-r8-yellow": {
          "30x45": "price_1TABYi32satLY6Uq9j0gFaT4",
          "40x60": "price_1TABYj32satLY6UqQB5sHt2R"
        },
        "audi-r8-gt3": {
          "30x45": "price_1TABYk32satLY6UqUSeM86Iz",
          "40x60": "price_1TABYl32satLY6UqNf1Xv5tc"
        },
        "audi-rs6": {
          "30x45": "price_1TABYm32satLY6UqsRfwdsZu",
          "40x60": "price_1TABYn32satLY6UqPSIni6yl"
        },
        "b-ferrari-f40": {
          "30x45": "price_1TABYo32satLY6UqNrPrJ46p",
          "40x60": "price_1TABYp32satLY6UqJ3OyuEM5"
        },
        "b-maserati-mc20": {
          "30x45": "price_1TABYr32satLY6Uqgzs5PLfA",
          "40x60": "price_1TABYr32satLY6UqnRTHuZnL"
        },
        "b-dodge-hellcat-02": {
          "30x45": "price_1TABYt32satLY6UqaTOR21wn",
          "40x60": "price_1TABYt32satLY6Uqo2JsLFfU"
        },
        "b-dodge-hellcat-03": {
          "30x45": "price_1TABYv32satLY6UqeaeQPt6N",
          "40x60": "price_1TABYv32satLY6UqTxJw79NJ"
        }
      }
  };
})();
