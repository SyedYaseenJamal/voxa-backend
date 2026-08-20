/**
 * Diagnostic script — run with:
 *   node src/modules/ivr-campaigns/diagnose-obd-login.mjs
 *
 * Shows exactly what the OBD CMS server sends back during login
 * so we can see where the ci_session cookie really lives.
 */

import axios from 'axios';
import FormData from 'form-data';
import dotenv from 'dotenv';
dotenv.config();

const BASE = (process.env.OBD_BASE_URL || 'http://172.16.17.127/obd_cms/public').replace(/\/$/, '');
const USER = process.env.OBD_USERNAME || 'admin';
const PASS = process.env.OBD_PASSWORD || 'admin123';

console.log('=== OBD CMS Login Diagnostic ===');
console.log('BASE:', BASE);
console.log('USER:', USER);
console.log('');

// ── Step 1: GET / (preflight) ─────────────────────────────────────────────────
console.log('--- STEP 1: GET / (preflight) ---');
try {
  const r = await axios.get(`${BASE}/`, {
    maxRedirects: 0,
    validateStatus: () => true,
    timeout: 10000,
  });
  console.log('Status:', r.status);
  console.log('Set-Cookie:', r.headers['set-cookie'] ?? '(none)');
  console.log('Location:', r.headers['location'] ?? '(none)');
} catch (e) {
  console.error('GET / error:', e.message);
}

console.log('');

// ── Step 2: GET / following redirects ─────────────────────────────────────────
console.log('--- STEP 2: GET / (follow redirects) ---');
try {
  const r = await axios.get(`${BASE}/`, {
    maxRedirects: 5,
    validateStatus: () => true,
    timeout: 10000,
  });
  console.log('Final Status:', r.status);
  console.log('Set-Cookie:', r.headers['set-cookie'] ?? '(none)');
  const html = r.data?.toString?.() ?? '';
  console.log('Has login form:', html.includes('name="username"'));
  console.log('HTML snippet (first 300 chars):', html.slice(0, 300).replace(/\n/g, ' '));
} catch (e) {
  console.error('GET / (follow) error:', e.message);
}

console.log('');

// ── Step 3: POST login, no redirects ─────────────────────────────────────────
console.log('--- STEP 3: POST login (no redirects) ---');
try {
  const form = new FormData();
  form.append('username', USER);
  form.append('password', PASS);

  const r = await axios.post(`${BASE}/`, form, {
    headers: form.getHeaders(),
    maxRedirects: 0,
    validateStatus: () => true,
    timeout: 10000,
  });
  console.log('Status:', r.status);
  console.log('Set-Cookie:', r.headers['set-cookie'] ?? '(none)');
  console.log('Location:', r.headers['location'] ?? '(none)');
  console.log('All response headers:', JSON.stringify(r.headers, null, 2));
} catch (e) {
  console.error('POST login error:', e.message);
  if (e.response) {
    console.log('Response status:', e.response.status);
    console.log('Response headers:', e.response.headers);
  }
}

console.log('');
console.log('=== Diagnostic complete ===');
