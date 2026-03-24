/**
 * Stripe Checkout configuration for product pages.
 * 1) Set publishableKey from Stripe Dashboard.
 * 2) Set price IDs for each product slug and size.
 */
(function () {
  window.ZYBAR_STRIPE_CONFIG = window.ZYBAR_STRIPE_CONFIG || {
    publishableKey: "pk_test_51RpPz032satLY6UqYeduQTw6uy9CTTJvL0w67UHXfu4QETjzQa2n3EpxF3Ovl2Uc0O2blGSi5BRDJIl60NdTu4Mb00TJ5iFec0",
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
    prices: {
        "audi-r8-white": {
          "30x45": "price_1TABYg32satLY6Uq6YDazH9S",
          "40x60": "price_1TABYh32satLY6UquOmmgpm1"
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
