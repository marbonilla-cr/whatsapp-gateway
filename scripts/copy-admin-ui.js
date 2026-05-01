'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'admin', 'dist');
const dst = path.join(root, 'dist', 'admin-ui');

if (!fs.existsSync(src)) {
  console.error('copy-admin-ui: expected', src, '(run npm run build:admin first)');
  process.exit(1);
}
fs.mkdirSync(path.dirname(dst), { recursive: true });
fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(src, dst, { recursive: true });
console.log('copy-admin-ui ->', dst);
