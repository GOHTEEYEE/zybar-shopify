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
    perProductSizePricesUSD: {},
    sharedPriceIdsBySize: {
      "30x45": "",
      "40x60": ""
    },
    prices: {
      "audi-r8-gt3": {
        "30x45": "price_1TwkzV32satLY6UqgLw8ya9j",
        "40x60": "price_1TwkzW32satLY6UqJVLNG7pi"
      },
      "audi-r8-white": {
        "30x45": "price_1TwkzX32satLY6UqPQvhSVUB",
        "40x60": "price_1TwkzY32satLY6Uqpm0zyFP7"
      },
      "audi-r8-yellow": {
        "30x45": "price_1Twkza32satLY6UqbajrPfgU",
        "40x60": "price_1Twkzb32satLY6UqKCIhszx9"
      },
      "audi-rs6": {
        "30x45": "price_1Twkzc32satLY6UqsGiYv4u5",
        "40x60": "price_1Twkzd32satLY6UqQah81JmF"
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
        "30x45": "price_1Twkzk32satLY6UqADbvCTeF",
        "40x60": "price_1Twkzl32satLY6UqtTqozd3B"
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
        "30x45": "price_1Twkzw32satLY6UqXCYdkhfa",
        "40x60": "price_1Twkzy32satLY6UqQKy6YQy3"
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
        "30x45": "price_1Twl0432satLY6UqYPYK2dEG",
        "40x60": "price_1Twl0532satLY6UqUDs4pHL6"
      },
      "bmw-m4-g82-01": {
        "30x45": "price_1Twl0632satLY6UqfxgBbr3n",
        "40x60": "price_1Twl0732satLY6UqP1yAbf5b"
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
        "30x45": "price_1Twl0F32satLY6UqI8iuZnz6",
        "40x60": "price_1Twl0G32satLY6Uqkt1mabZi"
      },
      "custom-led-car-wall-art": {
        "30x45": "price_1Twl0I32satLY6UqW8Pein0J",
        "40x60": "price_1Twl0J32satLY6UqhiZChXUl"
      },
      "dark-colour-audi": {
        "30x45": "price_1Twl0K32satLY6UqWwQetyvN",
        "40x60": "price_1Twl0L32satLY6UqlSbx2tqk"
      },
      "dodge-srt-hellcat-01": {
        "30x45": "price_1Twl0N32satLY6Uqe5EvZEmI",
        "40x60": "price_1Twl0O32satLY6UqzInE0zt6"
      },
      "ferrari-488": {
        "30x45": "price_1Twl0P32satLY6UqWcqYRqp6",
        "40x60": "price_1Twl0Q32satLY6UqJgMjtyxw"
      },
      "ferrari-f8": {
        "30x45": "price_1Twl0S32satLY6UqKobjnIEt",
        "40x60": "price_1Twl0T32satLY6UqyKgmmFzM"
      },
      "lambrghini-svj-tailights": {
        "30x45": "price_1Twl0U32satLY6Uqh7rzThfr",
        "40x60": "price_1Twl0V32satLY6UqHTukNeVW"
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
        "30x45": "price_1Twl0e32satLY6UqJ9dBa5O2",
        "40x60": "price_1Twl0f32satLY6UqXS81QjQr"
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
        "30x45": "price_1Twl0r32satLY6Uquf49YG5l",
        "40x60": "price_1Twl0s32satLY6UqYyZvrRSS"
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
