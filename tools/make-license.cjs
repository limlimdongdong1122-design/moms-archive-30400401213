#!/usr/bin/env node
/* ============================================================
 * IMPULSE VAULT — license key generator
 * ------------------------------------------------------------
 * Mints a PayPal-issued Pro key, HMAC-signed with YOUR secret.
 * The Cloudflare Worker (_worker.js) verifies keys with the SAME
 * secret, so set LICENSE_SECRET to an identical value in both places.
 *
 * Usage:
 *   IV_LICENSE_SECRET="your-long-secret" node tools/make-license.cjs --year
 *   IV_LICENSE_SECRET="..."              node tools/make-license.cjs --month
 *   IV_LICENSE_SECRET="..."              node tools/make-license.cjs --days 365
 *   IV_LICENSE_SECRET="..."              node tools/make-license.cjs --lifetime
 *
 * Then email the printed key to the buyer. They paste it into the
 * dashboard → Pro Membership → Activate.
 *
 * Key format:  IVP-<expB36>-<nonce>-<sig>   (matches _worker.js)
 * ============================================================ */
'use strict';
const crypto = require('crypto');

const secret = process.env.IV_LICENSE_SECRET || '';
if (!secret) {
  console.error('✗ Set IV_LICENSE_SECRET (the same value as the Worker\'s LICENSE_SECRET).');
  process.exit(1);
}

// ---- parse duration ----
const args = process.argv.slice(2);
let days = 0; // 0 = lifetime
if (args.includes('--lifetime')) days = 0;
else if (args.includes('--year')) days = 365;
else if (args.includes('--month')) days = 31;
else {
  const i = args.indexOf('--days');
  if (i !== -1 && args[i + 1]) days = parseInt(args[i + 1], 10) || 0;
  else { days = 365; } // sensible default: 1 year
}

const exp = days > 0 ? Math.floor(Date.now() / 1000) + days * 86400 : 0;
const expB36 = exp.toString(36);
const nonce = crypto.randomBytes(5).toString('hex').slice(0, 8).replace(/[^0-9a-z]/g, '0');
const sig = crypto.createHmac('sha256', secret).update(`${expB36}.${nonce}`).digest('hex').slice(0, 20);
const key = `IVP-${expB36}-${nonce}-${sig}`;

const when = exp ? new Date(exp * 1000).toISOString().slice(0, 10) : 'never (lifetime)';
console.log('');
console.log('  License key:  ' + key);
console.log('  Expires:      ' + when);
console.log('');
