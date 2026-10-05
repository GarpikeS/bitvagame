const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync, spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });

async function main() {
  const commit = git(['rev-parse', 'HEAD']).trim();
  const entries = git(['ls-tree', '-r', '-z', '--full-tree', 'HEAD']).split('\0').filter(Boolean).map(line => {
    const [metadata, name] = line.split('\t');
    const [mode, type, oid] = metadata.split(' ');
    if (type !== 'blob') throw new Error(`Unexpected non-blob entry: ${name}`);
    return { path: name, mode, gitBlob: oid };
  });
  const child = spawn('git', ['cat-file', '--batch'], { cwd: root, stdio: ['pipe', 'pipe', 'inherit'] });
  const closed = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`git cat-file exit ${code}`)));
  });
  child.stdin.end(entries.map(e => e.gitBlob).join('\n') + '\n');
  let pending = Buffer.alloc(0), index = 0, remaining = null, hash, separator = false;
  for await (const chunk of child.stdout) {
    pending = Buffer.concat([pending, chunk]);
    while (pending.length) {
      if (separator) { if (pending[0] !== 10) throw new Error('Invalid batch separator'); pending = pending.subarray(1); separator = false; index++; continue; }
      if (remaining === null) {
        const end = pending.indexOf(10);
        if (end < 0) break;
        const [oid, type, size] = pending.subarray(0, end).toString('utf8').split(' ');
        if (type !== 'blob' || oid !== entries[index]?.gitBlob) throw new Error('Blob identity mismatch');
        remaining = Number(size); entries[index].bytes = remaining; hash = crypto.createHash('sha256');
        pending = pending.subarray(end + 1);
      }
      const take = Math.min(remaining, pending.length);
      hash.update(pending.subarray(0, take)); pending = pending.subarray(take); remaining -= take;
      if (remaining === 0) { entries[index].sha256 = hash.digest('hex'); remaining = null; separator = true; }
      else break;
    }
  }
  await closed;
  if (index !== entries.length) throw new Error('Incomplete manifest');
  const outputIndex = process.argv.indexOf('--output');
  const output = outputIndex >= 0 ? path.resolve(process.argv[outputIndex + 1]) : null;
  const report = { format: 'bitvagame-git-source-manifest-v1', generatedAt: new Date().toISOString(), commit,
    note: 'HEAD blob bytes, not a trusted timestamp or ownership certificate.', files: entries };
  const json = JSON.stringify(report, null, 2) + '\n';
  if (output) {
    fs.writeFileSync(output, json, { flag: 'wx' });
    console.log(JSON.stringify({ output, commit, files: entries.length, sha256: crypto.createHash('sha256').update(json).digest('hex') }, null, 2));
  } else process.stdout.write(json);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
