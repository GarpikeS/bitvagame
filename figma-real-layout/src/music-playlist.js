export function pickRandomMusicIndex(excludedIndexes = [], totalSongs = 60, random = Math.random) {
  const total = Math.max(1, Math.floor(Number(totalSongs) || 1));
  const excluded = new Set(
    (Array.isArray(excludedIndexes) ? excludedIndexes : [])
      .map(Number)
      .filter((index) => Number.isInteger(index) && index >= 0 && index < total),
  );
  let available = Array.from({ length: total }, (_, index) => index)
    .filter((index) => !excluded.has(index));

  if (!available.length) available = Array.from({ length: total }, (_, index) => index);

  const randomValue = Math.min(0.999999999999, Math.max(0, Number(random()) || 0));
  return available[Math.floor(randomValue * available.length)];
}
