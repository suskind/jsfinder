module.exports = {
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
    const list = [
      'googletagmanager.com',
      'google-analytics.com',
      'googleadservices.com',
      'redditstatic.com',
      'ads-twitter.com',
      'facebook.net',
      'albacross.com',
      'google-analytics.com',
      'hs-analytics.net',
      'doubleclick.net',
      'analytics.twitter.com',
      'intercomcdn.com',
      'hs-scripts.com',
      'usemessages.com',
      'snap.licdn.com',
      'consensu.org',
      'gemius.pl',
      'pubstack.io',
      'bkrtx.com',
      'jsdelivr.net',
      'bluekai.com',
      'digitru.st',
      'rubiconproject.com',
      'criteo.net',
      'adnxs.com',
      'pub.web.sapo.io',
      'taboola.com',
      'hotjar.com',
      'scorecardresearch.com',
      'moatads.com',
      '2mdn.net',
      'adservice.google.pt',
      'adservice.google.com',
      'googletagservices.com',
      'navdmp.com',
      'googlesyndication.com',
      'facebook.com/plugins/like',
      'facebook.com/rsrc.php',
      'sdk.privacy-center.org',
      'amazon-adsystem.com',
      'outbrain.com',
      'onetrust.com',
      'cdn.cookielaw.org',
    ];
    for (let i=0; i < list.length; i++) {
      if (url.indexOf(list[i]) > -1) {
        return true;
      }
    }
    return false;
  },


};
