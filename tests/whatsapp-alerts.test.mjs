import assert from 'node:assert/strict';
import {test} from 'node:test';
import {message} from '../scripts/whatsapp.mjs';

test('order alert message: customer, items, money, address, dashboard link', () => {
  const m = message({business: '52 Alive', dashboard: 'https://nowora.vercel.app/client/52-alive', fields: [
    ['Order ID', '52A-3ac6011a'], ['Name', 'Riya Sharma'], ['Phone', '+91 98765 43210'], ['Address', 'Flat 4, Rajpur Road'], ['City', 'Dehradun'], ['State', 'Uttarakhand'],
    ['PIN code', '248001'], ['Payment', 'Cash on Delivery'], ['Note', 'Gift wrap'], ['Items', '1 × Zip Hoodie · Stone Beige · L — ₹1,299\n2 × Sweatpants · Grey Marl · M — ₹1,998'], ['Total', '₹3,297']]});
  for (const s of ['*New order — 52 Alive*', '*Order ID:* 52A-3ac6011a', '*Name:* Riya Sharma', '*Phone:* +91 98765 43210', '• 1 × Zip Hoodie', '• 2 × Sweatpants',
    '*Total:* ₹3,297', '*Payment:* Cash on Delivery', '*Address:* Flat 4, Rajpur Road, Dehradun, Uttarakhand, 248001', '*Note:* Gift wrap', 'client/52-alive']) assert.ok(m.includes(s), s);
});

test('works for any client form, whatever its fields', () => {
  const m = message({business: 'Brew & Bloom', fields: [['Customer', 'Sana'], ['WhatsApp', '+91 90000 00000'], ['Items', '2 × Cold coffee — ₹360'], ['Total', '₹360'], ['Table', '4']]});
  assert.ok(m.includes('*Customer:* Sana') && m.includes('*Table:* 4') && m.includes('• 2 × Cold coffee'));
});

import {customerMessage} from '../scripts/whatsapp.mjs';
test('customer gets their order ID and tracking link, only when both number and link are there', () => {
  const o = {business: '52 Alive', to: '9368986368', ts: new Date().toISOString(), fields: [['Order ID', '52A-3ac6011a'], ['Name', 'Riya Sharma'], ['Phone', '+91 98765 43210'],
    ['Tracking link', 'https://52-alive.pages.dev/track/?id=52A-3ac6011a'], ['Total', '₹3,297']]};
  const c = customerMessage(o);
  assert.equal(c.to, '919876543210');
  for (const s of ['Hi Riya!', '*52 Alive*', '52A-3ac6011a', 'https://52-alive.pages.dev/track/?id=52A-3ac6011a', 'https://wa.me/919368986368', 'AWB']) assert.ok(c.text.includes(s), s);
  assert.equal(customerMessage({...o, fields: o.fields.filter(([k]) => k !== 'Tracking link')}), null);
  assert.equal(customerMessage({...o, fields: o.fields.filter(([k]) => k !== 'Phone')}), null);
  assert.equal(customerMessage({...o, fields: o.fields.map(([k, v]) => k === 'Phone' ? [k, '12345'] : [k, v])}), null);
  assert.equal(customerMessage({...o, ts: new Date(Date.now() - 2 * 864e5).toISOString()}), null);
});
