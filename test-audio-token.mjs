import axios from 'axios';
import * as cheerio from 'cheerio';
import obdService from './src/modules/ivr-campaigns/obdCms.service.js';

const BASE_URL = 'http://172.16.17.127/obd_cms/public';

async function test() {
  try {
    // The service might not export sessionCookie directly if we don't expose it, 
    // but looking at obdCms.service.js, it's a module level let variable.
    // We'll just manually login.
    const getResp = await axios.get(BASE_URL + '/', { maxRedirects: 0, validateStatus: () => true });
    const cookie = getResp.headers['set-cookie'].find(c => c.includes('ci_session='));
    const initialCookie = cookie.split(';')[0];
    
    const form = new URLSearchParams();
    form.append('username', 'admin');
    form.append('password', 'admin123');
    const authResp = await axios.post(BASE_URL + '/authenticate', form, {
      headers: { Cookie: initialCookie },
      maxRedirects: 0,
      validateStatus: () => true
    });
    
    let sessionCookie = initialCookie;
    if (authResp.headers['set-cookie']) {
      const c = authResp.headers['set-cookie'].find(c => c.includes('ci_session='));
      if (c) sessionCookie = c.split(';')[0];
    }
    
    console.log('Got cookie:', sessionCookie);

    const getPage = await axios.get(BASE_URL + '/audio/upload', {
      headers: { Cookie: sessionCookie },
      validateStatus: () => true,
    });
    console.log('STATUS:', getPage.status);
    const html = getPage.data;
    
    const $ = cheerio.load(html);
    const formToken = $('input[name="_token"]').val();
    console.log('Cheerio token:', formToken);
    
    const metaToken = $('meta[name="csrf-token"]').attr('content');
    console.log('Meta CSRF token:', metaToken);
    
    const forms = $('form').length;
    console.log('Forms found on page:', forms);
    
    $('form').each((i, el) => {
      console.log(`Form ${i} action:`, $(el).attr('action'));
      $(el).find('input').each((j, input) => {
        console.log(`  Input ${j} name:`, $(input).attr('name'), 'type:', $(input).attr('type'));
      });
    });
  } catch (err) {
    console.error(err);
  }
}

test();
