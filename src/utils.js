const fs = require('fs');
const crypto = require('crypto')
const beautify = require('js-beautify');

const { adsBlackList } = require('./config');

const modules = {
  autoScroll: async function(page) {
    await page.evaluate(async () => {
      await new Promise((resolve, reject) => {
        var totalHeight = 0;
        var distance = 100;
        var timer = setInterval(() => {
          var scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;

          if(totalHeight >= scrollHeight){
            clearInterval(timer);
            resolve();
          }
        }, 100);
      });
    });
  },


  isAdsURL: function(url) {
    const list = [].concat(adsBlackList);
    for (let i=0; i < list.length; i++) {
      if (url.indexOf(list[i]) > -1) {
        return true;
      }
    }
    return false;
  },

  beautify: function(filterType, contentType, resBody) {
    let bodyIndent = '';
    if (filterType === 'document') {
      bodyIndent = beautify.html(resBody, { indent_size: 2 });
    } else if (filterType === 'script' || filterType === 'document_script') {
      bodyIndent = beautify.js(resBody, { indent_size: 2 });
    } else if (filterType === 'xhr') {
      if (contentType.indexOf('json') > -1 || contentType.indexOf('javascript') > -1) {
        bodyIndent = beautify.js(resBody, { indent_size: 2 });
      } else if (contentType.indexOf('html')) {
        bodyIndent = beautify.html(resBody, { indent_size: 2 });
      } else {
        bodyIndent = resBody;
      }
    }
    return bodyIndent;
  },

  writeOutputTerminal: function(obj) {
    const { status, contentType, filterType, url } = obj;
    console.log(`${filterType} :: (${status}) ${contentType} :: ${url}`);
  },

  createOutputDir: function(dir) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir);
    }
  },

  formatHeders: function(obj, direction) {
    let sign = '';
    if (direction === 'req') {
      sign = '>';
    } else if (direction) {
      sign = '<';
    }
    let str = '';
    for (let prop in obj) {
      if (obj.hasOwnProperty(prop)) {
        str += `${sign} ${prop}: ${obj[prop]}\n`;
      }
    }
    return str;
  },

  prettyFileAndLog: async function(dir, obj, fetchInSource) {
    const { contentType, filterType, reqHeaders, resHeaders, url, body, status } = obj;
    let extension = '.js';
    let headers = '';
    if (filterType === 'document') {
      extension = '.html';
      headers = `
<!--
${url}

${modules.formatHeders(reqHeaders, 'req')}

${modules.formatHeders(resHeaders, 'res')}

-->
      `;
    } else if (filterType === 'script' || filterType === 'document_script') {
      extension = '.js';
      headers = `
/*
${url}

${modules.formatHeders(reqHeaders, 'req')}

${modules.formatHeders(resHeaders, 'res')}

*/
      `;
    } else if (filterType === 'xhr') {
      if (contentType.indexOf('json') > -1 || contentType.indexOf('javascript') > -1) {
        extension = '.json';
        headers = `
/*
${url}

${modules.formatHeders(reqHeaders, 'req')}

${modules.formatHeders(resHeaders, 'res')}

*/
        `;
      } else if (contentType.indexOf('html')) {
        extension = '.html';
        headers = `
<!--
${url}

${modules.formatHeders(reqHeaders, 'req')}

${modules.formatHeders(resHeaders, 'res')}

-->
        `;
      } else {
        extension = '.txt';
        headers = `
/*
${url}

${modules.formatHeders(reqHeaders, 'req')}

${modules.formatHeders(resHeaders, 'res')}

*/
        `;
      }
    }
    let out = '';
    if (body) {
      const prettyBody = modules.beautify(filterType, contentType, body);
      out = `${headers}
${prettyBody}
      `;

      modules.writeBodyAndLog({dir, status, url, body, out, extension, filterType, contentType});
      if (fetchInSource) {
        modules.searchUrlInSourceAndLog({dir, url, prettyBody, out, extension, filterType, contentType});
      }
      return true;
    }

    return null;
  },

  writeBodyAndLog: function(obj) {
    const { dir, url, status, body, out, extension, filterType, contentType } = obj;

    const hash = crypto.createHash('md5').update(body).digest('hex');
    const fileName = `${hash}${extension}`;
    fs.writeFileSync(`${dir}/${fileName}`, out, 'utf8');
    fs.writeFileSync(`${dir}/index`, `${dir}/${fileName} :: ${url} :: [${status}] (${filterType}) :: (${contentType})\n`, {encoding: 'utf8', flag: 'a'});
    fs.writeFileSync(`${dir}/index_paths.md`, `## ${url}\n#### ${dir}/[${fileName}](./${fileName})\n##### \`[${status}] (${filterType}) - (${contentType})\`\n`, {encoding: 'utf8', flag: 'a'});
  
    return true;
  },

  searchUrlInSourceAndLog: function(obj) {
    const { dir, url, prettyBody, out, extension, filterType, contentType } = obj;

    const aBody = prettyBody.split('\n');
    const aLinks = [];
    let toFind = false;
    try {
      aBody.forEach((line) => {
        if (filterType !== 'document') {
          toFind = true;
        }
        if (filterType === 'document' && toFind && line.indexOf('</script>') > -1) {
          toFind = false;
        }
        if (filterType === 'document' && line.indexOf('<script') > -1 && line.indexOf('src=') === -1) {
          toFind = true;
        }
        // console.log('toFind :: ', toFind)
        if (toFind) {
          const reg = new RegExp("[^/][`'\"]([\/][a-zA-Z0-9_.-]+)+(?!([gimuy]*[,;\s])|\/\2)");
          const aMatch = line.match(reg);
          // console.log(aMatch)
          if (aMatch) {
            const path = aMatch[0].replace(/^[^\/]+/g, '');
            aLinks.push(path);
            fs.writeFileSync(`${dir}/index_paths.md`, ` * \`${path}\` \n`, {encoding: 'utf8', flag: 'a'});
            fs.writeFileSync(`${dir}/index_paths.md`, `\`\`\`js\n${aMatch.input.trim()}\n\`\`\`\n`, {encoding: 'utf8', flag: 'a'});
          }
        }
        toFind = false;
      });
    } catch(matchEx) {
      console.log('Error on match :: ', matchEx);
    }
    return true;
  }



};

module.exports = modules;
