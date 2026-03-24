/**
 * ZYBAR.MY – 100% virtual data for testing environment.
 * No database connection. Use when ?env=zybar.my
 */
(function () {
  'use strict';

  var now = new Date();
  var days30 = [];
  for (var i = 29; i >= 0; i--) {
    var d = new Date(now);
    d.setDate(d.getDate() - i);
    days30.push(d.toISOString().slice(0, 10));
  }

  function dayOfWeek(isoStr) {
    var d = new Date(isoStr);
    return d.getDay();
  }

  function weekendBoost(isoStr, base, weekendMult) {
    var dow = dayOfWeek(isoStr);
    var isWeekend = dow === 0 || dow === 6;
    return Math.round(base * (isWeekend ? weekendMult : 1));
  }

  var sessionsCurr = [];
  var ordersCurr = [];
  for (var j = 0; j < 30; j++) {
    var day = days30[j];
    var s = weekendBoost(day, 48 + Math.floor(Math.random() * 8), 1.35);
    sessionsCurr.push(s);
    var ord = weekendBoost(day, 1, 2.2) + (Math.random() < 0.4 ? 1 : 0);
    ordersCurr.push(Math.min(Math.max(0, ord), 4));
  }
  var totalSessions = 1527;
  var totalOrders = 50;
  var totalSalesRM = 2357.80;
  var conversionPct = 3.3;
  var scaleS = totalSessions / sessionsCurr.reduce(function (a, b) { return a + b; }, 0);
  var scaleO = totalOrders / ordersCurr.reduce(function (a, b) { return a + b; }, 0);
  sessionsCurr = sessionsCurr.map(function (v) { return Math.round(v * scaleS); });
  ordersCurr = ordersCurr.map(function (v) { return Math.round(v * scaleO); });
  var sumO = ordersCurr.reduce(function (a, b) { return a + b; }, 0);
  if (sumO !== totalOrders) { ordersCurr[0] += (totalOrders - sumO); }
  var salesCurr = [];
  for (var jj = 0; jj < 30; jj++) {
    var o = ordersCurr[jj] || 0;
    salesCurr.push(o * (totalSalesRM / totalOrders) + (Math.random() - 0.5) * 20);
  }
  var adj = totalSalesRM - salesCurr.reduce(function (a, b) { return a + b; }, 0);
  salesCurr[0] = (salesCurr[0] || 0) + adj;
  salesCurr = salesCurr.map(function (v) { return Math.round(Math.max(0, v) * 100) / 100; });

  var prevSessions = [];
  var prevSales = [];
  var prevOrders = [];
  for (var p = 0; p < 30; p++) {
    var pd = new Date(now);
    pd.setDate(pd.getDate() - 30 - p);
    var pIso = pd.toISOString().slice(0, 10);
    prevSessions.push(weekendBoost(pIso, 42 + Math.floor(Math.random() * 6), 1.25));
    prevOrders.push(Math.max(0, weekendBoost(pIso, 1, 1.8) - (Math.random() < 0.5 ? 1 : 0)));
    prevSales.push(prevOrders[p] * (220 + Math.random() * 60));
  }

  window.MOCK_DATA = {
    dashboard: {
      labels: days30,
      sessionsTotal: totalSessions,
      ordersTotal: totalOrders,
      salesTotalRM: totalSalesRM,
      conversionPct: conversionPct,
      sessionsCurr: sessionsCurr,
      sessionsPrev: prevSessions,
      salesCurr: salesCurr,
      salesPrev: prevSales,
      ordersCurr: ordersCurr,
      ordersPrev: prevOrders,
      convCurr: sessionsCurr.map(function (s, i) { return s > 0 ? (ordersCurr[i] / s * 100) : 0; }),
      convPrev: prevSessions.map(function (s, i) { return s > 0 ? (prevOrders[i] / s * 100) : 0; }),
      liveVisitors: 3 + Math.floor(Math.random() * 5),
      topPages: [
        { page_url: '/', count: 520 },
        { page_url: '/collections/all/', count: 380 },
        { page_url: '/products/audi-r8-white/', count: 145 },
        { page_url: '/products/b-ferrari-f40/', count: 98 },
        { page_url: '/products/audi-rs6/', count: 87 }
      ],
      topProducts: [
        { product_id: 'audi-r8-white', count: 145 },
        { product_id: 'b-ferrari-f40', count: 98 },
        { product_id: 'audi-rs6', count: 87 },
        { product_id: 'audi-r8-gt3', count: 76 },
        { product_id: 'b-maserati-mc20', count: 62 }
      ]
    }
  };

  var malaysianFirst = ['Ahmad', 'Siti', 'Muhammad', 'Nurul', 'Abdul', 'Fatimah', 'Lee', 'Wei', 'Raj', 'Priya', 'Kumar', 'Siti', 'Hassan', 'Aisha', 'Lim', 'Mei', 'Tan', 'Jia', 'Wong', 'Yee', 'Ibrahim', 'Nur', 'Omar', 'Zara', 'Khalid', 'Amira', 'Rahman', 'Sara', 'Ng', 'Ling', 'Chong', 'Hui', 'Goh', 'Pei', 'Lau', 'Min', 'Teo', 'Xin', 'Yusof', 'Diana', 'Zainal', 'Lina'];
  var malaysianLast = ['bin Abdullah', 'binti Hassan', 'bin Ibrahim', 'binti Ali', 'bin Ahmad', 'binti Omar', 'Chen', 'Raja', 'Kaur', 'Singh', 'Kamaruddin', 'Rahman', 'Salleh', 'Ismail', 'Halim', 'Zainal', 'Wong', 'Lim', 'Tan', 'Ng', 'Teh', 'Gan', 'Foo', 'Chua', 'Ooi', 'Loh', 'Tee', 'Pang', 'Koh', 'Yap'];
  var products = ['Audi R8 – White', 'Audi R8 – Yellow', 'Audi R8 GT3', 'Audi RS6', 'B Dodge Hellcat 02', 'B Dodge Hellcat 03', 'B Ferrari F40', 'B Maserati MC20'];
  var sizes = ['30x45', '40x60'];
  var statuses = ['Processing', 'In Transit', 'Delivered'];
  var cities = [
    { city: 'Mantin', state: 'Negeri Sembilan', postcode: '71700' },
    { city: 'Seremban', state: 'Negeri Sembilan', postcode: '70100' },
    { city: 'Kuala Lumpur', state: 'Wilayah Persekutuan', postcode: '50000' },
    { city: 'Petaling Jaya', state: 'Selangor', postcode: '46000' },
    { city: 'Shah Alam', state: 'Selangor', postcode: '40000' },
    { city: 'Johor Bahru', state: 'Johor', postcode: '80000' },
    { city: 'George Town', state: 'Pulau Pinang', postcode: '10000' },
    { city: 'Ipoh', state: 'Perak', postcode: '30000' },
    { city: 'Kota Kinabalu', state: 'Sabah', postcode: '88000' },
    { city: 'Kuching', state: 'Sarawak', postcode: '93000' }
  ];
  var streets = ['Jalan Merdeka', 'Jalan Sultan Ismail', 'Jalan Bukit Bintang', 'Lorong Ara', 'Persiaran Raja Muda', 'Jalan Mantin', 'Jalan Seremban', 'Jalan Ampang', 'Jalan Tun Razak', 'Jalan Imbi', 'Jalan Pudu', 'Jalan Semantan', 'Jalan Duta', 'Jalan Kuching', 'Jalan Klang Lama'];

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function randBetween(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

  var customers = [];
  for (var c = 0; c < 50; c++) {
    var first = pick(malaysianFirst);
    var last = pick(malaysianLast);
    var name = first + ' ' + last;
    var cityData = pick(cities);
    var streetNum = randBetween(1, 99);
    var addr = streetNum + ', ' + pick(streets) + ', ' + cityData.city + ', ' + cityData.state + ' ' + cityData.postcode + ', Malaysia';
    var daysAgo = randBetween(0, 60);
    var orderDate = new Date(now);
    orderDate.setDate(orderDate.getDate() - daysAgo);
    var orderDateStr = orderDate.toISOString().slice(0, 10);
    var amt = (200 + Math.random() * 150).toFixed(2);
    var status = pick(statuses);
    customers.push({
      id: 'my-' + (c + 1),
      client_name: name,
      email: first.toLowerCase().replace(/\s/g, '') + '.' + last.toLowerCase().split(' ')[0] + '@example.my',
      phone: '+60 1' + randBetween(2, 9) + ' ' + randBetween(100, 999) + ' ' + randBetween(1000, 9999),
      product_bought: pick(products) + ' [' + pick(sizes) + ']',
      amount_paid_usd: parseFloat(amt),
      shipping_address: addr,
      order_date: orderDateStr,
      status: status,
      receipt_url: '/receipt.html'
    });
  }
  customers.sort(function (a, b) { return b.order_date.localeCompare(a.order_date); });
  window.MOCK_DATA.customers = customers;
})();
