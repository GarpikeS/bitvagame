import React, { useEffect, useState } from 'react';
import five from './assets5.json';
import six from './assets6.json';
import { Layout6Collection, LAYOUT6_COLLECTION_ROUTES } from './Layout6Collection.jsx';
import { Layout6Purchase, LAYOUT6_PURCHASE_ROUTES } from './Layout6Purchase.jsx';
import { Layout6Screen, LAYOUT6_SCREEN_ROUTES } from './Layout6Screens.jsx';
import { Layout5Purchase, LAYOUT5_CATEGORY_PRICES, LAYOUT5_PURCHASE_ROUTES } from './Layout5Purchase.jsx';
import { Layout5ExtraScreen, LAYOUT5_EXTRA_ROUTES, isLayout5ExtraRoute, layout5FullscreenRoute } from './Layout5ExtraScreens.jsx';
import { Layout5ReferenceGame } from './Layout5ReferenceGame.jsx';
import { Layout56ReferenceBase, getLayout56ReferenceScreen } from './Layout56ReferenceBase.jsx';
import './layout56.css';
import './layout56-reference-base.css';

export const LAYOUT56_ROUTES = [
  'karaoke-battle', 'karaoke-battle-categories', 'karaoke-battle-game',
  'royal-battle', 'royal-battle-collections',
  ...Object.values(LAYOUT5_PURCHASE_ROUTES),
  ...Object.values(LAYOUT5_EXTRA_ROUTES),
  ...Object.values(LAYOUT6_COLLECTION_ROUTES),
  ...Object.values(LAYOUT6_PURCHASE_ROUTES),
  ...Object.values(LAYOUT6_SCREEN_ROUTES),
];

const sources = { karaoke: five, royal: six };
const featureText = {
  karaoke: [
    'Включаем песню — звучит знакомый трек, но некоторые слова вырезаны.',
    'Слушай внимательно — следи за музыкой и приготовься продолжить текст.',
    'Пропевай пропущенные слова вслух, не сбиваясь с ритма.',
    'Считайте очки — за правильные слова получайте баллы и определите чемпиона караоке-битвы.',
  ],
  royal: [
    'Открыл коробку — и сразу начал играть. Никаких долгих объяснений. Правило одно: побеждает тот, кто наберёт больше всего очков.',
    'Единственная настолка, где игроки не сидят на месте. Живые соревнования, движение и азарт с первой же игры.',
    'Остановите в любой момент и возобновите когда угодно.',
    'Подходит и для детей, и для взрослых — в каждом сборнике указано, нужен ли реквизит.',
  ],
};

const categories = {
  karaoke: [
    { id: 'hits', title: 'Хиты караоке', price: 0, layers: ['category-a1'], tone: 'karaoke' },
    { id: '90s', title: 'Хиты 90-х', price: 50, layers: ['category-a2', 'category-a3'], tone: 'wine' },
    { id: 'girls', title: 'Девичник', price: 50, layers: ['category-b1', 'category-b2'], tone: 'orange' },
    { id: '2000s', title: 'Хиты 2000-х', price: 50, layers: ['category-b3'], tone: 'wine' },
  ],
  royal: [
    { id: 'party', title: 'Вечеринка', price: 0, layers: ['category-a1', 'category-a2'], tone: 'orange' },
    { id: 'all', title: 'Все игры', price: 100, layers: ['category-a3', 'category-a4'], tone: 'orange', available: false },
    { id: 'birthday', title: 'День\nрождения', price: 100, layers: ['category-b1', 'category-b2'], tone: 'orange' },
    { id: 'picnic', title: 'На дачу\nили пикник', price: 100, layers: ['category-b3', 'category-b4'], tone: 'orange', available: false },
  ],
};

const LAYOUT5_CATEGORY_KEY = 'bitva:layout5:karaoke-category';

const karaokeSongs = [
  {
    id: 'stay',
    artist: 'Дискотека Авария',
    title: 'Если хочешь остаться',
  },
  {
    id: 'recognise',
    artist: 'Корни',
    title: 'Ты узнаешь её',
  },
];

function FigmaIcon({ asset, className = '' }) {
  return <img className={`l56-icon ${className}`} src={asset} alt="" aria-hidden="true" />;
}

function SectionHeading({ children, id, small = false }) {
  return <h2 id={id} className={`l56-heading${small ? ' l56-heading--small' : ''}`}>{children}</h2>;
}

function ActionButton({ children, onClick, secondary = false, disabled = false }) {
  return <button type="button" className={`l56-action${secondary ? ' l56-action--secondary' : ''}`} onClick={onClick} disabled={disabled}>{children}</button>;
}

function CategoryArtwork({ game, card }) {
  const source = sources[game];
  return <span className={`l56-category-art l56-category-art--${card.tone}`} aria-hidden="true">
    {card.layers.map(layer => <img key={layer} src={source.assets[layer]} alt="" style={source.layerLayout[layer]} />)}
  </span>;
}

function CategoryCard({ game, card, Coin, onSelect, onInfo }) {
  const comingSoon = card.available === false;
  return <article className={`l56-category l56-category--${game}${comingSoon ? ' is-coming-soon' : ''}`}>
    <CategoryArtwork game={game} card={card} />
    <div className="l56-category-top">
      <h3>{card.title}</h3>
      <button type="button" className="l56-question" disabled={comingSoon} onClick={comingSoon ? undefined : () => onInfo(card)} aria-label={comingSoon ? `${card.title.replaceAll('\n', ' ')} — в разработке` : `Подробнее: ${card.title.replaceAll('\n', ' ')}`}>?</button>
    </div>
    {comingSoon ? <>
      <span className="l56-category-coming-lock" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M8.2 10.25V7.8a3.8 3.8 0 1 1 7.6 0v2.45h1.1c1.16 0 2.1.94 2.1 2.1v6.55c0 1.16-.94 2.1-2.1 2.1H7.1A2.1 2.1 0 0 1 5 18.9v-6.55c0-1.16.94-2.1 2.1-2.1h1.1Zm1.85 0h3.9V7.8a1.95 1.95 0 1 0-3.9 0v2.45Z" />
          <circle cx="12" cy="15.1" r="1.4" />
          <rect x="11.3" y="15.1" width="1.4" height="2.9" rx="0.7" />
        </svg>
      </span>
      <span className="l56-category-coming-label">в разработке</span>
    </> : <button className={`l56-category-action ${card.price && !card.owned ? 'is-paid' : ''}`} type="button" onClick={() => onSelect(card)}>
        {!card.price ? card.action || 'Бесплатно' : card.owned ? 'Играть' : <><Coin /><span>{card.price} монет</span></>}
      </button>}
  </article>;
}

function CategoryGrid({ game, Coin, onSelect, onInfo, cards = categories[game] }) {
  return <div className="l56-category-grid">
    {cards.map(card => <CategoryCard key={card.id} {...{ game, card, Coin, onSelect, onInfo }} />)}
  </div>;
}

function Features({ game }) {
  return <ol className="l56-features" role="list">
    {featureText[game].map((text, index) => <li className="l56-feature" key={text}>
      <div className="l56-feature-photo">
        <img src={sources[game].assets[`feature${index + 1}`]} alt="" />
        <span className="l56-feature-number" aria-hidden="true">{index + 1}</span>
      </div>
      <p>{text}</p>
    </li>)}
  </ol>;
}

function KaraokeRules() {
  return <section className="l56-rules">
    <SectionHeading>ПРАВИЛА ИГРЫ</SectionHeading>
    <ol role="list">
      <li><span aria-hidden="true">1</span><p>Играет музыкальный фрагмент — в тексте на экране <strong>скрыты отдельные слова или строки</strong></p></li>
      <li><span aria-hidden="true">2</span><p>Участник должен <strong>вовремя вступить,</strong> правильно исполнить пропущенные слова и не сбиться с ритма</p></li>
      <li><span aria-hidden="true">3</span><p>Угадал слово точно — <b>+1 балл.</b> Ошибся, пропустил или сильно изменил текст — балл не засчитывается</p></li>
      <li><span aria-hidden="true">4</span><p>Побеждает тот, кто <strong>набрал больше всего очков</strong><br />по итогам всех раундов</p></li>
    </ol>
  </section>;
}

function Requisite() {
  return <section className="l56-requisite">
    <SectionHeading>РЕКВИЗИТ</SectionHeading>
    <div className="l56-requisite-card">
      <FigmaIcon asset={five.assets['guide-icon1']} />
      <div><p>Для игры вам понадобятся лист бумаги, ручка или заметки в телефоне</p>
        <p>Записывайте пропущенные слова и считайте очки — это часть веселья!</p></div>
    </div>
  </section>;
}

function ScoreSystem({ game }) {
  const scores = game === 'karaoke' ? [
    { value: '+1', text: <>за каждое<br />верное слово</>, tone: 'orange' },
    { value: '0', text: <>если ошибся<br />или пропустил<br />слово</>, tone: 'cream' },
    { value: '10', text: <>песен<br />в игре</>, tone: 'cream' },
    { value: <FigmaIcon asset={five.assets.imgGroup} />, text: <>побеждает игрок<br />с наибольшим<br />счётом</>, tone: 'cream' },
  ] : [
    { value: '+1', text: <>за лёгкое<br />задание</>, tone: 'cream' },
    { value: '+2', text: <>за среднее<br />задание</>, tone: 'orange' },
    { value: '+5', text: <>за сложное<br />задание</>, tone: 'red' },
    { value: '10', text: <>игр<br />в сборнике</>, tone: 'white' },
  ];
  return <section className="l56-score-system"><SectionHeading>СИСТЕМА ОЧКОВ</SectionHeading>
    <div className="l56-score-grid">{scores.map((score, index) => <div className={`l56-score l56-score--${score.tone}`} key={index}>
      <div className="l56-score-value">{score.value}</div><p>{score.text}</p>
    </div>)}</div>
  </section>;
}

function RoyalGuide({ catalog = false }) {
  return <section className="l56-royal-guide">
    <div><SectionHeading>{catalog ? <>КАК<br /><em>ИГРАТЬ</em></> : <>ПОНЯТНО<br />С ПЕРВОГО РАЗА</>}</SectionHeading><p>К каждой игре — короткое видео и чёткая инструкция. Никакого чтения на 10 минут — просто смотришь и играешь.</p></div>
    <ul role="list">
      {['Фото/видео-инструкция к каждой игре', 'Текстовые правила — кратко и по делу', 'Объяснение занимает меньше минуты'].map((text, i) => <li key={text}><FigmaIcon asset={six.assets[`guide-icon${3 - i}`]} /><span>{text}</span></li>)}
    </ul>
  </section>;
}

const taskTypes = [
  ['СОЛО', 'игрок выполняет задание самостоятельно', 'imgEditedPhoto47'],
  ['БАТЛ-РОЯЛ', 'все играют против друг друга', 'imgEditedPhoto46'],
  ['КОММАНДОС', 'задание выполняется в команде с другим игроком', 'imgEditedPhoto45'],
  ['ДУЭЛЬ', 'игра проходит между двумя игроками', 'imgEditedPhoto44'],
  ['ИГРАЮТ ВСЕ!', 'в игре принимают участие все игроки', 'imgEditedPhoto43'],
];

function TaskTypes() {
  return <section className="l56-task-types">
    <div className="l56-task-dark"><SectionHeading><em>ТИПЫ</em> ЗАДАНИЙ</SectionHeading>
      <div className="l56-task-grid">{taskTypes.map(([title, text, background], i) => <article className="l56-task-type" key={title}>
        <img className="l56-task-blur" src={six.assets[background]} alt="" />
        <FigmaIcon className="l56-task-emoji" asset={six.assets[`task-icon${i + 1}`]} />
        <div className="l56-task-caption"><h3>{title}</h3><p>{text}</p></div>
      </article>)}</div>
    </div>
    <div className="l56-rounds"><strong>10 раундов</strong><p>Побеждает тот, у кого по итогам 10 раундов окажется больше всего баллов!</p></div>
  </section>;
}

function Recommendations({ goTo }) {
  const cards = [
    // Original image fills (the Figma node renders also include their controls).
    { title: 'Королевская\nбитва', src: '/figma-assets/6cab7f10a2bf-1be5177ea43a48b3a28b82f9c9c1bd5744646240.png', route: 'royal-battle' },
    { title: 'Караоке-\nбитва', src: '/figma-assets/8c6a3f133658-5a6f20e6bbe25cd1d8c107b79cf60296371605b1.png', route: 'karaoke-battle' },
    { title: 'Распределитель\nролей в мафии', src: '/figma-assets/f938211b07db-e8c345335df0190cd56fbc87085a3a7b7d0ace62.png', route: 'game-detail' },
  ];
  return <section className="l56-recommendations"><SectionHeading small>ВАМ МОЖЕТ ПОНРАВИТЬСЯ</SectionHeading>
    <div className="l56-recommendation-grid">{cards.map(card => <article key={card.route} className="l56-recommendation">
      <img className="l56-recommendation-bg" src={card.src} alt="" />
      <h3>{card.title}</h3>
      <button className="l56-question" type="button" onClick={() => goTo(card.route)} aria-label={`Об игре ${card.title.replaceAll('\n', ' ')}`}>?</button>
      <button className="l56-play" type="button" aria-label={`Играть: ${card.title.replaceAll('\n', ' ')}`} onClick={() => goTo(card.route)}><FigmaIcon asset={six.assets.imgIconsFillPlay} /></button>
    </article>)}</div>
    <ActionButton secondary onClick={() => goTo('home')}>Показать все игры</ActionButton>
  </section>;
}

function CatalogGroup({ title, cards, ...props }) {
  const [expanded, setExpanded] = useState(false);
  return <section className="l56-catalog-group">
    <SectionHeading>{title}</SectionHeading>
    <CategoryGrid {...props} cards={expanded ? cards : cards.slice(0, 2)} />
    <ActionButton secondary disabled={cards.length <= 2} onClick={() => setExpanded(value => !value)}>
      {expanded ? 'Свернуть' : props.game === 'royal' ? 'Показать все сборники' : 'Показать все категории'}
    </ActionButton>
  </section>;
}

function Catalog({ game, Coin, onSelect, onInfo, purchasedCategories, isLoggedIn }) {
  const cards = categories[game].map(card => ({ ...card, owned: !card.price || (isLoggedIn && purchasedCategories.includes(`${game}:${card.id}`)) }));
  const shared = { game, Coin, onSelect, onInfo };
  const owned = cards.filter(card => card.owned);
  const available = cards.filter(card => !card.owned);
  return <div className="l56-catalog-page">
    <header className="l56-catalog-banner">
      <img src={sources[game].assets.catalogBannerArt} alt="" />
      <span className="l56-catalog-banner-shade" aria-hidden="true" />
      <h1>{game === 'royal' ? 'КОРОЛЕВСКАЯ БИТВА' : 'КАРАОКЕ-БИТВА'}</h1>
    </header>
    <CatalogGroup {...shared} cards={owned} title={game === 'royal' ? 'МОИ СБОРНИКИ' : 'МОИ КАТЕГОРИИ'} />
    <div className="l56-catalog-buy"><CatalogGroup {...shared} cards={available} title={<>КУПИТЬ <em>{game === 'royal' ? 'СБОРНИКИ' : 'КАТЕГОРИИ'}</em></>} /></div>
    <section className="l56-catalog-instructions">
      {game === 'royal' ? <RoyalGuide catalog /> : <KaraokeRules />}
      <ActionButton onClick={() => onSelect(owned[0])}>Начать игру</ActionButton>
    </section>
  </div>;
}

export function Layout56Routes({
  route,
  goTo,
  goBack,
  Nav,
  Footer,
  Coin,
  balance,
  isLoggedIn,
  profileName,
  purchasedCategories = [],
  purchasedBlanks = [],
  purchasedMusicCategories = [],
  favoriteIds = new Set(),
  onToggleFavorite,
  karaokeCategoryId,
  setKaraokeCategoryId,
  karaokeStage,
  setKaraokeStage,
  karaokeSongIndex,
  setKaraokeSongIndex,
  karaokeRemaining,
  setKaraokeRemaining,
  karaokePlayedSongIndexes = [],
  setKaraokePlayedSongIndexes,
  purchaseBusy = false,
  purchaseError = '',
  onPurchaseGameEntitlement,
  onOpenGameEntitlementTopUp,
  onOpenBalance,
}) {
  const game = route.startsWith('royal-battle') ? 'royal' : 'karaoke';
  const catalogRoute = game === 'royal' ? 'royal-battle-collections' : 'karaoke-battle-categories';
  const isCatalog = route === catalogRoute;
  const isKaraokeGame = route === 'karaoke-battle-game';
  const referenceScreen = getLayout56ReferenceScreen(route, purchasedCategories);
  const showCatalog = () => goTo(catalogRoute);
  const favorite = Boolean(isLoggedIn && favoriteIds instanceof Set && favoriteIds.has(game));
  const toggleFavorite = () => onToggleFavorite?.(game);
  const selectedKaraokeCategory = categories.karaoke.find(card => card.id === karaokeCategoryId) || null;
  const openKaraokeCategory = card => {
    setKaraokeCategoryId(card.id);
    setKaraokeSongIndex(0);
    setKaraokeRemaining(10);
    setKaraokePlayedSongIndexes([]);
    setKaraokeStage('cover');
    goTo('karaoke-battle-game');
  };
  const openPurchasedItem = (kind, categoryId) => {
    if (kind === 'karaoke-battle' && categoryId) {
      const purchasedCategory = categories.karaoke.find(card => (
        card.id === categoryId && purchasedCategories.includes(`karaoke:${card.id}`)
      ));
      if (purchasedCategory) {
        openKaraokeCategory(purchasedCategory);
        return;
      }
    }
    goTo(kind === 'music-loto'
      ? 'music-blanks'
      : kind === 'royal-battle'
        ? 'royal-battle-collections'
        : 'karaoke-battle-categories');
  };
  const onSelect = card => {
    if (!card) return;
    if (card.available === false) return;
    if (game === 'karaoke' && card.price && !card.owned) {
      if (card.id === 'girls') {
        goTo(LAYOUT5_PURCHASE_ROUTES.girls);
        return;
      }
      if (card.id === '90s') {
        goTo(balance < LAYOUT5_CATEGORY_PRICES['karaoke:90s']
          ? LAYOUT5_PURCHASE_ROUTES.insufficient
          : LAYOUT5_PURCHASE_ROUTES.confirm);
        return;
      }
      if (card.id === '2000s') {
        goTo(balance < LAYOUT5_CATEGORY_PRICES['karaoke:2000s']
          ? LAYOUT5_PURCHASE_ROUTES.insufficient2000s
          : LAYOUT5_PURCHASE_ROUTES.confirm2000s);
        return;
      }
      return;
    }
    if (game === 'karaoke') {
      openKaraokeCategory(card);
      return;
    }
    const collectionRoute = LAYOUT6_COLLECTION_ROUTES[card.id];
    if (collectionRoute) {
      goTo(collectionRoute);
      return;
    }
  };
  const onInfo = card => {
    if (!card || card.available === false) return;
    if (game === 'karaoke') {
      goTo(LAYOUT5_EXTRA_ROUTES.songList);
      return;
    }
    if (game === 'royal' && card.id === 'party') {
      goTo(LAYOUT6_COLLECTION_ROUTES.party);
      return;
    }
    if (game === 'royal' && card?.id === 'birthday') {
      goTo(LAYOUT6_SCREEN_ROUTES.info);
      return;
    }
  };
  const referenceCards = categories[game].map(card => ({
    ...card,
    owned: !card.price || (isLoggedIn && purchasedCategories.includes(`${game}:${card.id}`)),
  }));
  const resolveReferenceActionRoute = card => {
    if (!card) return undefined;
    if (card.available === false) return undefined;
    if (game === 'royal') return LAYOUT6_COLLECTION_ROUTES[card.id];
    if (!card.price || card.owned) return 'karaoke-battle-game';
    if (card.id === 'girls') return LAYOUT5_PURCHASE_ROUTES.girls;
    if (card.id === '90s') {
      return balance < LAYOUT5_CATEGORY_PRICES['karaoke:90s']
        ? LAYOUT5_PURCHASE_ROUTES.insufficient
        : LAYOUT5_PURCHASE_ROUTES.confirm;
    }
    if (card.id === '2000s') {
      return balance < LAYOUT5_CATEGORY_PRICES['karaoke:2000s']
        ? LAYOUT5_PURCHASE_ROUTES.insufficient2000s
        : LAYOUT5_PURCHASE_ROUTES.confirm2000s;
    }
    return undefined;
  };
  const navProps = { goTo, goBack, balance, isLoggedIn, profileName };

  useEffect(() => {
    if (game !== 'karaoke') return;
    const selected = categories.karaoke.find(card => card.id === karaokeCategoryId);
    const allowed = !selected?.price || purchasedCategories.includes(`karaoke:${selected?.id}`);
    if (selected && !allowed) {
      setKaraokeCategoryId('');
      return;
    }
    try {
      if (karaokeCategoryId) window.localStorage.setItem(LAYOUT5_CATEGORY_KEY, karaokeCategoryId);
      else window.localStorage.removeItem(LAYOUT5_CATEGORY_KEY);
    } catch { /* Storage can be unavailable in private browsing. */ }
  }, [game, karaokeCategoryId, purchasedCategories]);

  useEffect(() => {
    if (!isKaraokeGame || karaokeStage !== 'playing') return undefined;
    const timer = window.setTimeout(() => setKaraokeStage('ended'), 12000);
    return () => window.clearTimeout(timer);
  }, [isKaraokeGame, karaokeSongIndex, karaokeStage]);

  const advanceKaraokeSong = () => {
    const choices = karaokeSongs.map((_, index) => index).filter(index => index !== karaokeSongIndex);
    const next = choices[Math.floor(Math.random() * choices.length)] ?? 0;
    setKaraokePlayedSongIndexes(value => [...value, karaokeSongIndex]);
    setKaraokeRemaining(value => Math.max(0, value - 1));
    setKaraokeSongIndex(next);
    setKaraokeStage('playing');
  };
  const resetKaraokeGame = () => {
    setKaraokeSongIndex(0);
    setKaraokePlayedSongIndexes([]);
    setKaraokeRemaining(10);
    setKaraokeStage(selectedKaraokeCategory ? 'cover' : 'empty');
  };
  const fullscreenRoute = answers => layout5FullscreenRoute({
    answers,
    orientation: window.innerWidth > window.innerHeight ? 'landscape' : 'portrait',
  });

  const isKaraokePurchase = Object.values(LAYOUT5_PURCHASE_ROUTES).includes(route);
  if (isKaraokePurchase) {
    const isTwoThousandsPurchase = [
      LAYOUT5_PURCHASE_ROUTES.confirm2000s,
      LAYOUT5_PURCHASE_ROUTES.insufficient2000s,
      LAYOUT5_PURCHASE_ROUTES.success2000s,
    ].includes(route);
    const purchaseCategoryId = isTwoThousandsPurchase ? '2000s' : '90s';
    const purchaseEntitlementId = `karaoke:${purchaseCategoryId}`;
    const insufficientRoute = isTwoThousandsPurchase
      ? LAYOUT5_PURCHASE_ROUTES.insufficient2000s
      : LAYOUT5_PURCHASE_ROUTES.insufficient;
    const state = route === insufficientRoute
      && balance >= LAYOUT5_CATEGORY_PRICES[purchaseEntitlementId] ? 'confirm' : undefined;
    const startCategory = id => {
      const card = categories.karaoke.find(item => item.id === id);
      if (card) openKaraokeCategory(card);
    };
    return <Layout5Purchase
      route={route}
      state={state}
      Nav={Nav}
      balance={balance}
      isLoggedIn={isLoggedIn}
      profileName={profileName}
      goTo={goTo}
      goBack={goBack}
      busy={purchaseBusy}
      error={purchaseError}
      onBack={() => goBack('karaoke-battle-categories')}
      onConfirmPurchase={onPurchaseGameEntitlement ? () => onPurchaseGameEntitlement(purchaseEntitlementId) : undefined}
      onTopUp={onOpenGameEntitlementTopUp ? () => onOpenGameEntitlementTopUp(purchaseEntitlementId) : undefined}
      onStartGame={() => startCategory(purchaseCategoryId)}
      onReturnToGame={() => startCategory(purchaseCategoryId)}
      onSelectCategory={() => goTo('karaoke-battle-categories')}
      onPurchaseGirls={onPurchaseGameEntitlement ? async () => {
        const result = await onPurchaseGameEntitlement('karaoke:girls');
        if (result) startCategory('girls');
      } : undefined}
      onShowPlayedSongs={() => goTo(LAYOUT5_EXTRA_ROUTES.viewedSongs)}
      onAnnounceWinner={() => { setKaraokeStage('ended'); goTo('karaoke-battle-game'); }}
      onNewGame={() => { resetKaraokeGame(); goTo('karaoke-battle-game'); }}
      playedCount={karaokePlayedSongIndexes.length}
    />;
  }

  if (isLayout5ExtraRoute(route)) {
    const isFullscreen = route.startsWith('karaoke-battle-fullscreen-');
    const isLandscape = route.includes('-landscape-');
    return <Layout5ExtraScreen
      route={route}
      Nav={Nav}
      balance={balance}
      goBack={goBack}
      goTo={goTo}
      isLoggedIn={isLoggedIn}
      profileName={profileName}
      purchasedBlanks={purchasedBlanks}
      purchasedMusicCategories={purchasedMusicCategories}
      gameEntitlements={purchasedCategories}
      categoryTitle={selectedKaraokeCategory?.title || ''}
      playedSongs={karaokePlayedSongIndexes.map((songIndex, occurrence) => ({
        ...(karaokeSongs[songIndex] || karaokeSongs[0]),
        occurrence,
        songIndex,
      }))}
      onClose={() => goBack(route === LAYOUT5_EXTRA_ROUTES.songList ? 'karaoke-battle-categories' : 'karaoke-battle-game')}
      onExitFullscreen={() => goTo('karaoke-battle-game')}
      onNewSong={() => {
        advanceKaraokeSong();
        if (isFullscreen) goTo(layout5FullscreenRoute({ orientation: isLandscape ? 'landscape' : 'portrait' }));
      }}
      onOpenPurchase={openPurchasedItem}
      onOpenSong={index => { setKaraokeSongIndex(index % karaokeSongs.length); setKaraokeStage('ended'); goTo('karaoke-battle-game'); }}
      onTogglePause={() => setKaraokeStage(value => value === 'paused' ? 'playing' : 'paused')}
    />;
  }

  const isRoyalPurchase = Object.values(LAYOUT6_PURCHASE_ROUTES).includes(route);
  if (isRoyalPurchase) {
    const state = route === LAYOUT6_PURCHASE_ROUTES.insufficient && balance >= 100 ? 'confirm' : undefined;
    return <Layout6Purchase
      route={route}
      state={state}
      Nav={Nav}
      Footer={Footer}
      balance={balance}
      isLoggedIn={isLoggedIn}
      profileName={profileName}
      goTo={goTo}
      goBack={goBack}
      busy={purchaseBusy}
      error={purchaseError}
      onBack={() => goBack(LAYOUT6_COLLECTION_ROUTES.birthday)}
      onTopUp={onOpenGameEntitlementTopUp ? () => onOpenGameEntitlementTopUp('royal:birthday') : undefined}
      onConfirmPurchase={onPurchaseGameEntitlement ? () => onPurchaseGameEntitlement('royal:birthday') : undefined}
      onStartGame={() => goTo(LAYOUT6_SCREEN_ROUTES.game)}
      onReturnToGame={() => goTo(LAYOUT6_COLLECTION_ROUTES.birthday)}
    />;
  }

  const isRoyalScreen = Object.values(LAYOUT6_SCREEN_ROUTES).includes(route);
  if (isRoyalScreen) {
    return <Layout6Screen
      route={route}
      Nav={Nav}
      balance={balance}
      isLoggedIn={isLoggedIn}
      profileName={profileName}
      goTo={goTo}
      goBack={goBack}
      onClose={() => goBack(LAYOUT6_COLLECTION_ROUTES.birthday)}
    />;
  }

  const routeRoyalCollectionId = Object.entries(LAYOUT6_COLLECTION_ROUTES)
    .find(([, collectionRoute]) => collectionRoute === route)?.[0] || '';
  if (routeRoyalCollectionId) {
    const owned = routeRoyalCollectionId === 'party'
      || (isLoggedIn && purchasedCategories.includes(`royal:${routeRoyalCollectionId}`));
    const startCollection = () => {
      if (routeRoyalCollectionId === 'birthday') goTo(LAYOUT6_SCREEN_ROUTES.game);
    };
    return <Layout6Collection
      collection={routeRoyalCollectionId}
      owned={owned}
      Nav={Nav}
      Footer={Footer}
      balance={balance}
      isLoggedIn={isLoggedIn}
      profileName={profileName}
      goTo={goTo}
      goBack={goBack}
      onBuyCollection={() => goTo(!isLoggedIn || balance < 100 ? LAYOUT6_PURCHASE_ROUTES.insufficient : LAYOUT6_PURCHASE_ROUTES.confirm)}
      onBuyProps={() => goTo(LAYOUT6_SCREEN_ROUTES.props)}
      gameAvailable={routeRoyalCollectionId === 'birthday'}
      onStart={startCollection}
      onOpenTaskList={() => {
        if (routeRoyalCollectionId === 'birthday') goTo(LAYOUT6_SCREEN_ROUTES.tasks);
      }}
      onNewGame={startCollection}
    />;
  }

  if (isKaraokeGame) {
    return <Layout5ReferenceGame
      Nav={Nav}
      balance={balance}
      category={selectedKaraokeCategory}
      goBack={goBack}
      goTo={goTo}
      isLoggedIn={isLoggedIn}
      onAnnounceWinner={() => setKaraokeStage('ended')}
      onBack={() => goBack('karaoke-battle-categories')}
      onExpand={answers => goTo(fullscreenRoute(answers))}
      onHome={() => goTo('home')}
      onNewGame={resetKaraokeGame}
      onNewSong={advanceKaraokeSong}
      onOpenBalance={onOpenBalance || (() => goTo('balance-top-up'))}
      onOpenProfile={() => goTo(isLoggedIn ? 'profile' : 'login')}
      onPlayedSongs={() => goTo(LAYOUT5_EXTRA_ROUTES.viewedSongs)}
      onPrivacy={() => goTo('privacy')}
      onSelectCategory={() => goTo('karaoke-battle-categories')}
      onStart={() => setKaraokeStage('playing')}
      onToggleAnswers={() => setKaraokeStage(value => value === 'answers' ? 'ended' : 'answers')}
      onTogglePause={() => setKaraokeStage(value => value === 'playing' ? 'paused' : 'playing')}
      playedCount={karaokePlayedSongIndexes.length}
      profileName={profileName}
      remaining={karaokeRemaining}
      setStage={setKaraokeStage}
      song={karaokeSongs[karaokeSongIndex] || karaokeSongs[0]}
      songIndex={karaokeSongIndex}
      stage={karaokeStage}
    />;
  }

  return <main
    className={`page l56-page l56-page--${game}${isCatalog ? ' l56-page--catalog' : ''}`}
    data-layout={game === 'karaoke' ? '5' : '6'}
    data-render-mode={referenceScreen ? 'figma-reference' : 'live'}
    data-figma-node={referenceScreen?.figmaNode}
    style={referenceScreen ? { '--l56r-height': `${referenceScreen.height}px` } : undefined}
  >
    {referenceScreen ? <Layout56ReferenceBase
      route={route}
      screen={referenceScreen}
      cards={referenceCards}
      Nav={Nav}
      balance={balance}
      favorite={favorite}
      goBack={goBack}
      goTo={goTo}
      isLoggedIn={isLoggedIn}
      onCategoryAction={onSelect}
      onCategoryInfo={onInfo}
      onFavorite={toggleFavorite}
      onStart={isCatalog ? () => onSelect(referenceCards.find(card => card.owned) || referenceCards[0]) : showCatalog}
      profileName={profileName}
      resolveActionRoute={resolveReferenceActionRoute}
    /> : !isCatalog ? <>
      <section className="l56-hero">
        <img className="l56-hero-image" src={sources[game].assets.hero} alt={game === 'karaoke' ? 'Компания поёт караоке' : 'Игра с красными стаканчиками'} />
        <div className="l56-hero-shade" />
        <div className="l56-nav"><Nav {...navProps} title="Главная" /></div>
        <div className="l56-tags"><span><Coin />за монеты</span><span>от 2-х человек</span><span>{game === 'karaoke' ? 'с реквизитом' : 'без реквизита'}</span></div>
        <button type="button" className={`l56-favorite${favorite ? ' is-active' : ''}`} aria-label={favorite ? 'Убрать из избранного' : 'Добавить в избранное'} aria-pressed={favorite} onClick={toggleFavorite}>
          <FigmaIcon asset={six.assets.imgIconsOutlineHeart} />
        </button>
      </section>
      <div className="l56-paper">
        <header className="l56-intro">
          <h1 className="l56-heading">{game === 'karaoke' ? <>КАРАОКЕ-<em>БИТВА</em></> : <><em>КОРОЛЕВСКАЯ</em> БИТВА</>}</h1>
          <p>{game === 'karaoke' ? 'Проверьте, кто из вас лучше знает любимые песни!' : 'Весёлые соревнования для вечеринок, семьи и корпоративов. Открыл — и сразу играй!'}</p>
        </header>
        <div className="l56-main-content">
          <Features game={game} />
          <ActionButton onClick={showCatalog}>Начать игру</ActionButton>
          {game === 'karaoke' ? <><KaraokeRules /><Requisite /><ScoreSystem game={game} /></> : <><RoyalGuide /><ScoreSystem game={game} /><TaskTypes /></>}
          <section className="l56-catalog-section">
            <SectionHeading>{game === 'karaoke' ? 'ВЫБРАТЬ КАТЕГОРИЮ' : 'СБОРНИКИ ИГР'}</SectionHeading>
            <CategoryGrid {...{ game, Coin, onSelect, onInfo }} cards={referenceCards} />
            <ActionButton secondary onClick={showCatalog}>{game === 'karaoke' ? 'Показать все категории' : 'Показать все сборники'}</ActionButton>
          </section>
          {game === 'royal' && <section className="l56-video"><SectionHeading>ВИДЕО С ИГРОЙ</SectionHeading><div className="l56-video-surface"><FigmaIcon asset={six.assets.imgFrame6461} /></div><p>Мы собрали нарезку от наших игроков со всей России, чтобы показать, какие эмоции вы можете испытать вместе с друзьями. Уделите просмотру 1 минуту и сделайте выбор в пользу Битвы &lt;3.</p></section>}
          <Recommendations goTo={goTo} />
        </div>
      </div>
    </> : <>
      <div className="l56-nav"><Nav {...navProps} backRoute={game === 'royal' ? 'royal-battle' : 'karaoke-battle'} title={game === 'royal' ? 'Королевская битва' : 'Караоке-битва'} /></div>
      <Catalog key={game} {...{ game, Coin, onSelect, onInfo, purchasedCategories, isLoggedIn }} />
    </>}
    {!referenceScreen && <Footer />}
  </main>;
}
