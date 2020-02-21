const fs = require('fs');
const crypto = require('crypto');
const { exec } = require('child_process');
const puppeteer = require('puppeteer');
const yargs = require('yargs');
const cliProgress = require('cli-progress');
// const loading =  require('loading-cli');
// const program = require('commander');

const iPhoneMobile = puppeteer.devices['iPhone X'];

const progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);

const { chromeConfig } = require('./config');
const {
  autoScroll,
  isAdsURL,
  writeOutputTerminal,
  createOutputDir,
  prettyFileAndLog,
} = require("./utils");
 
(async () => {

  let aURLs = [];

  const argv = yargs.command('jsfinder', 'Parse JS files for URLs and stuff', {
  }).option('url', {
    description: 'URL to be parsed',
    alias: 'u',
    type: 'string',
  }).option('output', {
    description: 'Output dir',
    alias: 'o',
    type: 'string',
  }).option('header', {
    description: 'Header',
    alias: 'H',
    type: 'array',
  }).option('browser', {
    description: 'Open browser',
    type: 'boolean',
  }).option('ads', {
    description: 'Allow blacklisted ads related URLs',
    type: 'boolean',
  }).option('insource', {
    description: 'Search for URLs in source',
    type: 'boolean',
  }).option('nocache', {
    description: 'Ingore cache when it already exists',
    type: 'boolean',
  }).option('mobile', {
    description: 'Emulate Mobile phone (iPhone X)',
    type: 'string',
    alias: 'm',
  }).option('vscode', {
    description: 'Open output dir with VSCode',
    type: 'boolean',
  }).option('noscroll', {
    description: 'Dont do autoscroll',
    type: 'boolean',
  }).help().alias('help', 'h').argv;

  // console.log(argv);

  if (!argv.url) {
    console.log('Error: required URL :: --url/-u <https://example.com>');
    return;
  }

  const browser = await puppeteer.launch({
    ...chromeConfig,
    headless: argv.browser ? false : true,
  });
  let page = null;
  [page] = await browser.pages();
  // const page = await browser.newPage();
  // await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.108 Safari/537.36');
  // await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10.14; rv:72.0) Gecko/20100101 Firefox/72.0');

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
    
    if (!argv.ads) {
      if (isAdsURL(url)) {
        return;
      }
    }
    const method = await res.request().method();
    const isDataUrl = url.indexOf('data');
    if (isDataUrl > -1) {
      return;
    }

    let filterType = await res.request().resourceType();
    if (['document', 'script', 'xhr'].indexOf(filterType) === -1) {
      return;
    }
    const status = await res.status();
    const statusText = await res.statusText();
    const reqHeaders = await res.request().headers();
    const resHeaders = { ...(await res.headers()) };
    const type = 'content-type' in resHeaders
          ? resHeaders['content-type'].split(';')[0]
          : null;
    if (filterType === 'document' && type && (type.indexOf('javascript') > -1 || type.indexOf('json') > -1)) {
      filterType = 'document_script';
    }
    let resBody = '';
    try {
      resBody = await res.text();
    } catch (ex) {
      resBody = null;
    }

    if (!resBody) {
      return;
    }
    
    const obj = {
      filterType,
      method,
      status,
      url,
      contentType: type,
      reqHeaders,
      resHeaders,
      body: resBody,
    };
    aURLs.push(obj);
    await writeOutputTerminal(obj);
  });
  
  let hasCache = false;
  const hashCache = crypto.createHash('md5').update(argv.url).digest('hex');
  const cacheFileName = `/tmp/jsfinder_cache_${hashCache}.json`;
  if (fs.existsSync('/tmp') && fs.existsSync(cacheFileName)) {
    hasCache = true;
    if (argv.nocache) {
      hasCache = false;
    }
  }

  if (!hasCache) {
    console.log('No cache... will open URL....');
    if (argv.mobile) {
      await page.emulate(iPhoneMobile);
    }
    await page.goto(argv.url, {waitUntil: 'networkidle2'});

    if (!argv.noscroll) {
      await autoScroll(page);
    }

    if (!argv.browser) {
      await browser.close();
    }
    console.log('Writing cache file...');
    fs.writeFileSync(cacheFileName, JSON.stringify(aURLs), 'utf8');
  } else {
    console.log('Warning :: Using cached data');
    const cachedJSON = fs.readFileSync(cacheFileName);
    aURLs = JSON.parse(cachedJSON);
  }

  if (argv.output) {
    console.log('Beautifying resources...');

    progressBar.start(aURLs.length, 0);
    await createOutputDir(argv.output);
    
    for (let i=0; i < aURLs.length; i++) {
      await prettyFileAndLog(argv.output, aURLs[i], argv.insource);
      await progressBar.increment();
    }

    progressBar.stop();

    if (argv.vscode) {
      exec(`code ${argv.output}`);
    }
  }
  console.log('Done.');
  if (!argv.browser) {
    process.exit(0);
  }
  // load({
  //   text: 'Beautifying found resources...',
  //   frames: ["◐", "◓", "◑", "◒"],
  // }).start();

  // console.log(aURLs);
})();
