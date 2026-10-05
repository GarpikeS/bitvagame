export const LAYOUT7_ROUTE = Object.freeze({
  catalog: 'karaoke-battle-categories',
  game: 'karaoke-battle-game',
  songList: 'karaoke-battle-song-list',
  legacySongList: 'karaoke-battle-viewed-songs',
  fullscreenPortraitHidden: 'karaoke-battle-fullscreen-portrait-hidden',
  fullscreenPortraitAnswers: 'karaoke-battle-fullscreen-portrait-answers',
  fullscreenLandscapeHidden: 'karaoke-battle-fullscreen-landscape-hidden',
  fullscreenLandscapeAnswers: 'karaoke-battle-fullscreen-landscape-answers',
});

export const LAYOUT7_ROUTES = Object.freeze([...new Set(Object.values(LAYOUT7_ROUTE))]);

export function isLayout7Route(route) {
  return LAYOUT7_ROUTES.includes(route);
}

export function isLayout7FullscreenRoute(route) {
  return String(route || '').startsWith('karaoke-battle-fullscreen-');
}
