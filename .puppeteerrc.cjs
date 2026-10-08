const { join } = require('path');

// Test tarayıcısı proje içinde kalsın; eklenti desteklemeyen headless-shell indirilmesin.
module.exports = {
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
  'chrome-headless-shell': { skipDownload: true },
};
