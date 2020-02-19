
const puppeteer = require('puppeteer');
const yargs = require('yargs');
// const program = require('commander');

const beautify = require('js-beautify');

const { autoScroll, isAdsURL } = require('./utils');
 
(async () => {

  const aURLs = [];

  const argv = yargs.command('jsfinder', 'Parse JS files for URLs and stuff', {
    // url: {
    //   description: 'URL to be parsed',
    //   alias: 'u',
    //   type: 'string',
    // }
  }).option('url', {
    description: 'URL to be parsed',
    alias: 'u',
    type: 'string',
  }).option('header', {
    description: 'Header',
    alias: 'H',
    type: 'array',
  }).option('browser', {
    description: 'Open browser',
    type: 'boolean',
  }).option('output', {
    description: 'Output dir',
    alias: 'o',
    type: 'string',
  }).help().alias('help', 'h').argv;

  console.log(argv);

  if (!argv.url) {
    console.log('Error: required URL :: --url/-u <https://example.com>');
    return;
  }

  // return;

  const browser = await puppeteer.launch({
    headless: argv.browser ? false : true,
    devtools: false,
    ignoreHTTPSErrors: true,
    defaultViewport: null,
    // defaultViewport: {
    //   width: 1280,
    //   height: 800
    // },
    args: [
      '--disable-xss-auditor',
      '--ignore-certificate-errors',
      '--allow-running-insecure-content',
      '--disable-web-security',
      '--disable-resize-lock',
      '--window-size=1280,800',
      '--no-sandbox'
    ]
  });
  let page = null;
  [page] = await browser.pages();
  // const page = await browser.newPage();

  await page.setRequestInterception(true);

  page.on('close', async () => {
    console.log('PAGE CLOSES');
    await browser.close();
  });
  page.on('request', req => {
    req.continue();
  });
  page.on('response', async res => {
    const url = await res.url();
    
    if (isAdsURL(url)) {
      return;
    }
    const method = await res.request().method();
    const isDataUrl = url.indexOf('data');
    if (isDataUrl > -1) {
      return;
    }

    const filterType = await res.request().resourceType();
    // console.log(filterType)
    if (['document', 'script', 'xhr'].indexOf(filterType) === -1) {
      return;
    }
    const status = await res.status();
    const statusText = await res.statusText();
    const resHeaders = { ...(await res.headers()) };
    const type = 'content-type' in resHeaders
          ? resHeaders['content-type'].split(';')[0]
          : null;
    let resBody = '';
    try {
      resBody = await res.text();
    } catch (ex) {
      resBody = null;
    }

    if (!resBody) {
      return;
    }

    let bodyIndent = '';
    if (filterType === 'document') {
      bodyIndent = beautify.html(resBody, { indent_size: 2 });
    } else if (filterType === 'script') {
      bodyIndent = beautify.js(resBody, { indent_size: 2 });
    } else if (filterType === 'xhr') {
      if (type.indexOf('json') > -1 || type.indexOf('javascript') > -1) {
        bodyIndent = beautify.js(resBody, { indent_size: 2 });
      } else if (type.indexOf('html')) {
        bodyIndent = beautify.html(resBody, { indent_size: 2 });
      } else {
        bodyIndent = resBody;
      }
    }

    aURLs.push({
      filterType,
      method,
      status,
      url,
      // body: bodyIndent,
    });

    // console.log('#################################');
    // console.log('--------------------------------');
    // console.log(url);
    // console.log('--------------------------------');
    // console.log(filterType);
  });
  // const browser = await puppeteer.launch();
  // const page = await browser.newPage();
  // await page.goto('https://example.com');
 
  // await browser.close();
  await page.goto(argv.url, {waitUntil: 'networkidle2'});

  await autoScroll(page);

  await browser.close();

  console.log(aURLs);
})();
