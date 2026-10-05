const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'qa/layout5-game/comparisons');
fs.mkdirSync(output, { recursive: true });

function magick(args, allowDifference = false) {
  const result = spawnSync('magick', args, { cwd: root, encoding: 'utf8', windowsHide: true });
  if (result.error || ![0, ...(allowDifference ? [1] : [])].includes(result.status)) {
    throw result.error || new Error(result.stderr);
  }
  return result;
}

function size(image) {
  return magick(['identify', '-format', '%w %h', image]).stdout.trim().split(/\s+/).map(Number);
}

const pairs = [
  ['playing', 'game'],
  ['paused', 'pause'],
  ['ended', 'ended'],
  ['answers', 'answers'],
  ['cover', 'cover'],
];

const results = pairs.map(([actualName, referenceName]) => {
  const reference = path.join(root, `reference/layout5/${referenceName}.png`);
  const actual = path.join(root, `qa/layout5-game/${actualName}.png`);
  const [rw, rh] = size(reference);
  const [aw, ah] = size(actual);
  if (rw !== 1080 || aw !== rw) throw new Error(`Unexpected canvas width for ${actualName}: ${rw}/${aw}`);
  const height = Math.max(rh, ah);
  const extent = `${rw}x${height}`;
  const normalized = [reference, actual].map((image, index) => {
    const target = path.join(output, `${actualName}-${index ? 'actual' : 'reference'}.png`);
    magick([image, '-background', '#f3f3f3', '-gravity', 'northwest', '-extent', extent, target]);
    return target;
  });
  const diff = path.join(output, `${actualName}-diff.png`);
  const metric = magick(['compare', '-metric', 'AE', '-fuzz', '5%', ...normalized, diff], true);
  const changedPixels = Number.parseFloat(metric.stderr);
  return {
    state: actualName,
    referenceHeight: rh,
    actualHeight: ah,
    heightDelta: ah - rh,
    changedPixels,
    comparedPixels: rw * height,
    changedPercent: +(changedPixels / (rw * height) * 100).toFixed(3),
    colorTolerance: 'ImageMagick fuzz 5%',
    diff: path.relative(root, diff),
  };
});

fs.writeFileSync(path.join(output, 'report.json'), `${JSON.stringify({
  comparedAt: new Date().toISOString(),
  scope: 'Layout 5 interactive karaoke states at natural 1080px, DPR 1.',
  pixelPerfect: results.every(result => result.changedPixels === 0),
  results,
}, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
