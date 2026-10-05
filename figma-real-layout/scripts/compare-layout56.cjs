const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// QA artifacts only. Normalization pads images; it never rescales either source.
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'qa/layout56/comparisons');
fs.mkdirSync(output, { recursive: true });
function magick(args, allowDifference = false) {
  const result = spawnSync('magick', args, { cwd: root, encoding: 'utf8', windowsHide: true });
  if (result.error || ![0, ...(allowDifference ? [1] : [])].includes(result.status)) {
    throw result.error || new Error(result.stderr);
  }
  return result;
}
const pairs = [
  ['karaoke-battle', 5, 'description'], ['royal-battle', 6, 'description'],
  ['karaoke-battle-categories', 5, 'catalog'], ['royal-battle-collections', 6, 'catalog'],
];
const results = pairs.map(([route, layout, frame]) => {
  const reference = path.join(root, `reference/layout${layout}/${frame}.png`);
  const actual = path.join(root, `qa/layout56/${route}-1080.png`);
  const size = image => magick(['identify', '-format', '%w %h', image]).stdout.trim().split(/\s+/).map(Number);
  const [rw, rh] = size(reference), [aw, ah] = size(actual);
  if (rw !== aw || rw !== 1080) throw new Error(`Unequal natural canvas widths: ${route}`);
  const height = Math.max(rh, ah), extent = `${rw}x${height}`;
  const normalized = [reference, actual].map((image, index) => {
    const target = path.join(output, `${route}-${index ? 'actual' : 'reference'}.png`);
    magick([image, '-background', '#f3f3f3', '-gravity', 'northwest', '-extent', extent, target]);
    return target;
  });
  const diff = path.join(output, `${route}-diff.png`);
  const metric = magick(['compare', '-metric', 'AE', '-fuzz', '5%', ...normalized, diff], true);
  const changedPixels = Number.parseFloat(metric.stderr);
  if (!Number.isFinite(changedPixels)) throw new Error(`Unreadable image metric: ${metric.stderr}`);
  return { route, referenceHeight: rh, actualHeight: ah, heightDelta: ah - rh,
    changedPixels, comparedPixels: rw * height,
    changedPercent: +(changedPixels / (rw * height) * 100).toFixed(3),
    colorTolerance: 'ImageMagick fuzz 5%', diff: path.relative(root, diff) };
});
fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({
  comparedAt: new Date().toISOString(),
  scope: 'Four implemented description/catalogue frames at natural 1080px, DPR 1. Not a completion gate for the other game screens.',
  pixelPerfect: false, results,
}, null, 2) + '\n');
console.log(JSON.stringify(results, null, 2));
