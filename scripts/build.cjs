const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
fs.copyFileSync(path.join(root, '最后防线_全面反击_v2-8.html'), path.join(root, 'index.html'));
console.log('Static entry generated: index.html');
