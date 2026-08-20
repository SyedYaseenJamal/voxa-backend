import axios from 'axios';
import * as cheerio from 'cheerio';
import { getCampaignDetail } from './obdCms.service.js';

async function fetchAndParse() {
  const result = await getCampaignDetail(12);
  console.log('Campaign Name:', result.campaignName);
  console.log('--- HTML Snippet ---');
  console.log(result.rawHtml);
}
fetchAndParse();
