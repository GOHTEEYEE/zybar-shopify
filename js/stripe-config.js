/**
 * Stripe Checkout configuration for product pages.
 *
 * To create/update Stripe Products and Price IDs from data/products.json:
 *   1. Set STRIPE_SECRET_KEY in .env (Secret key from Stripe Dashboard).
 *   2. Run: npm run sync-stripe
 *
 * That writes data/stripe-price-ids.json and updates prices below.
 *
 * Note: We assign the full object below (no `||` merge). Otherwise a truthy
 * partial `ZYBAR_STRIPE_CONFIG` from elsewhere could block real price IDs.
 */
(function () {
  window.ZYBAR_STRIPE_CONFIG = {
    publishableKey:
      "pk_live_51RpPz032satLY6UqpvVhmnV8U5xVORlMOgjIvP4ivxIORZOxlcuQidIPWN7zAlT4XOK4mTajGkeaFqkAlo84waYf00y7eZJAAd",
    successUrl:
      (window.location && window.location.origin ? window.location.origin : "") +
      "/purchase-confirmation.html",
    cancelUrl: "",
    apiBaseUrl: "",
    sizePricesUSD: {"30x45":138,"40x60":148},
    perProductSizePricesUSD: {
      "bmw-m4-g82-01": {
        "30x45": 98,
        "40x60": 108
      },
      "audi-rs6": {
        "30x45": 98,
        "40x60": 108
      },
      "audi-r8-white": {
        "30x45": 98,
        "40x60": 108
      },
      "lambrghini-svj-tailights": {
        "30x45": 98,
        "40x60": 108
      },
      "nissan-gtr": {
        "30x45": 98,
        "40x60": 108
      },
      "c-lamborghini-oragne": {
        "30x45": 98,
        "40x60": 108
      },
      "dodge-srt-hellcat-01": {
        "30x45": 98,
        "40x60": 108
      },
      "bmw-m1000rr": {
        "30x45": 98,
        "40x60": 108
      },
      "toyota-supra": {
        "30x45": 118,
        "40x60": 128
      },
      "dark-colour-audi": {
        "30x45": 118,
        "40x60": 128
      },
      "ferrari-f8": {
        "30x45": 118,
        "40x60": 128
      },
      "bmw-m4-black": {
        "30x45": 118,
        "40x60": 128
      },
      "b-ferrari-f40": {
        "30x45": 118,
        "40x60": 128
      },
      "ferrari-488": {
        "30x45": 118,
        "40x60": 128
      },
      "audi-r8-gt3": {
        "30x45": 118,
        "40x60": 128
      },
      "luneva-dreamy-garden": {
        "30x45": 39,
        "40x60": 49
      },
      "luneva-cyan-blue": {
        "30x45": 39,
        "40x60": 49
      },
      "luneva-glowing-garden": {
        "30x45": 39,
        "40x60": 49
      },
      "luneva-starlit-garden": {
        "30x45": 39,
        "40x60": 49
      }
    },
    sharedPriceIdsBySize: {
      "30x45": "",
      "40x60": ""
    },
    prices: {
      "audi-r8-gt3": {
        "30x45": "price_1Twm7Y32satLY6UqiMpSOJA2",
        "40x60": "price_1Twm7Z32satLY6Uq8g6zE8yo"
      },
      "audi-r8-white": {
        "30x45": "price_1Twm7b32satLY6UqwkaKJ1jX",
        "40x60": "price_1Twm7c32satLY6UqVyeVJXFK"
      },
      "audi-r8-yellow": {
        "30x45": "price_1Twkza32satLY6UqbajrPfgU",
        "40x60": "price_1Twkzb32satLY6UqKCIhszx9"
      },
      "audi-rs6": {
        "30x45": "price_1Twm7e32satLY6UqkWs8bo1o",
        "40x60": "price_1Twm7f32satLY6UqzukGqI0t"
      },
      "b-dodge-hellcat-02": {
        "30x45": "price_1Twkzf32satLY6Uq4TQlZdFu",
        "40x60": "price_1Twkzg32satLY6UqNFG0DZNn"
      },
      "b-dodge-hellcat-03": {
        "30x45": "price_1Twkzh32satLY6UqiQN7CpzC",
        "40x60": "price_1Twkzi32satLY6UqLfVOstiq"
      },
      "b-ferrari-f40": {
        "30x45": "price_1Twm7i32satLY6UqciJqvZF4",
        "40x60": "price_1Twm7j32satLY6UqnnSMTqVG"
      },
      "b-maserati-mc20": {
        "30x45": "price_1Twkzm32satLY6UqUXPdEXZw",
        "40x60": "price_1Twkzo32satLY6UqtnORaVwP"
      },
      "b-nissan-gt-r35": {
        "30x45": "price_1Twkzp32satLY6UqjdNKwIrQ",
        "40x60": "price_1Twkzq32satLY6UqzXM0Ddnz"
      },
      "b-yamaha-r1": {
        "30x45": "price_1Twkzs32satLY6UquGOby3sj",
        "40x60": "price_1Twkzt32satLY6UqwS3nCdlr"
      },
      "bmw-classic-3-0": {
        "30x45": "price_1Twkzu32satLY6UqYINckb5k",
        "40x60": "price_1Twkzv32satLY6UqvVazL2kH"
      },
      "bmw-m1000rr": {
        "30x45": "price_1Twm7p32satLY6UqcY36yd8y",
        "40x60": "price_1Twm7q32satLY6UqZ90Ta8KP"
      },
      "bmw-m2-neon": {
        "30x45": "price_1Twkzz32satLY6UqMDnPXkOY",
        "40x60": "price_1Twl0032satLY6Uqmf0gJD9y"
      },
      "bmw-m4": {
        "30x45": "price_1Twl0132satLY6UqPFZ78jWg",
        "40x60": "price_1Twl0232satLY6UqFaQbGuv4"
      },
      "bmw-m4-black": {
        "30x45": "price_1Twm7t32satLY6UqrnfXZjVs",
        "40x60": "price_1Twm7u32satLY6UqUIjjWp0l"
      },
      "bmw-m4-g82-01": {
        "30x45": "price_1Twm7v32satLY6UqdVBDPvkl",
        "40x60": "price_1Twm7w32satLY6UqSCV4MZYA"
      },
      "bmw-m5-e39": {
        "30x45": "price_1Twl0832satLY6UqqRZHQrxe",
        "40x60": "price_1Twl0932satLY6UqlX6IEOqE"
      },
      "bugatti-tailights": {
        "30x45": "price_1Twl0A32satLY6UquyohRxaN",
        "40x60": "price_1Twl0C32satLY6UqXY2lthXD"
      },
      "c-ford-mustang-gt350r": {
        "30x45": "price_1Twl0D32satLY6Uq2Vnc6ohE",
        "40x60": "price_1Twl0E32satLY6Uqdlb2MHvp"
      },
      "c-lamborghini-oragne": {
        "30x45": "price_1Twm8132satLY6Uq6wkEaBik",
        "40x60": "price_1Twm8232satLY6UqPJHuKXWS"
      },
      "custom-led-car-wall-art": {
        "30x45": "price_1Twl0I32satLY6UqW8Pein0J",
        "40x60": "price_1Twl0J32satLY6UqhiZChXUl"
      },
      "dark-colour-audi": {
        "30x45": "price_1Twm8432satLY6Uqn6hQpA4I",
        "40x60": "price_1Twm8532satLY6UqG5hTyUsF"
      },
      "dodge-srt-hellcat-01": {
        "30x45": "price_1Twm8732satLY6UqIUEeeNF5",
        "40x60": "price_1Twm8832satLY6Uq8SmSZDYr"
      },
      "ferrari-488": {
        "30x45": "price_1Twm8932satLY6UqmDsaFz1Z",
        "40x60": "price_1Twm8A32satLY6UqOAhfBHai"
      },
      "ferrari-f8": {
        "30x45": "price_1Twm8C32satLY6UqhznHXv7u",
        "40x60": "price_1Twm8D32satLY6Uq9ZApSX74"
      },
      "lambrghini-svj-tailights": {
        "30x45": "price_1Twm8E32satLY6UqWSbV8RzY",
        "40x60": "price_1Twm8F32satLY6UqvshzfwvJ"
      },
      "mercedes-benz-amg-1": {
        "30x45": "price_1Twl0X32satLY6Uq42ozf0mY",
        "40x60": "price_1Twl0Y32satLY6UqrzMbaiSr"
      },
      "mercedes-benz-cls-amg63": {
        "30x45": "price_1Twl0Z32satLY6Uqetx9qpnk",
        "40x60": "price_1Twl0a32satLY6Uq5JtKYJYJ"
      },
      "mercedes-benz-g63-double-tail-2": {
        "30x45": "price_1Twl0c32satLY6UqFBzbcC00",
        "40x60": "price_1Twl0d32satLY6Uq5XNk4mRQ"
      },
      "nissan-gtr": {
        "30x45": "price_1Twm8K32satLY6UqGTlQNbHv",
        "40x60": "price_1Twm8L32satLY6UqYMWb5ewj"
      },
      "porsche-gt3-rs": {
        "30x45": "price_1Twl0h32satLY6UqZE8VwbmS",
        "40x60": "price_1Twl0i32satLY6Uqtnvhao8I"
      },
      "porsche-gt3-rs-green": {
        "30x45": "price_1Twl0j32satLY6UqWODSlIl9",
        "40x60": "price_1Twl0k32satLY6UquGpvSNvx"
      },
      "porsche-gt3-rs-grey": {
        "30x45": "price_1Twl0m32satLY6UqQkSalWhj",
        "40x60": "price_1Twl0n32satLY6Uqlk5hrB9A"
      },
      "porsche-r": {
        "30x45": "price_1Twl0p32satLY6Uq54SGZrWA",
        "40x60": "price_1Twl0p32satLY6UqS6pm56GI"
      },
      "toyota-supra": {
        "30x45": "price_1Twm8P32satLY6Uqr0rDbgxK",
        "40x60": "price_1Twm8Q32satLY6UqEdklSMfX"
      },
      "xa-ferrari-motorcycle-1": {
        "30x45": "price_1Twl0u32satLY6UqzzmvM3Fk",
        "40x60": "price_1Twl0v32satLY6Uqgm0pTyST"
      },
      "xd-bmw-headlights-motorcycle": {
        "30x45": "price_1Twl0w32satLY6Uqs86pKzTj",
        "40x60": "price_1Twl0x32satLY6UqMX2Zw6J3"
      }
    }
  };
})();
