import axios from 'axios';
import * as cheerio from 'cheerio';

const r = await axios.get('http://172.16.17.127/obd_cms/public/', {
  maxRedirects: 0,
  validateStatus: () => true,
});

const $ = cheerio.load(r.data);
console.log('FORM ACTION:', $('form').attr('action'));
console.log('FORM METHOD:', $('form').attr('method'));

const inputs = [];
$('input,select,button[type]').each((_, el) => {
  inputs.push({ tag: el.tagName, name: $(el).attr('name'), type: $(el).attr('type') });
});
console.log('FORM FIELDS:', JSON.stringify(inputs, null, 2));
console.log('\n--- Full form HTML ---');
console.log($('form').html()?.trim().slice(0, 2000));
