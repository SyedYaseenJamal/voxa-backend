import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';

const BASE_URL = 'http://172.16.17.127/obd_cms/public';

async function test() {
  try {
    const getResp = await axios.get(BASE_URL + '/', { maxRedirects: 0, validateStatus: () => true });
    const cookie = getResp.headers['set-cookie'].find(c => c.includes('ci_session='));
    const initialCookie = cookie.split(';')[0];
    
    const loginForm = new URLSearchParams();
    loginForm.append('username', 'admin');
    loginForm.append('password', 'admin123');
    const authResp = await axios.post(BASE_URL + '/authenticate', loginForm, {
      headers: { Cookie: initialCookie },
      maxRedirects: 0,
      validateStatus: () => true
    });
    
    let sessionCookie = initialCookie;
    if (authResp.headers['set-cookie']) {
      const c = authResp.headers['set-cookie'].find(c => c.includes('ci_session='));
      if (c) sessionCookie = c.split(';')[0];
    }
    
    const form = new FormData();
    // we don't have a file, let's create a dummy text file to simulate wav
    fs.writeFileSync('dummy.wav', 'RIFF....WAVE');
    form.append('audio', fs.createReadStream('dummy.wav'));
    
    const postPage = await axios.post(BASE_URL + '/audio/store', form, {
      headers: { ...form.getHeaders(), Cookie: sessionCookie },
      maxRedirects: 0,
      validateStatus: () => true,
    });
    console.log('POST /audio/store STATUS:', postPage.status);
    console.log('Location header:', postPage.headers['location']);
  } catch (err) {
    console.error(err);
  }
}

test();
