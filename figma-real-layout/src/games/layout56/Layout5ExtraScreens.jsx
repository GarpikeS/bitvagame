import React, { useEffect } from 'react';
import layout5Songs from '../../../reference/layout5/songs.png';
import './layout5-extra-screens.css';

export const LAYOUT5_EXTRA_ROUTES = Object.freeze({
  viewedSongs: 'karaoke-battle-viewed-songs',
  songList: 'karaoke-battle-song-list',
  purchases: 'purchases',
  legacyPurchases: 'karaoke-battle-purchases',
  fullscreenPortraitHidden: 'karaoke-battle-fullscreen-portrait-hidden',
  fullscreenPortraitAnswers: 'karaoke-battle-fullscreen-portrait-answers',
  fullscreenLandscapeHidden: 'karaoke-battle-fullscreen-landscape-hidden',
  fullscreenLandscapeAnswers: 'karaoke-battle-fullscreen-landscape-answers',
});

const BASE = '/generated/layout5/extra-screens';
const makeScreen = (file, figmaNode, width, height, kind, extra = {}) => ({
  asset: BASE + '/' + file, figmaNode, width, height, kind, ...extra,
});

const SCREEN_DATA = Object.freeze({
  [LAYOUT5_EXTRA_ROUTES.viewedSongs]:
    makeScreen('viewed-songs.png', '1:2056', 1080, 3581, 'viewed-songs', { title: 'Выпали песни' }),
  [LAYOUT5_EXTRA_ROUTES.songList]:
    makeScreen('song-list-modal.png', '1:1575', 1080, 2680, 'song-list', { title: 'Караоке-битва' }),
  [LAYOUT5_EXTRA_ROUTES.purchases]:
    makeScreen('purchases.png', '1:5215', 1080, 2241, 'purchases', { title: 'Мои покупки' }),
  [LAYOUT5_EXTRA_ROUTES.fullscreenPortraitHidden]:
    makeScreen('fullscreen-portrait-hidden.png', '1:2841', 1080, 1891, 'fullscreen', { orientation: 'portrait', answers: false }),
  [LAYOUT5_EXTRA_ROUTES.fullscreenPortraitAnswers]:
    makeScreen('fullscreen-portrait-answers.png', '1:2874', 1080, 1891, 'fullscreen', { orientation: 'portrait', answers: true }),
  [LAYOUT5_EXTRA_ROUTES.fullscreenLandscapeHidden]:
    makeScreen('fullscreen-landscape-hidden.png', '1:2904', 1280, 800, 'fullscreen', { orientation: 'landscape', answers: false }),
  [LAYOUT5_EXTRA_ROUTES.fullscreenLandscapeAnswers]:
    makeScreen('fullscreen-landscape-answers.png', '1:3368', 1280, 800, 'fullscreen', { orientation: 'landscape', answers: true }),
});

function canonicalExtraRoute(route) {
  return route === LAYOUT5_EXTRA_ROUTES.legacyPurchases
    ? LAYOUT5_EXTRA_ROUTES.purchases
    : route;
}

const SONGS = [
  'Олег Газманов — Мои ясные дни',
  'Михаил Шуфутинский — Марджанджа',
  'Александр Иванов — Боже, какой пустяк',
  'Игорь Николаев — Выпьем за любовь',
  'Земляне — Трава у дома',
  'Дискотека Авария — Если хочешь остаться',
  'Кино — Группа крови',
  'JONY — Комета',
  'IOWA — Маршрутка',
  'Жуки — Батарейка',
];

function HiddenCopy({ kind, answers, categoryTitle = '', playedSongs = [], purchaseGroups = [] }) {
  if (kind === 'song-list') {
    return <div className="l5x-visually-hidden"><h1>Список песен</h1><ul>{SONGS.map(song => <li key={song}>{song}</li>)}</ul><p>И ещё 150+ песен.</p></div>;
  }
  if (kind === 'viewed-songs') {
    return <div className="l5x-visually-hidden"><h1>Выпали песни: {categoryTitle || 'категория не выбрана'}</h1>{playedSongs.length
      ? <ol>{playedSongs.map((song, index) => <li key={`${song.id || song.songIndex}-${song.occurrence ?? index}`}>{song.artist} — {song.title}</li>)}</ol>
      : <p>Песни пока не выпадали.</p>}</div>;
  }
  if (kind === 'purchases') {
    return <div className="l5x-visually-hidden"><h1>Мои покупки</h1>{purchaseGroups.length
      ? <ul>{purchaseGroups.map(group => <li key={group.id}>{group.title} — {group.action}</li>)}</ul>
      : <p>Покупок пока нет.</p>}</div>;
  }
  return <div className="l5x-visually-hidden"><h1>Дискотека Авария — Если хочешь остаться</h1><p>{answers ? 'Правильные слова показаны.' : 'Правильные слова скрыты.'}</p></div>;
}

function DynamicHeader({ Nav, screen, balance, goBack, goTo, isLoggedIn, profileName }) {
  if (!Nav || !['viewed-songs', 'song-list'].includes(screen.kind)) return null;
  return <div className="l5x-nav">
    <Nav
      backRoute="karaoke-battle-game"
      balance={balance}
      goBack={goBack}
      goTo={goTo}
      isLoggedIn={isLoggedIn}
      profileName={profileName}
      title={screen.title}
    />
  </div>;
}

function PurchaseHeader({ goBack, goTo }) {
  return <nav className="l5x-purchase-nav" aria-label="Навигация покупок">
    <button type="button" onClick={() => goBack('profile')} aria-label="Назад в личный кабинет">
      <span className="l5x-purchase-back-icon" aria-hidden="true">
        <img src="/generated/layout4-icons/back.png" alt="" />
      </span>
      <strong>Мои покупки</strong>
    </button>
    <a href="#/" onClick={(event) => { event.preventDefault(); goTo('home'); }} aria-label="На главную">
      <img src="/generated/header-logo-figma.png" alt="Битва игры" />
    </a>
  </nav>;
}

function FullscreenHits({ orientation, onExit, onNewSong, onTogglePause }) {
  return <>
    <button className="l5x-hit l5x-fullscreen-exit" type="button" onClick={onExit} aria-label="Выйти из полноэкранного режима" />
    <button className="l5x-hit l5x-fullscreen-new" type="button" onClick={onNewSong} aria-label="Новая песня" />
    <button className="l5x-hit l5x-fullscreen-pause" type="button" onClick={onTogglePause} aria-label="Пауза" />
    <span className="l5x-visually-hidden" data-orientation={orientation}>Звук не воспроизводится.</span>
  </>;
}

function ViewedSongs({ categoryTitle, onOpenSong, playedSongs }) {
  const songs = Array.isArray(playedSongs) ? playedSongs : [];
  return <section className="l5x-viewed-live" aria-label="Выпавшие песни">
    <h2>{categoryTitle || 'Выпавшие песни'}</h2>
    <ol className={`l5x-viewed-live-list${songs.length ? '' : ' is-empty'}`} data-played-count={songs.length}>
      {songs.length ? songs.map((song, index) => {
        const songIndex = Number.isInteger(song.songIndex) ? song.songIndex : index;
        const variant = song.id === 'recognise' ? 'recognise' : song.id === 'stay' ? 'stay' : 'fallback';
        return <li key={`${song.id || songIndex}-${song.occurrence ?? index}`}>
          <button
            className={`l5x-viewed-live-card is-${variant}`}
            type="button"
            onClick={() => onOpenSong(songIndex)}
            aria-label={`Открыть выпавшую песню ${index + 1}: ${song.artist} — ${song.title}`}
          >
            {variant !== 'fallback' ? <img className="l5x-viewed-live-card-sheet" src={layout5Songs} alt="" aria-hidden="true" /> : <span className="l5x-viewed-live-fallback">
              <strong>{song.artist}</strong><b>{song.title}</b>
            </span>}
            <span className="l5x-viewed-live-expand-mask" aria-hidden="true" />
            {variant === 'recognise' ? <span className="l5x-viewed-live-play-mask" aria-hidden="true" /> : null}
            <span className="l5x-viewed-live-number" aria-hidden="true">{index + 1}</span>
          </button>
        </li>;
      }) : <li className="l5x-viewed-live-empty">
        <strong>Песни пока не выпадали</strong>
        <span>Нажмите «Новая песня» во время игры — история появится здесь.</span>
      </li>}
    </ol>
  </section>;
}

function PurchaseHits({ goBack, goTo, onOpenPurchase, purchaseGroups }) {
  const open = (kind, fallback) => {
    if (onOpenPurchase) onOpenPurchase(kind);
    else goTo(fallback);
  };
  return <>
    <button className="l5x-hit l5x-purchases-back" type="button" onClick={() => goBack('profile')} aria-label="Назад в профиль" />
    {purchaseGroups.map(group => <button
      key={group.id}
      className={`l5x-hit l5x-purchase-card l5x-purchase-card--${group.id}`}
      type="button"
      onClick={() => open(group.kind, group.fallback)}
      aria-label={group.label}
    />)}
    <button className="l5x-hit l5x-purchases-profile" type="button" onClick={() => goTo('profile')} aria-label="Открыть профиль" />
  </>;
}

const PURCHASE_GROUPS = Object.freeze([
  {
    id: 'loto',
    kind: 'music-loto',
    fallback: 'music-blanks',
    title: 'Музыкальное лото',
    action: 'Мои бланки',
    label: 'Мои бланки музыкального лото',
    art: '/figma-assets/purchase-loto-figma.png',
  },
  {
    id: 'karaoke',
    kind: 'karaoke-battle',
    fallback: 'karaoke-battle-categories',
    title: 'Караоке-битва',
    action: 'Мои категории',
    label: 'Мои категории караоке-битвы',
    art: '/figma-assets/purchase-karaoke-figma.png',
  },
  {
    id: 'royal',
    kind: 'royal-battle',
    fallback: 'royal-battle-collections',
    title: 'Королевская битва',
    action: 'Мои сборники',
    label: 'Мои сборники королевской битвы',
    art: '/figma-assets/purchase-royal-figma.png',
  },
]);

function availablePurchases({ purchasedBlanks, purchasedMusicCategories, gameEntitlements }) {
  const hasLoto = purchasedBlanks.length > 0 || purchasedMusicCategories.length > 0;
  const hasKaraoke = gameEntitlements.some(value => String(value).startsWith('karaoke:'));
  const hasRoyal = gameEntitlements.some(value => String(value).startsWith('royal:'));
  return PURCHASE_GROUPS.filter(group => (
    (group.id === 'loto' && hasLoto)
    || (group.id === 'karaoke' && hasKaraoke)
    || (group.id === 'royal' && hasRoyal)
  ));
}

function PurchaseOverview({ groups, goTo, onOpenPurchase }) {
  const open = group => {
    if (onOpenPurchase) onOpenPurchase(group.kind);
    else goTo(group.fallback);
  };
  return <section className={`l5x-purchase-overview${groups.length ? '' : ' is-empty'}`} aria-label="Доступные покупки">
    {groups.length ? <>
      {groups.map(group => <button
        className={`l5x-purchase-live-card is-${group.id}`}
        key={group.id}
        type="button"
        onClick={() => open(group)}
        aria-label={group.label}
        data-purchase-id={group.id}
      >
        <img
          className="l5x-purchase-live-art"
          src={group.art}
          alt=""
          aria-hidden="true"
          width="969"
          height="266"
        />
      </button>)}
      <button className="l5x-purchase-show-all" type="button" disabled aria-disabled="true">
        Показать все покупки
      </button>
    </> : <div className="l5x-purchase-empty">
      <strong>Покупок пока нет</strong>
      <p>Купленные бланки, категории и сборники появятся здесь.</p>
      <button type="button" onClick={() => goTo('home', { scrollTarget: 'games' })}>Выбрать игру</button>
    </div>}
  </section>;
}

function PurchaseIdentity({ balance, profileName }) {
  const name = String(profileName || 'Пользователь').trim() || 'Пользователь';
  const initial = name.charAt(0).toLocaleUpperCase('ru-RU') || 'П';
  return <section className="l5x-purchase-identity" aria-label={`Профиль ${name}`}>
    <div className="l5x-purchase-avatar" aria-hidden="true"><span>{initial}</span></div>
    <div className="l5x-purchase-name">
      <div className="l5x-purchase-name-title">
        <strong>{name}</strong>
        <img src="/generated/profile-pencil-figma.svg" alt="" aria-hidden="true" width="31" height="31" />
      </div>
      <div className="l5x-purchase-meta">
        <span>ID 0427</span>
      </div>
    </div>
    <div className="l5x-purchase-balance"><span className="l5x-purchase-balance-coin" aria-hidden="true"><span className="l5x-purchase-balance-coin-crop"><img src="/generated/balance-coin-clean.png" alt="" /></span></span><strong>{new Intl.NumberFormat('ru-RU').format(Number(balance) || 0)}</strong></div>
  </section>;
}

export function isLayout5ExtraRoute(route) {
  return Boolean(SCREEN_DATA[canonicalExtraRoute(route)]);
}

export function layout5FullscreenRoute({ answers = false, orientation = 'portrait' } = {}) {
  if (orientation === 'landscape') {
    return answers ? LAYOUT5_EXTRA_ROUTES.fullscreenLandscapeAnswers : LAYOUT5_EXTRA_ROUTES.fullscreenLandscapeHidden;
  }
  return answers ? LAYOUT5_EXTRA_ROUTES.fullscreenPortraitAnswers : LAYOUT5_EXTRA_ROUTES.fullscreenPortraitHidden;
}

export function Layout5ExtraScreen({
  route,
  Nav,
  balance = 0,
  goBack = () => {},
  goTo = () => {},
  isLoggedIn = false,
  profileName = '',
  purchasedBlanks,
  purchasedMusicCategories,
  gameEntitlements,
  categoryTitle = '',
  playedSongs = [],
  onClose,
  onExitFullscreen,
  onNewSong = () => {},
  onOpenPurchase,
  onOpenSong = () => {},
  onTogglePause = () => {},
}) {
  const canonicalRoute = canonicalExtraRoute(route);
  const screen = SCREEN_DATA[canonicalRoute];
  useEffect(() => {
    if (screen?.kind !== 'purchases') return;
    if (!isLoggedIn) {
      goTo('login', { replace: true });
      return;
    }
    if (route !== canonicalRoute) goTo(canonicalRoute, { replace: true });
  }, [canonicalRoute, goTo, isLoggedIn, route, screen?.kind]);
  if (!screen) return null;
  if (screen.kind === 'purchases' && !isLoggedIn) return null;
  const hasPurchaseData = [purchasedBlanks, purchasedMusicCategories, gameEntitlements].every(Array.isArray);
  const purchaseGroups = screen.kind === 'purchases'
    ? (hasPurchaseData
      ? availablePurchases({ purchasedBlanks, purchasedMusicCategories, gameEntitlements })
      : PURCHASE_GROUPS)
    : [];
  const close = onClose || (() => goBack('karaoke-battle-game'));
  const exitFullscreen = onExitFullscreen || close;
  const classNames = [
    'page',
    'l5x-page',
    'l5x-page--' + screen.kind,
    screen.kind === 'purchases' ? 'is-live-purchases' : '',
    screen.orientation ? 'l5x-page--' + screen.orientation : '',
    screen.answers ? 'is-answers' : 'is-hidden',
  ].filter(Boolean).join(' ');
  const style = {
    '--l5x-width': screen.width + 'px',
    '--l5x-height': screen.height + 'px',
    '--canvas-width': screen.width + 'px',
    '--canvas-target-width': screen.width === 1280 ? '1280px' : '540px',
  };

  return <main className={classNames} style={style} data-layout="5" data-figma-node={screen.figmaNode}>
    {screen.kind !== 'purchases' ? <img className="l5x-reference" src={screen.asset} alt="" aria-hidden="true" /> : null}
    <DynamicHeader {...{ Nav, screen, balance, goBack, goTo, isLoggedIn, profileName }} />
    {screen.kind === 'purchases' ? <PurchaseHeader goBack={goBack} goTo={goTo} /> : null}
    {screen.kind === 'purchases' ? <PurchaseIdentity {...{ balance, profileName }} /> : null}
    <HiddenCopy {...{ categoryTitle, playedSongs }} kind={screen.kind} answers={screen.answers} purchaseGroups={purchaseGroups} />
    {screen.kind === 'viewed-songs' && <ViewedSongs {...{ categoryTitle, onOpenSong, playedSongs }} />}
    {screen.kind === 'song-list' && <>
      <button className="l5x-hit l5x-song-list-close" type="button" onClick={close} aria-label="Закрыть список песен" />
      <button className="l5x-hit l5x-song-list-backdrop" type="button" onClick={close} aria-label="Закрыть список песен" />
    </>}
    {screen.kind === 'purchases'
      ? <PurchaseOverview groups={purchaseGroups} goTo={goTo} onOpenPurchase={onOpenPurchase} />
      : null}
    {screen.kind === 'fullscreen' && <FullscreenHits orientation={screen.orientation} onExit={exitFullscreen} onNewSong={onNewSong} onTogglePause={onTogglePause} />}
  </main>;
}
