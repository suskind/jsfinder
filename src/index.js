const fs = require('fs');
const crypto = require('crypto');
const { exec } = require('child_process');
const puppeteer = require('puppeteer');
const yargs = require('yargs');
const cliProgress = require('cli-progress');
const marked = require('marked');

const iPhoneMobile = puppeteer.devices['iPhone X'];

const progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);

const { chromeConfig, reMatchPaths } = require('./config');
const {
  setRequestHeaders,
  autoScroll,
  isAdsURL,
  writeOutputTerminal,
  createOutputDir,
  prettyFileAndLog,
  setRequestCookies,
} = require("./utils");
 
(async () => {

  let aURLs = [];

  const argv = yargs.command('jsfinder', 'Parse JS files for paths and stuff. ex:\n$ jsfinder -u https//example.com -o /tmp/out --insource ', {
  }).option('url', {
    description: 'URL to be parsed. ex: -u https://example.com ',
    alias: 'u',
    type: 'string',
  }).option('output', {
    description: 'Output dir. ex: -o /tmp/out ',
    alias: 'o',
    type: 'string',
  }).option('header', {
    description: 'Header',
    alias: 'H',
    type: 'array',
  }).option('regexp', {
    description: 'RegExp to Match (default: relative paths)\nex: --insource -r \'(secret|pass).*\'',
    alias: 'r',
    type: 'string',
  }).option('logsufix', {
    description: 'Log file sufix name.\nex: "-o /tmp/out -r pass -s secret" will create /tmp/out/index_secret.md',
    alias: 's',
    type: 'string',
  }).option('browser', {
    description: 'Open chromium browser',
    type: 'boolean',
  }).option('ads', {
    description: 'Allow blacklisted ads related URLs',
    type: 'boolean',
  }).option('insource', {
    description: 'Search for paths in source',
    type: 'boolean',
  }).option('nocache', {
    description: 'Ignore previous cached requests',
    type: 'boolean',
  }).option('mobile', {
    description: 'Emulate Mobile phone (iPhone X)',
    type: 'string',
    alias: 'm',
  }).option('vscode', {
    description: 'Open output dir with VSCode.\nex: "-o /tmp/out --vscode" will exec "code /tmp/out"',
    type: 'boolean',
  }).option('noscroll', {
    description: 'Force to don\'t do autoscroll',
    type: 'boolean',
  }).help().alias('help', 'h').argv;

  // console.log(argv);

  if (!argv.url) {
    console.log('Error: required URL :: --url/-u <https://example.com> <options: check -h>');
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
    await browser.close();
  });
  let mainHostName = null;
  page.on('request', async req => {
    const url = await req.url();
    const oURL = new URL(url);
    const curHostName = oURL.hostname;
    if (req.isNavigationRequest()) {
      mainHostName = curHostName;
    }
    if (curHostName === mainHostName) {
      const reqHeaders = await req.headers();
      if (argv.header && argv.header.length) {
        const newHeaders = await setRequestHeaders(reqHeaders, argv.header);
        if (newHeaders) {
          req.continue({headers: newHeaders});
          return;
        }
      }
    }
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
  
  const aCookies = await setRequestCookies(argv.url, argv.header);
  if (aCookies) {
    await page.setCookie(...aCookies);
  }

  let hasCache = false;
  const hashCache = crypto.createHash('md5').update(argv.url).digest('hex');
  const cacheFileName = `/tmp/jsfindercache/jsfinder_cache_${hashCache}.json`;
  if (fs.existsSync('/tmp') && fs.existsSync('/tmp/jsfindercache') && fs.existsSync(cacheFileName)) {
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
    await createOutputDir('/tmp/jsfindercache');
    fs.writeFileSync(cacheFileName, JSON.stringify(aURLs), 'utf8');
  } else {
    console.log('Warning :: Using cached data');
    const cachedJSON = fs.readFileSync(cacheFileName);
    aURLs = JSON.parse(cachedJSON);
  }

  console.log(`Got ${aURLs.length} files...`);

  if (argv.output) {
    console.log('Beautifying resources...');

    progressBar.start(aURLs.length, 0);

    await createOutputDir(argv.output);

    // RegExp to apply to match in source
    const reObj = {
      re: argv.regexp || reMatchPaths.re,
      fileSufix: !argv.regexp ? reMatchPaths.fileSufix : (argv.logsufix || 'source_match'),
      clean: !argv.regexp ? reMatchPaths.clean : null,
    };
    
    for (let i=0; i < aURLs.length; i++) {
      await prettyFileAndLog(argv.output, aURLs[i], argv.insource, reObj);
      await progressBar.increment();
    }

    progressBar.stop();

    if (argv.vscode) {
      exec(`code ${argv.output}`);
    }

    const finalMarkdown = fs.readFileSync(`${argv.output}/index_${reObj.fileSufix}.md`, 'utf8');
    const finalHTML = await marked(finalMarkdown);
    const cssText = fs.readFileSync(`${__dirname}/github-markdown.css`, 'utf8');
    fs.writeFileSync(`${argv.output}/index_${reObj.fileSufix}.html`, `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<style type="">\n${cssText}\n</style>\n</head>\n<body>\n<article class="markdown-body">`, {encoding: 'utf8', flag: 'a'});
    fs.writeFileSync(`${argv.output}/index_${reObj.fileSufix}.html`, finalHTML, {encoding: 'utf8', flag: 'a'});
    fs.writeFileSync(`${argv.output}/index_${reObj.fileSufix}.html`, `\n</article></body></html>`, {encoding: 'utf8', flag: 'a'});
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
