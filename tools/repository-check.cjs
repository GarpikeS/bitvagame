// Dependency-free check. Never prints matched credential values.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const staged = process.argv.includes('--staged');
const git = (args, options = {}) => execFileSync('git', args, { cwd: root, maxBuffer: 64 * 1024 * 1024, ...options });
const files = git(['ls-files', '-z', '--cached', ...(staged ? [] : ['--others', '--exclude-standard'])])
  .toString('utf8').split('\0').filter(Boolean);
const unique = [...new Set(files)].sort();
const issues = [];
let bytes = 0;
const textTypes = /\.(?:md|txt|json|html|css|svg|js|jsx|cjs|ts|tsx|sh|ps1|py|ya?ml|example)$/i;
const unsafePath = /(?:^|\/)(?:node_modules|server-data|server-dist|dist|artifacts|qa|\.secrets|live-snapshot|server-snapshots|deploy-staging)(?:\/|$)|(?:^|\/)\.env(?!\.example$)(?:\.|$)|(?:^|\/)(?:\.npmrc|id_rsa[^/]*|id_ed25519[^/]*)$|\.(?:pem|key|p12|pfx|sqlite3?|db|tgz|bundle)$/i;
const indexEntries = new Map();
const blobSizes = new Map();
const textBlobs = new Map();
if (staged) {
  // Batch reads keep the full-index hook fast even with hundreds of images.
  for (const entry of git(['ls-files', '--stage', '-z']).toString('utf8').split('\0').filter(Boolean)) {
    const tab = entry.indexOf('\t');
    const [mode, oid, stage] = entry.slice(0, tab).split(' ');
    const name = entry.slice(tab + 1);
    if (stage !== '0') issues.push({ file: name, rule: 'unmerged-index' });
    if (!['100644', '100755'].includes(mode)) issues.push({ file: name, rule: 'non-regular-file' });
    indexEntries.set(name, { oid, mode });
  }
  const oids = [...new Set([...indexEntries.values()].map(entry => entry.oid))];
  if (oids.length) {
    const sizes = git(['cat-file', '--batch-check'], { input: oids.join('\n') + '\n' }).toString('utf8');
    for (const line of sizes.trim().split('\n')) {
      const [oid, type, size] = line.split(' ');
      if (type !== 'blob') throw new Error('Unexpected index object type');
      blobSizes.set(oid, Number(size));
    }
  }
  const textOids = [...new Set(unique.filter(name => !unsafePath.test(name) && textTypes.test(name))
    .map(name => indexEntries.get(name).oid).filter(oid => blobSizes.get(oid) <= 50 * 1024 * 1024))];
  for (let start = 0; start < textOids.length; start += 16) {
    const batch = textOids.slice(start, start + 16);
    const data = git(['cat-file', '--batch'], { input: batch.join('\n') + '\n', maxBuffer: 256 * 1024 * 1024 });
    let offset = 0;
    for (const expected of batch) {
      const end = data.indexOf(10, offset);
      const [oid, type, size] = data.subarray(offset, end).toString('utf8').split(' ');
      if (oid !== expected || type !== 'blob') throw new Error('Index blob identity mismatch');
      offset = end + 1;
      textBlobs.set(oid, data.subarray(offset, offset + Number(size)));
      offset += Number(size) + 1;
    }
  }
}
const rules = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/g],
  ['aws-access-key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ['jwt-literal', /\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\b/g],
  ['slack-token', /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g],
];

for (const name of unique) {
  if (unsafePath.test(name)) { issues.push({ file: name, rule: 'forbidden-path' }); continue; }
  let data;
  if (staged) {
    // Read the actual index blob, not a potentially different working file.
    const oid = indexEntries.get(name).oid;
    const size = blobSizes.get(oid);
    bytes += size;
    if (size > 50 * 1024 * 1024) { issues.push({ file: name, rule: 'file-over-50MiB' }); continue; }
    if (!textTypes.test(name)) continue;
    data = textBlobs.get(oid);
  } else {
    const full = path.join(root, name);
    const stat = fs.lstatSync(full);
    if (!stat.isFile()) { issues.push({ file: name, rule: 'non-regular-file' }); continue; }
    if (stat.size > 50 * 1024 * 1024) { issues.push({ file: name, rule: 'file-over-50MiB' }); continue; }
    data = fs.readFileSync(full);
  }
  if (!staged) bytes += data.length;
  if (data.length > 50 * 1024 * 1024) issues.push({ file: name, rule: 'file-over-50MiB' });
  if (!textTypes.test(name) || data.includes(0)) continue;
  const text = data.toString('utf8');
  for (const [rule, pattern] of rules) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const line = text.slice(0, match.index).split('\n').length;
      issues.push({ file: name, line, rule });
    }
  }
}

for (const required of ['README.md', 'PROJECT_PASSPORT.md', 'RIGHTS.md', 'SECURITY.md',
  'figma-real-layout/package-lock.json', 'figma-real-layout/.env.example']) {
  if (!unique.includes(required)) issues.push({ file: required, rule: 'required-file-missing' });
}
console.log(JSON.stringify({ scope: staged ? 'index' : 'tracked-and-untracked-not-ignored',
  files: unique.length, sizeMiB: +(bytes / 1048576).toFixed(2), issues }, null, 2));
if (issues.length) process.exitCode = 1;
