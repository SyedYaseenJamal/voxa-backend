import dotenv from 'dotenv';
dotenv.config();

import { login, getCampaigns } from './obdCms.service.js';

console.log('=== OBD CMS End-to-End Test ===\n');

try {
  await login();
  console.log('✅ Login OK\n');

  const campaigns = await getCampaigns();
  console.log(`✅ getCampaigns returned ${campaigns.length} rows`);
  console.log(JSON.stringify(campaigns.slice(0, 3), null, 2));
} catch (err) {
  console.error('❌ Error:', err.message);
}
