const fs = require('fs-extra');
const path = require('path');

const MANIFEST_TYPE = process.env.MANIFEST_TYPE || 'chrome-mv3';
const distPath = MANIFEST_TYPE.endsWith('-mv2') ? 'dist-mv2' : 'dist';

fs.emptyDirSync(path.resolve(__dirname, '..', distPath));
