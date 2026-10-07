/**
 * Whole-order shipping notice.
 * Saving a new tracking number emails the customer once.
 * The same number is not sent again unless the admin asks to resend.
 */
const C = require('./email-components.js');
const Email = require('./email.js');

const STORE_URL = 'https://www.zybar.shop';
const STORE_NAME = 'ZYBAR';

const CARRIERS = [
  { id: 'dhl', label: 'DHL' },
  { id: 'fedex', label: 'FedEx' },
  { id: 'ups', label: 'UPS' },
  { id: 'usps', label: 'USPS' },
  { id: 'yunexpress', label: 'YunExpress' },
  { id: '4px', label: '4PX' },
  { id: 'other', label: 'Other' }
];

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function carrierById(id) {
  const key = String(id || '').trim().toLowerCase();
  for (let i = 0; i < CARRIERS.length; i++) {
    if (CARRIERS[i].id === key) return CARRIERS[i];
  }
  return null;
}

function trackingUrl(carrierId, trackingNumber) {
  const num = encodeURIComponent(String(trackingNumber || '').trim());
  if (!num) return '';
  switch (String(carrierId || '').toLowerCase()) {
    case 'dhl':
      return 'https://www.dhl.com/global-en/home/tracking.html?submit=1&tracking-id=' + num;
    case 'fedex':
      return 'https://www.fedex.com/fedextrack/?trknbr=' + num;
    case 'ups':
      return 'https://www.ups.com/track?tracknum=' + num;
    case 'usps':
      return 'https://tools.usps.com/go/TrackConfirmAction?tLabels=' + num;
    case 'yunexpress':
      return 'https://www.yuntrack.com/parcelTracking?id=' + num;
    case '4px':
      return 'https://track.4px.com/query/' + num;
    default:
      return '';
  }
}

function storeTrackUrl(email, trackingNumber) {
  return (
    STORE_URL +
    '/track-order.html?email=' +
    encodeURIComponent(String(email || '').trim()) +
    '&tracking=' +
    encodeURIComponent(String(trackingNumber || '').trim())
  );
}

function itemLines(order) {
  if (order && Array.isArray(order.line_items) && order.line_items.length) {
    return order.line_items.map(function (li) {
      const name = li.name || li.productSlug || li.slug || 'Item';
      const size = li.size ? ' · ' + li.size : '';
      const qty = li.quantity ? ' ×' + li.quantity : '';
      return name + size + qty;
    });
  }
  const slug = String((order && order.product_slug) || '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, function (c) {
      return c.toUpperCase();
    });
  if (!slug) return ['ZYBAR LED Wall Art'];
  return [slug + (order.size ? ' · ' + order.size : '') + (order.quantity > 1 ? ' ×' + order.quantity : '')];
}

function addressLines(order) {
  const lines = [];
  const street = String((order && order.shipping_address) || '').trim();
  if (street) lines.push(street);
  const cityLine = [order && order.city, order && order.state, order && order.postcode]
    .filter(function (part) {
      return part && String(part).trim();
    })
    .join(', ');
  if (cityLine) lines.push(cityLine);
  const country = String((order && order.country) || '').trim();
  if (country) lines.push(country);
  return lines;
}

function emailButton(href, label, solid) {
  const bg = solid ? '#161513' : '#f4f2ed';
  const color = solid ? '#f4f2ed' : '#161513';
  const border = solid ? '0' : '1px solid #161513';
  return (
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>' +
    '<td bgcolor="' +
    bg +
    '" style="border-radius:6px;background:' +
    bg +
    ';border:' +
    border +
    ';">' +
    '<a href="' +
    esc(href) +
    '" style="display:inline-block;padding:13px 18px;font-family:' +
    "'Helvetica Neue', Helvetica, Arial, sans-serif" +
    ';font-size:12px;line-height:1;letter-spacing:0.12em;text-transform:uppercase;color:' +
    color +
    ';font-weight:600;text-decoration:none;">' +
    esc(label) +
    '</a></td></tr></table>'
  );
}

function stepRow(stage) {
  const steps = [
    { label: 'Confirmed', on: true },
    { label: 'Shipped', on: stage === 'shipped' || stage === 'delivered' },
    { label: 'Delivered', on: stage === 'delivered' }
  ];
  return (
    '<tr><td class="px" style="padding:8px 36px 28px;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' +
    '<tr>' +
    steps
      .map(function (step, index) {
        const color = step.on ? '#f3f3f4' : '#5c5e66';
        return (
          '<td width="33%" valign="top" style="padding:0 8px 0 0;">' +
          '<div style="height:2px;background:' +
          (step.on ? '#f3f3f4' : '#2a2a30') +
          ';margin:0 0 10px;"></div>' +
          '<div style="font-family:' +
          "'Helvetica Neue', Helvetica, Arial, sans-serif" +
          ';font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:' +
          color +
          ';">' +
          (index + 1) +
          ' &nbsp;' +
          esc(step.label) +
          '</div></td>'
        );
      })
      .join('') +
    '</tr></table></td></tr>'
  );
}

function detailCard(label, bodyHtml) {
  return (
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#1a1a1e;border:1px solid #2a2a30;">' +
    '<tr><td style="padding:16px 18px;">' +
    '<div style="font-family:' +
    "'Helvetica Neue', Helvetica, Arial, sans-serif" +
    ';font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#a6a8b1;padding-bottom:8px;">' +
    esc(label) +
    '</div>' +
    '<div style="font-family:' +
    "'Helvetica Neue', Helvetica, Arial, sans-serif" +
    ';font-size:14px;line-height:1.55;color:#f3f3f4;">' +
    bodyHtml +
    '</div></td></tr></table>'
  );
}

function shipmentEmail(options) {
  const carrierLabel = (options.carrier && options.carrier.label) || '';
  const trackingNumber = String(options.trackingNumber || '').trim();
  const carrierHref = trackingUrl(options.carrier && options.carrier.id, trackingNumber);
  const pageHref = trackingNumber ? storeTrackUrl(options.order && options.order.customer_email, trackingNumber) : STORE_URL + '/track-order.html';
  const trackHref = carrierHref || pageHref;
  const trackLabel = carrierHref ? 'Track shipment' : 'View your order';
  const items = itemLines(options.order)
    .map(function (line) {
      return esc(line);
    })
    .join('<br/>');
  const address = addressLines(options.order)
    .map(function (line) {
      return esc(line);
    })
    .join('<br/>');
  const first = firstName(options.order);
  const intro = first ? 'Hi ' + esc(first) + '. ' + options.body : options.body;

  const sections = [
    C.Header.render({
      href: STORE_URL + '/',
      logoUrl: STORE_URL + '/Image/email/zybar-logo.png',
      alt: STORE_NAME,
      width: 132
    }),
    '<tr><td class="px" style="padding:8px 36px 6px;">' +
      '<div style="font-family:' +
      "'Helvetica Neue', Helvetica, Arial, sans-serif" +
      ';font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#a6a8b1;">' +
      esc(options.eyebrow) +
      '</div></td></tr>',
    '<tr><td class="px" style="padding:0 36px 12px;">' +
      '<div class="h1" style="font-family:Georgia, \'Times New Roman\', serif;font-size:34px;line-height:1.15;color:#f3f3f4;">' +
      esc(options.headline) +
      '</div></td></tr>',
    '<tr><td class="px" style="padding:0 36px 22px;">' +
      '<div style="font-family:' +
      "'Helvetica Neue', Helvetica, Arial, sans-serif" +
      ';font-size:15px;line-height:1.6;color:#a6a8b1;">' +
      intro +
      '</div></td></tr>',
    stepRow(options.stage)
  ];

  if (trackingNumber) {
    sections.push(
      '<tr><td class="px" style="padding:0 36px 18px;">' +
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4f2ed" style="background:#f4f2ed;">' +
        '<tr><td style="padding:22px 22px 18px;">' +
        '<div style="font-family:' +
        "'Helvetica Neue', Helvetica, Arial, sans-serif" +
        ';font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#8a8680;padding-bottom:8px;">Tracking number</div>' +
        '<div style="font-family:Georgia, \'Times New Roman\', serif;font-size:28px;line-height:1.2;color:#161513;padding-bottom:6px;">' +
        (trackHref
          ? '<a href="' + esc(trackHref) + '" style="color:#161513;text-decoration:underline;">' + esc(trackingNumber) + '</a>'
          : esc(trackingNumber)) +
        '</div>' +
        (carrierLabel
          ? '<div style="font-family:' +
            "'Helvetica Neue', Helvetica, Arial, sans-serif" +
            ';font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#5c5852;padding-bottom:16px;">' +
            esc(carrierLabel) +
            '</div>'
          : '<div style="padding-bottom:16px;"></div>') +
        '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>' +
        '<td valign="middle">' +
        emailButton(trackHref, trackLabel, true) +
        '</td>' +
        (carrierHref && pageHref
          ? '<td width="10"></td><td valign="middle">' + emailButton(pageHref, 'View your order', false) + '</td>'
          : '') +
        '</tr></table>' +
        (carrierHref
          ? '<div style="padding-top:12px;font-family:' +
            "'Helvetica Neue', Helvetica, Arial, sans-serif" +
            ';font-size:13px;line-height:1.5;color:#5c5852;">' +
            esc(carrierLabel || 'The carrier') +
            ' shows the latest location.</div>'
          : '') +
        '</td></tr></table></td></tr>'
    );
  }

  sections.push(
    '<tr><td class="px" style="padding:0 36px 28px;">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
      '<td class="stack" width="50%" valign="top" style="padding:0 8px 0 0;">' +
      detailCard('Items', items || 'ZYBAR LED Wall Art') +
      '</td>' +
      '<td class="stack" width="50%" valign="top" style="padding:0 0 0 8px;">' +
      detailCard(options.addressLabel, address || '—') +
      '</td></tr></table></td></tr>'
  );

  sections.push(
    C.Footer.render({
      identity: STORE_NAME + ' · Tokyo, Japan',
      reason: options.reason,
      contactHref: 'mailto:support@zybar.shop'
    })
  );

  return C.Shell.render({
    title: options.title,
    preheader: options.preheader,
    sections: sections
  });
}

function firstName(order) {
  const name = String((order && order.customer_name) || '').trim();
  return name ? name.split(' ')[0] : '';
}

function renderShippingEmail(order, carrier, trackingNumber) {
  const carrierLabel = (carrier && carrier.label) || 'your carrier';
  return {
    subject: 'Your ZYBAR order has shipped',
    html: shipmentEmail({
      order: order,
      carrier: carrier,
      trackingNumber: trackingNumber,
      stage: 'shipped',
      title: 'Your order has shipped',
      preheader: 'Tracking ' + String(trackingNumber || '') + ' · ' + carrierLabel,
      eyebrow: 'Shipment update',
      headline: 'Your order is on the way',
      body: 'Your piece has left the studio. The tracking details are below.',
      addressLabel: 'Ships to',
      reason: 'You are receiving this because your ZYBAR order has shipped.'
    })
  };
}

function renderDeliveredEmail(order, carrier, trackingNumber) {
  const carrierLabel = (carrier && carrier.label) || '';
  return {
    subject: 'Your ZYBAR order was delivered',
    html: shipmentEmail({
      order: order,
      carrier: carrier,
      trackingNumber: trackingNumber,
      stage: 'delivered',
      title: 'Your order was delivered',
      preheader: carrierLabel ? 'Delivered with ' + carrierLabel : 'Your order was delivered',
      eyebrow: 'Shipment update',
      headline: 'Your order was delivered',
      body: 'This piece should now be with you.',
      addressLabel: 'Delivered to',
      reason: 'You are receiving this because your ZYBAR order was delivered.'
    })
  };
}

function noticeFromRow(row) {
  if (!row) return null;
  const meta = row.metadata || {};
  return {
    created_at: row.created_at,
    tracking_number: meta.tracking_number || '',
    carrier: meta.carrier || '',
    fulfillment_status: meta.fulfillment_status || '',
    notified: !!meta.notified,
    message_id: meta.message_id || ''
  };
}

async function latestByType(supabase, orderId, eventType) {
  const result = await supabase
    .from('marketing_history')
    .select('created_at,metadata,message,event_type')
    .eq('event_type', eventType)
    .eq('reference_id', String(orderId))
    .order('created_at', { ascending: false })
    .limit(1);
  if (result.error) throw result.error;
  return noticeFromRow(result.data && result.data[0]);
}

async function latestNotice(supabase, orderId) {
  return latestByType(supabase, orderId, 'shipping_notice');
}

async function readCarrierColumn(supabase, orderId) {
  const result = await supabase.from('orders').select('tracking_carrier').eq('id', orderId).maybeSingle();
  if (result.error) return '';
  return String((result.data && result.data.tracking_carrier) || '');
}

async function shippingSummary(supabase, orderId) {
  const notice = await latestByType(supabase, orderId, 'shipping_notice');
  const delivery = await latestByType(supabase, orderId, 'delivery_notice');
  const update = await latestByType(supabase, orderId, 'fulfillment_update');
  const columnCarrier = await readCarrierColumn(supabase, orderId);
  const carrier = update
    ? update.carrier || ''
    : columnCarrier || (notice && notice.carrier) || (delivery && delivery.carrier) || '';
  return { carrier: carrier, notice: notice, delivery: delivery };
}

async function publicTracking(supabase, order) {
  let carrierId = String((order && order.tracking_carrier) || '');
  if (!carrierId && order && order.id) {
    try {
      const summary = await shippingSummary(supabase, order.id);
      carrierId = summary.carrier || '';
    } catch (err) {
      console.error('public tracking carrier:', err && err.message ? err.message : err);
    }
  }
  const carrier = carrierById(carrierId);
  const number = String((order && order.tracking_number) || '').trim();
  return {
    carrier: carrier ? carrier.label : '',
    carrierId: carrier ? carrier.id : '',
    trackingUrl: trackingUrl(carrier && carrier.id, number)
  };
}

async function recordHistory(supabase, order, eventType, message, meta) {
  const result = await supabase.from('marketing_history').insert({
    event_type: eventType,
    source: 'fulfillment',
    lead_email: order.customer_email || null,
    reference_id: String(order.id),
    message: message,
    metadata: meta
  });
  if (result.error) throw result.error;
}

async function saveOrder(supabase, orderId, patch) {
  let result = await supabase.from('orders').update(patch).eq('id', orderId).select('*').maybeSingle();
  if (result.error && /tracking_carrier|shipping_notified|column/i.test(String(result.error.message || ''))) {
    const basic = {
      tracking_number: patch.tracking_number,
      fulfillment_status: patch.fulfillment_status,
      internal_notes: patch.internal_notes
    };
    result = await supabase.from('orders').update(basic).eq('id', orderId).select('*').maybeSingle();
  }
  if (result.error) throw result.error;
  return result.data;
}

async function fulfillOrder(supabase, orderId, input, env, mailer) {
  input = input || {};
  const existing = await supabase.from('orders').select('*').eq('id', orderId).maybeSingle();
  if (existing.error) throw existing.error;
  if (!existing.data) {
    const err = new Error('Order not found');
    err.status = 404;
    throw err;
  }
  const order = existing.data;
  const tracking = String(input.tracking_number != null ? input.tracking_number : order.tracking_number || '').trim();
  const carrier = carrierById(input.tracking_carrier || input.carrier || order.tracking_carrier || '');
  let fulfillment = String(input.fulfillment_status || order.fulfillment_status || 'unfulfilled').trim();
  if (tracking && fulfillment === 'unfulfilled') fulfillment = 'shipped';
  const notes = input.internal_notes != null ? String(input.internal_notes) : order.internal_notes;
  const notify = input.notify !== false && input.notify !== 'false';
  const force = input.resend === true || input.resend === 'true';

  const previous = await latestNotice(supabase, order.id);
  const previousDelivery = await latestByType(supabase, order.id, 'delivery_notice');
  const alreadySent =
    previous &&
    previous.notified &&
    String(previous.tracking_number || '').toLowerCase() === tracking.toLowerCase();
  const alreadyDelivered = !!(previousDelivery && previousDelivery.notified);
  const sendEmail = typeof mailer === 'function' ? mailer : Email.sendEmail;

  const saved = await saveOrder(supabase, order.id, {
    tracking_number: tracking || null,
    tracking_carrier: carrier ? carrier.id : null,
    fulfillment_status: fulfillment,
    internal_notes: notes || null
  });

  try {
    await recordHistory(supabase, order, 'fulfillment_update', 'Fulfillment saved', {
      carrier: carrier ? carrier.id : '',
      tracking_number: tracking,
      fulfillment_status: fulfillment,
      notified: false
    });
  } catch (err) {
    console.error('fulfillment update history:', err && err.message ? err.message : err);
  }

  const carrierId = carrier ? carrier.id : '';
  let emailedTracking = alreadySent;

  async function stampNotified() {
    if (!tracking) return;
    try {
      await saveOrder(supabase, order.id, {
        tracking_number: tracking || null,
        tracking_carrier: carrierId || null,
        fulfillment_status: fulfillment,
        internal_notes: notes || null,
        shipping_notified_tracking: tracking,
        shipping_notified_at: new Date().toISOString()
      });
    } catch (err) {
      console.error('shipping notice stamp:', err && err.message ? err.message : err);
    }
  }

  async function rememberNotice(eventType, message, messageId) {
    await recordHistory(supabase, order, eventType, message, {
      notified: true,
      tracking_number: tracking,
      carrier: carrierId,
      message_id: messageId || ''
    });
  }

  async function sendNotice(eventType, message, rendered) {
    const sent = await sendEmail({
      to: order.customer_email,
      subject: rendered.subject,
      html: rendered.html,
      env: env
    });
    if (!sent.ok) {
      return {
        sent: false,
        skipped: false,
        kind: eventType,
        reason: 'Saved, but the email failed: ' + (sent.error || 'Failed to send email')
      };
    }
    const result = {
      sent: true,
      skipped: false,
      kind: eventType,
      reason:
        (eventType === 'delivery_notice' ? 'Delivery email sent to ' : 'Shipping email sent to ') +
        order.customer_email +
        '.',
      message_id: sent.data && sent.data.id
    };
    try {
      await rememberNotice(eventType, message, result.message_id);
      if (tracking) {
        emailedTracking = true;
        await stampNotified();
      }
    } catch (err) {
      result.reason += ' The send record failed, so saving again may email this once more.';
      console.error('shipping notice history:', err && err.message ? err.message : err);
    }
    return result;
  }

  let email = { sent: false, skipped: true, reason: '' };
  if (!notify) {
    email.reason = 'Saved without emailing the customer.';
  } else if (!order.customer_email) {
    email.reason = 'Saved. This order has no customer email.';
  } else if (fulfillment === 'cancelled') {
    email.reason = 'Saved. Cancelled orders are not emailed.';
  } else if (fulfillment === 'delivered') {
    const trackingIsNew = !!(tracking && !emailedTracking);
    if (force || !alreadyDelivered) {
      email = await sendNotice(
        'delivery_notice',
        'Delivery notice sent',
        renderDeliveredEmail(order, carrier, tracking)
      );
      if (email.sent && tracking && !alreadySent) {
        try {
          await rememberNotice('shipping_notice', 'Tracking included in delivery email', email.message_id);
          emailedTracking = true;
        } catch (err) {
          console.error('delivery tracking record:', err && err.message ? err.message : err);
        }
      }
    } else if (trackingIsNew) {
      email = await sendNotice(
        'shipping_notice',
        'Shipping notice sent',
        renderShippingEmail(order, carrier, tracking)
      );
    } else {
      email.reason = 'Saved. Delivery email was already sent.';
    }
  } else if (!tracking) {
    email.reason = 'Saved. Add a tracking number to email the customer.';
  } else if (alreadySent && !force) {
    email.reason = 'Saved. Already emailed this tracking number.';
  } else {
    email = await sendNotice(
      'shipping_notice',
      'Shipping notice sent',
      renderShippingEmail(order, carrier, tracking)
    );
  }

  return {
    order: saved || Object.assign({}, order, {
      tracking_number: tracking,
      fulfillment_status: fulfillment,
      tracking_carrier: carrierId || null
    }),
    email: email,
    carrier: carrierId,
    notice: emailedTracking
      ? { tracking_number: tracking, carrier: carrierId, notified: true, created_at: new Date().toISOString() }
      : previous,
    delivery: email.kind === 'delivery_notice' && email.sent
      ? { tracking_number: tracking, carrier: carrierId, notified: true, created_at: new Date().toISOString() }
      : previousDelivery
  };
}

module.exports = {
  CARRIERS,
  carrierById,
  trackingUrl,
  storeTrackUrl,
  renderShippingEmail,
  renderDeliveredEmail,
  latestNotice,
  shippingSummary,
  publicTracking,
  fulfillOrder
};
