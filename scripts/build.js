const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const version = manifest.version;

const distDir = path.join(__dirname, '..', 'dist');
if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });

const outputPath = path.join(distDir, `comine-browser-${version}.zip`);
const output = fs.createWriteStream(outputPath);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  console.log(`Built: comine-browser-${version}.zip (${archive.pointer()} bytes)`);
});

archive.on('error', (err) => { throw err; });
archive.pipe(output);

const files = [
  'manifest.json',
  'background.js',
  'content.js',
  'content.css',
  'popup.html',
  'popup.js',
  'popup.css',
  'icon.svg',
];

files.forEach(file => {
  if (fs.existsSync(file)) archive.file(file, { name: file });
});

if (fs.existsSync('icons')) {
  archive.directory('icons/', 'icons');
}

archive.finalize();
