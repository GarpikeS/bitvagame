function hashBlankPackSeed(value) {
  const source = String(value || 'blank-pack');
  let hash = 2166136261;

  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function createSeededRandom(seed) {
  let state = hashBlankPackSeed(seed);

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function selectRandomBlankFiles(files, requestedCount, seed) {
  const uniqueFiles = [...new Set((Array.isArray(files) ? files : []).filter(Boolean))];
  const count = Math.min(uniqueFiles.length, Math.max(0, Math.floor(Number(requestedCount) || 0)));
  const random = createSeededRandom(seed);

  for (let index = uniqueFiles.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [uniqueFiles[index], uniqueFiles[swapIndex]] = [uniqueFiles[swapIndex], uniqueFiles[index]];
  }

  return uniqueFiles.slice(0, count);
}
