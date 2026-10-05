import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import JSZip from 'jszip';
import { authApi, AuthApiError } from './auth-api.js';
import { selectRandomBlankFiles } from './blank-pack.js';
import { pickRandomMusicIndex } from './music-playlist.js';
import { useYandexAsset, useYandexBlobAsset } from './yandex-public-assets.js';
import './styles.css';
import { Layout56Routes, LAYOUT56_ROUTES } from './games/layout56/Layout56.jsx';
import { Layout7Routes } from './games/layout7/Layout7Routes.jsx';
import { LAYOUT7_ROUTES, isLayout7Route } from './games/layout7/routes.js';
import { LAYOUT5_PURCHASE_ROUTES } from './games/layout56/Layout5Purchase.jsx';
import { LAYOUT5_EXTRA_ROUTES } from './games/layout56/Layout5ExtraScreens.jsx';
import { canUseLayout5AuthSuccessReference, Layout5AuthSuccessReference } from './games/layout56/Layout5AuthSuccess.jsx';
import { LAYOUT6_PURCHASE_ROUTES } from './games/layout56/Layout6Purchase.jsx';

const PROMO_LIMIT = 11;
const PURCHASED_BLANKS_STORAGE_KEY = 'bitva_purchased_blanks';
const BLANK_ORDER_STORAGE_KEY = 'bitva_blank_order';
const PURCHASED_CATEGORIES_STORAGE_KEY = 'bitva_purchased_categories';
const LAYOUT5_CATEGORY_STORAGE_KEY = 'bitva:layout5:karaoke-category';
const BLANK_MIN_COUNT = 2;
const BLANK_MAX_COUNT = 30;
const BLANK_UNIT_PRICE = 50;
const MUSIC_TOTAL_SONGS = 60;
const YANDEX_LOTO_PUBLIC_KEY = 'https://disk.yandex.ru/d/5Ch7zpuhfTzXUg';
const SUPPORT_TELEGRAM_URL = 'https://t.me/bitva_org';

const GAME_ENTITLEMENT_PURCHASES = Object.freeze({
  'royal:birthday': {
    paymentIntent: 'royal-birthday', price: 100, authIntent: 'royal-purchase',
    confirmRoute: LAYOUT6_PURCHASE_ROUTES.confirm,
    insufficientRoute: LAYOUT6_PURCHASE_ROUTES.insufficient,
    successRoute: LAYOUT6_PURCHASE_ROUTES.success,
  },
  'karaoke:90s': {
    paymentIntent: 'karaoke-90s', price: 50, authIntent: 'category-purchase',
    confirmRoute: LAYOUT5_PURCHASE_ROUTES.confirm,
    insufficientRoute: LAYOUT5_PURCHASE_ROUTES.insufficient,
    successRoute: LAYOUT5_PURCHASE_ROUTES.success,
  },
  'karaoke:girls': {
    paymentIntent: 'karaoke-girls', price: 50, authIntent: 'category-purchase',
    confirmRoute: LAYOUT5_PURCHASE_ROUTES.girls,
    insufficientRoute: LAYOUT5_PURCHASE_ROUTES.girls,
    successRoute: LAYOUT5_PURCHASE_ROUTES.girls,
  },
  'karaoke:2000s': {
    paymentIntent: 'karaoke-2000s', price: 50, authIntent: 'category-purchase',
    confirmRoute: LAYOUT5_PURCHASE_ROUTES.confirm2000s,
    insufficientRoute: LAYOUT5_PURCHASE_ROUTES.insufficient2000s,
    successRoute: LAYOUT5_PURCHASE_ROUTES.success2000s,
  },
  ...Object.fromEntries(
    ['90', '2000', '2010'].flatMap(decade => [1].map(setNumber => {
      const id = decade + '-' + setNumber;
      return ['karaoke:' + id, {
        paymentIntent: 'karaoke-' + id,
        price: 50,
        authIntent: 'category-purchase',
        confirmRoute: 'karaoke-battle-categories',
        insufficientRoute: 'balance-top-up',
        successRoute: 'karaoke-battle-categories',
      }];
    })),
  ),
});

function entitlementPurchaseByIntent(intent) {
  return Object.entries(GAME_ENTITLEMENT_PURCHASES)
    .find(([, purchase]) => purchase.paymentIntent === intent) || null;
}

let lotoCatalogCache = null;
let lotoCatalogPromise = null;

function loadLotoCatalog() {
  if (lotoCatalogCache) return Promise.resolve(lotoCatalogCache);
  if (!lotoCatalogPromise) {
    lotoCatalogPromise = fetch('/loto/catalog.json')
      .then((response) => {
        if (!response.ok) throw new Error(`Loto catalog request failed: ${response.status}`);
        return response.json();
      })
      .then((catalog) => {
        lotoCatalogCache = catalog;
        return catalog;
      })
      .catch((error) => {
        lotoCatalogPromise = null;
        throw error;
      });
  }
  return lotoCatalogPromise;
}

const APP_ROUTES = new Set([
  ...LAYOUT56_ROUTES,
  ...LAYOUT7_ROUTES,
  'home',
  'logged-in-home',
  'profile',
  'favorites',
  'forms',
  'register',
  'register-email-exists',
  'register-code',
  'register-success',
  'auth-register-success',
  'login',
  'login-code',
  'recovery-code',
  'new-password',
  'auth-login-success',
  'privacy',
  'game-detail',
  'music-detail',
  'music-buy-blanks',
  'music-blanks',
  'music-game',
  'music-songs',
  'music-new-game',
  'music-winner',
  'buy-blanks',
  'balance-top-up',
]);

const ROUTE_ALIASES = Object.freeze({
  purchases: LAYOUT5_EXTRA_ROUTES.purchases,
  [LAYOUT5_EXTRA_ROUTES.legacyPurchases]: LAYOUT5_EXTRA_ROUTES.purchases,
  'karaoke-detail': 'karaoke-battle',
  'karaoke-categories': 'karaoke-battle-categories',
  'karaoke-splash': 'karaoke-battle-game',
  'karaoke-game': 'karaoke-battle-game',
  'karaoke-new-game': 'karaoke-battle-game',
  'karaoke-winner': 'karaoke-battle-game',
  'karaoke-category-purchase': LAYOUT5_PURCHASE_ROUTES.confirm,
  'karaoke-category-success': LAYOUT5_PURCHASE_ROUTES.success,
  'karaoke-correct-answers': LAYOUT5_EXTRA_ROUTES.viewedSongs,
});

const CLOSED_GAME_ROUTE_PATTERN = /^royal-battle(?:$|-)/;
const CLOSED_GAME_SCROLL_TARGET = 'games';
const CLOSED_GAME_PREVIEW_ENABLED = import.meta.env.MODE === 'development'
  || import.meta.env.VITE_ENABLE_CLOSED_GAMES === 'true';

const PROTECTED_ROUTES = new Set([
  'logged-in-home',
  'profile',
  'favorites',
  'forms',
  'register-success',
  'auth-register-success',
  'auth-login-success',
  'buy-blanks',
  'balance-top-up',
  ...Object.values(LAYOUT5_PURCHASE_ROUTES),
  LAYOUT5_EXTRA_ROUTES.purchases,
  ...Object.values(LAYOUT6_PURCHASE_ROUTES),
]);

const ROYAL_BIRTHDAY_ENTITLEMENT_ROUTES = new Set([
  'royal-battle-game',
  'royal-battle-tasks',
  LAYOUT6_PURCHASE_ROUTES.success,
]);

const assets = {
  royal: '/figma-assets/6cab7f10a2bf-1be5177ea43a48b3a28b82f9c9c1bd5744646240.png',
  karaoke: '/figma-assets/8c6a3f133658-5a6f20e6bbe25cd1d8c107b79cf60296371605b1.png',
  mafia: '/figma-assets/f938211b07db-e8c345335df0190cd56fbc87085a3a7b7d0ace62.png',
  musical: '/figma-assets/f71b8033bf68-951f97ada74b1cebfa157856986ae24a0e6b070e.png',
  heart: '/figma-assets/572a0a0d98ac-81d9372e753489636c48fc165cba082f96daf840.svg',
  gameHero: '/generated/game-hero-clean.png',
  gamePhoneScreen: '/generated/phone-screen-figma-hd.png',
  homeHeroArtBase: '/figma-assets/d2fd05d53625-ac9f8a1085d1bbbcccd408b33a6280f9eeec10aa.png',
  homeHeroArtGlow: '/figma-assets/b4a81b246a05-9e7b0a6565f0983a71d5d9e7862269606d99681f.png',
  homeHeroLogo: '/figma-assets/home-hero-union-1-1213.svg',
  homeHeroTitle: '/figma-assets/home-hero-title-subtract-1-1238.svg',
  brandLogo: '/generated/nav-logo-transparent.png',
  brandLetters: '/figma-assets/db54e4c978b8-dc9b40c6007f71ca112744565d993c7891cb4a8f.svg',
  brandZigTopLeft: '/figma-assets/d714d37ebd8f-6607c489f6adc09b416367cdeb30e22948f8981f.svg',
  brandZigBottom: '/figma-assets/8d58e70d785c-774afda552e0a9e6f7c9894ddfc124ae595ce5c9.svg',
  brandZigShort: '/figma-assets/551f570c7bf0-894b63efb0a473e7807bc5a5aeb2b295cc32daf4.svg',
  brandZigTopRight: '/figma-assets/822388020acf-bb54aa5177a25c9a47b2a33fdfbe2d40dcffd4dd.svg',
  preparedHat: '/generated/figma-detail/prepared-hat.svg',
  preparedGlasses: '/generated/figma-detail/prepared-glasses.svg',
  preparedCardLogo: '/generated/figma-detail/prepared-card-logo.svg',
  roleCardLeftSymbol: '/generated/figma-detail/role-card-left-symbol.svg',
  roleCardDoctor: '/generated/figma-detail/role-card-doctor.svg',
  roleCardMafia: '/generated/figma-detail/role-card-mafia.svg',
  roleCardMafiaSymbol: '/generated/figma-detail/role-card-mafia-symbol.svg',
  mafiaLogoMark: '/generated/mafia-phone-logo-transparent-clean.png',
  mafiaLogoCompare: '/generated/mafia-logo-compare-transparent.png',
  mafiaFastIcon: '/generated/mafia-fast-icon-figma-full.png',
  howHand: '/generated/figma-detail/how-hand.png',
  howTable: '/generated/figma-detail/how-table.png',
  howVictory: '/generated/figma-detail/how-victory.png',
  musicHero: '/figma-assets/music-detail-hero-party.png',
  musicPrep: '/generated/music-prep-figma-source.jpg',
  musicBlankSheet: '/figma-assets/c3a8db0f0d8d-75230d066d59170147e77f50248f1d01f54380d5.png',
  musicGameEmptySheet: '/figma-assets/music-game-empty-sheet.png',
  musicFeaturePrint: '/figma-assets/music-feature-print-b.png',
  musicFeatureLaptop: '/figma-assets/music-feature-laptop.png',
  musicFeatureCrossout: '/figma-assets/music-feature-crossout.png',
  musicFeatureBlank: '/figma-assets/music-feature-blank-overlay.png',
  musicTipOpen: '/figma-assets/e00ff63db597-f0d33c799e4a064f09cd0e367814499c135dfcff.svg',
  musicTipDevice: '/figma-assets/e40d61d6d116-0be492e0497526803ef67a04ac46423589ae2bc9.svg',
  musicTipSing: '/figma-assets/91724ae98744-265a747ccb2677806befc0f452af359d266a2120.svg',
  figmaCoin: '/generated/balance-coin-clean.png',
  karaokeHero: '/figma-assets/0807ad379838-5d001430ce40e9374d1e203e61cc40140fd19cff.png',
  karaokeHeroFigure: '/figma-assets/88b68264c332-43f08b5309f1b0a4d252b50417b10f6507b58621.png',
  karaokeTitleMark: '/figma-assets/db3ee5025d0d-eff350df935e08cee1bf4380d163052edc8762be.svg',
};

const games = [
  {
    id: 'musical',
    title: 'Музыкальное лото',
    image: assets.musical,
    tags: ['free'],
    people: 'от 4-х человек',
    props: 'бланки внутри',
    detailRoute: 'music-detail',
  },
  {
    id: 'mafia',
    title: 'Распределитель ролей в мафии',
    image: assets.mafia,
    tags: ['free', 'no-props'],
    people: 'от 3-х человек',
    props: 'без реквизита',
    detail: true,
    detailRoute: 'game-detail',
  },
  {
    id: 'royal',
    title: 'Королевская битва',
    image: assets.royal,
    tags: ['free'],
    people: 'от 3-х человек',
    props: 'без реквизита',
    detailRoute: 'royal-battle',
    comingSoon: true,
  },
  {
    id: 'karaoke',
    title: 'Караоке-битва',
    image: assets.karaoke,
    tags: ['free'],
    people: 'от 2-х человек',
    props: 'без реквизита',
    detailRoute: 'karaoke-battle',
  },
];

const DEFAULT_FAVORITE_IDS = games.map((game) => game.id);

const MUSIC_SONGS = [
  'Кино — Группа крови на рукаве, мой порядковый...',
  'Miyagi & Эндшпиль — I Got Love',
  'Машина Времени — Поворот',
  'Little Big — Skibidi',
  'Альянс — На заре',
  't.A.T.u. — All the Things She Said',
  'Алла Пугачёва — Арлекино',
  'Алла Пугачёва — Арлекино',
  'Алла Пугачёва — Арлекино',
  'Алла Пугачёва — Арлекино',
];

const MUSIC_CATEGORIES = ['Девичник', 'Хиты 90-х', 'Хиты 2000-х', 'Хиты караоке'];
const DEFAULT_MUSIC_CATEGORY = 'Хиты караоке';
const MAFIA_GAME_URL = 'https://mafia1.ru/bitvagame';
const MUSIC_CATEGORY_COVERS = {
  'Девичник': {
    image: '/figma-assets/music-category-devichnik-figma.png',
    tone: 'devichnik',
    fullArtwork: true,
  },
  'Хиты 90-х': {
    image: '/figma-assets/music-category-hits-90.png',
    tone: 'hits-90',
    yearLabel: '90x',
  },
  'Хиты 2000-х': {
    image: assets.musical,
    tone: 'hits-2000',
  },
  'Хиты караоке': {
    image: assets.karaokeHero,
    figure: assets.karaokeHeroFigure,
    logo: assets.karaokeTitleMark,
    layered: true,
    tone: 'karaoke',
    fullArtwork: true,
  },
};
const FIRST_MUSIC_SONG = 'Дискотека Авария — Если хочешь остаться';

function normalizeMusicIndex(index) {
  return ((index % MUSIC_TOTAL_SONGS) + MUSIC_TOTAL_SONGS) % MUSIC_TOTAL_SONGS;
}

function getCurrentMusicSong(index, category = DEFAULT_MUSIC_CATEGORY, catalog = null) {
  const songIndex = normalizeMusicIndex(index);
  const realSongs = catalog?.categories?.[category]?.songs;
  if (Array.isArray(realSongs) && realSongs.length) {
    return realSongs[songIndex % realSongs.length];
  }
  const catalogIndex = songIndex % MUSIC_SONGS.length;
  const line = songIndex === 0 ? FIRST_MUSIC_SONG : MUSIC_SONGS[catalogIndex] || MUSIC_SONGS[0];
  const [artist = line, title = line] = line.split(' — ');
  return {
    artist,
    title,
    listTitle: line,
    lyrics: [line, '', line, '', line],
  };
}

function normalizeMusicCategory(category) {
  if (category === 'Хиты 2000') return 'Хиты 2000-х';
  return MUSIC_CATEGORIES.includes(category) ? category : '';
}

function readFavoriteIds() {
  const saved = localStorage.getItem('bitva_favorites');
  if (!saved) return DEFAULT_FAVORITE_IDS;
  try {
    const ids = JSON.parse(saved);
    if (!Array.isArray(ids)) return DEFAULT_FAVORITE_IDS;
    const knownIds = new Set(games.map((game) => game.id));
    return ids.filter((id) => knownIds.has(id));
  } catch {
    return DEFAULT_FAVORITE_IDS;
  }
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizeEmail(email));
}

function isValidAuthPassword(password) {
  const value = String(password || '');
  return value.length >= 8 && /[A-Za-zА-Яа-яЁё]/.test(value) && /\d/.test(value);
}

function authErrorMessage(error) {
  if (!(error instanceof AuthApiError)) return 'Не удалось связаться с сервером';
  if (error.code === 'EMAIL_NOT_CONFIGURED') return 'Отправка писем ещё не настроена на сервере';
  if (error.code === 'EMAIL_SEND_FAILED') return 'Письмо не отправлено. Попробуйте ещё раз';
  if (error.code === 'CODE_COOLDOWN') return `Новый код можно отправить через ${error.retryAfter || 60} секунд`;
  if (error.code === 'EMAIL_RATE_LIMIT') return 'Слишком много писем. Попробуйте позже';
  if (error.code === 'AUTH_SERVER_UNAVAILABLE') return 'Сервер авторизации не запущен';
  return error.message || 'Ошибка авторизации';
}

function readPurchasedBlanks() {
  try {
    const saved = JSON.parse(localStorage.getItem(PURCHASED_BLANKS_STORAGE_KEY) || '[]');
    return normalizePurchasedBlanks(saved);
  } catch {
    return [];
  }
}

function normalizePurchasedBlanks(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const category = normalizeMusicCategory(item.category);
      const count = Math.min(BLANK_MAX_COUNT, Math.max(1, Math.round(Number(item.count) || 0)));
      if (!category || !count) return null;
      return {
        id: String(item.id || `${category}-${item.date || ''}-${count}`),
        category,
        count,
        date: String(item.date || 'сегодня'),
        packSeed: String(item.packSeed || item.id || `${category}-${item.date || ''}-${count}`),
        ...(item.createdAt ? { createdAt: String(item.createdAt) } : {}),
      };
    })
    .filter(Boolean);
}

function readPurchasedCategories() {
  try {
    const saved = JSON.parse(localStorage.getItem(PURCHASED_CATEGORIES_STORAGE_KEY) || '[]');
    return normalizePurchasedCategories(saved);
  } catch {
    return [];
  }
}

function normalizePurchasedCategories(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(normalizeMusicCategory).filter(Boolean)));
}

function readBlankOrder() {
  try {
    const saved = JSON.parse(localStorage.getItem(BLANK_ORDER_STORAGE_KEY) || 'null');
    const count = Number(saved?.count);
    if (saved?.category && Number.isFinite(count)) {
      return { category: String(saved.category), count: normalizeBlankCount(count) };
    }
  } catch {
    // Fall back to the Figma confirmation example below.
  }
  return { category: 'Девичник', count: BLANK_MIN_COUNT };
}

const accountRows = [
  ['▣', 'Мои покупки', 'purchasesCount', LAYOUT5_EXTRA_ROUTES.purchases],
  ['♥', 'Избранное', 'favoritesCount', 'favorites'],
  ['⚙', 'Настройки', '', 'profile'],
  ['✎', 'Редактировать профиль', '', 'profile'],
  ['↺', 'История операций и платежей', '', 'profile'],
  ['●', 'Поддержка', '', SUPPORT_TELEGRAM_URL],
];

function formatBalance(value) {
  return new Intl.NumberFormat('ru-RU').format(value);
}

function normalizeBlankCount(value) {
  const count = Math.round(Number(value));
  if (!Number.isFinite(count)) return BLANK_MIN_COUNT;
  return Math.min(BLANK_MAX_COUNT, Math.max(BLANK_MIN_COUNT, count));
}

function formatBlankCount(value) {
  const count = normalizeBlankCount(value);
  const lastTwoDigits = count % 100;
  const lastDigit = count % 10;
  const suffix = lastDigit === 1 && lastTwoDigits !== 11
    ? 'бланк'
    : lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14)
      ? 'бланка'
      : 'бланков';
  return `${count} ${suffix}`;
}

function profileInitial(name) {
  return (name || '').trim().charAt(0).toLocaleUpperCase('ru-RU') || 'Х';
}

function routeForGame(game, isLoggedIn) {
  if (game.detailRoute) return game.detailRoute;
  return isLoggedIn ? 'forms' : 'register';
}

function playGame(game, isLoggedIn, goTo) {
  goTo(routeForGame(game, isLoggedIn));
}

function resolveRoute(requestedRoute) {
  const raw = requestedRoute || 'home';
  const requested = ROUTE_ALIASES[raw] || raw;

  // Purchases used to live under a Karaoke-prefixed URL. Resolve aliases
  // before applying the closed-game guard so that old bookmarks keep working.
  if (!CLOSED_GAME_PREVIEW_ENABLED
    && requested !== LAYOUT5_EXTRA_ROUTES.purchases
    && CLOSED_GAME_ROUTE_PATTERN.test(requested)) {
    return { route: 'home', scrollTarget: CLOSED_GAME_SCROLL_TARGET };
  }

  return {
    route: APP_ROUTES.has(requested) ? requested : 'home',
    scrollTarget: '',
  };
}

function routeFromHash() {
  return window.location.hash.replace(/^#\/?/, '').split(/[?&]/, 1)[0] || 'home';
}

function getInitialRoute() {
  return resolveRoute(routeFromHash()).route;
}

function hashForRoute(route) {
  return route === 'home' ? '#/' : `#/${route}`;
}

function scrollToRouteTarget(target, behavior = 'instant') {
  if (!target) {
    window.scrollTo({ top: 0, behavior });
    return;
  }
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      document.getElementById(target)?.scrollIntoView({ block: 'start', behavior });
    });
  });
}

function App() {
  const [route, setRoute] = useState(getInitialRoute);
  const noticeTimerRef = useRef(null);
  const profileNameSaveTimerRef = useRef(null);
  const lastServerProfileNameRef = useRef('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [balance, setBalance] = useState(() => Number(localStorage.getItem('bitva_balance') || 0));
  const [profileName, setProfileName] = useState(() => localStorage.getItem('bitva_name') || 'харитон');
  const [registerName, setRegisterName] = useState(() => localStorage.getItem('bitva_register_name') || '');
  const [registerEmail, setRegisterEmail] = useState(() => localStorage.getItem('bitva_register_email') || '');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerPasswordConfirm, setRegisterPasswordConfirm] = useState('');
  const [registerErrors, setRegisterErrors] = useState({});
  const [loginEmail, setLoginEmail] = useState(() => localStorage.getItem('bitva_login_email') || '');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginMode, setLoginMode] = useState('password');
  const [loginError, setLoginError] = useState('');
  const [authIntent, setAuthIntent] = useState(() => localStorage.getItem('bitva_auth_intent') || 'default');
  const [lotoCatalog, setLotoCatalog] = useState(lotoCatalogCache);
  const [filter, setFilter] = useState('all');
  const [promo, setPromo] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  const [layout56PurchaseLoading, setLayout56PurchaseLoading] = useState(false);
  const [layout56PurchaseError, setLayout56PurchaseError] = useState('');
  const [paymentIntent, setPaymentIntent] = useState(() => {
    const saved = localStorage.getItem('bitva_payment_intent') || 'blanks';
    if (saved === 'category') return 'karaoke-90s';
    if (/^karaoke-(?:90|2000|2010)-[234]$/.test(saved)) return 'balance';
    return saved;
  });
  const [walletTopUpAmount, setWalletTopUpAmount] = useState(() => localStorage.getItem('bitva_wallet_top_up_amount') || '100');
  const [notice, setNotice] = useState('');
  const [favorites, setFavorites] = useState(() => new Set(readFavoriteIds()));
  const [blankOrder, setBlankOrder] = useState(readBlankOrder);
  const [purchasedBlanks, setPurchasedBlanks] = useState(readPurchasedBlanks);
  const [purchasedCategories, setPurchasedCategories] = useState(readPurchasedCategories);
  // New games use namespaced entitlements; music-loto normalization is separate.
  const [layout56Purchases, setLayout56Purchases] = useState([]);
  const [karaokeBattleCategoryId, setKaraokeBattleCategoryId] = useState(() => {
    try { return window.localStorage.getItem(LAYOUT5_CATEGORY_STORAGE_KEY) || ''; } catch { return ''; }
  });
  const [karaokeBattleStage, setKaraokeBattleStage] = useState('cover');
  const [karaokeBattleSongIndex, setKaraokeBattleSongIndex] = useState(0);
  const [karaokeBattleRemaining, setKaraokeBattleRemaining] = useState(10);
  const [karaokeBattlePlayedSongIndexes, setKaraokeBattlePlayedSongIndexes] = useState([]);
  const [hasJustToppedUp, setHasJustToppedUp] = useState(false);
  const [musicCategory, setMusicCategory] = useState(() => normalizeMusicCategory(localStorage.getItem('bitva_music_category')));
  const [musicSongIndex, setMusicSongIndex] = useState(() => Number(localStorage.getItem('bitva_music_song_index') || 0));
  const [playedMusicIndexes, setPlayedMusicIndexes] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('bitva_music_played_indexes') || '[]');
      return Array.isArray(saved) ? saved.map(Number).filter(Number.isFinite) : [];
    } catch {
      return [];
    }
  });
  const [isMusicPaused, setIsMusicPaused] = useState(false);
  const [showMusicCategoryCover, setShowMusicCategoryCover] = useState(
    () => Boolean(normalizeMusicCategory(localStorage.getItem('bitva_music_category')))
      && localStorage.getItem('bitva_music_show_category_cover') === '1',
  );
  const [hasSelectedMusicCategory, setHasSelectedMusicCategory] = useState(
    () => Boolean(normalizeMusicCategory(localStorage.getItem('bitva_music_category'))),
  );

  const applyServerUser = (user) => {
    if (!user) return;
    setIsLoggedIn(true);
    if (user.name) {
      lastServerProfileNameRef.current = user.name;
      setProfileName(user.name);
    }
    if (user.email) setLoginEmail(user.email);
    if (Number.isFinite(Number(user.balanceCoins))) setBalance(Number(user.balanceCoins));
    if (Array.isArray(user.purchasedBlanks)) setPurchasedBlanks(normalizePurchasedBlanks(user.purchasedBlanks));
    if (Array.isArray(user.purchasedCategories)) setPurchasedCategories(normalizePurchasedCategories(user.purchasedCategories));
    setLayout56Purchases(Array.isArray(user.gameEntitlements)
      ? user.gameEntitlements.filter(id => typeof id === 'string' && /^(royal|karaoke):/.test(id))
      : []);
  };

  const saveProfileNameToServer = async () => {
    const nextName = profileName.trim();
    if (!isLoggedIn || nextName.length < 2 || nextName === lastServerProfileNameRef.current) return null;
    const result = await authApi.updateProfile({ name: nextName });
    applyServerUser(result.user);
    return result.user;
  };

  useEffect(() => {
    const syncRoute = () => {
      const raw = routeFromHash();
      const resolved = resolveRoute(raw);
      const next = resolved.route;
      const mustCanonicalize = raw !== next || Boolean(resolved.scrollTarget);
      if (!window.history.state?.bitvaRoute || !APP_ROUTES.has(raw) || mustCanonicalize) {
        window.history.replaceState(
          {
            bitvaRoute: true,
            bitvaDepth: Number(window.history.state?.bitvaDepth || 0),
            ...(resolved.scrollTarget ? { bitvaScrollTarget: resolved.scrollTarget } : {}),
          },
          '',
          hashForRoute(next),
        );
      }
      setRoute(next);
      const scrollTarget = window.history.state?.bitvaScrollTarget;
      if (scrollTarget) scrollToRouteTarget(scrollTarget);
    };

    syncRoute();
    window.addEventListener('hashchange', syncRoute);
    window.addEventListener('popstate', syncRoute);
    return () => {
      window.removeEventListener('hashchange', syncRoute);
      window.removeEventListener('popstate', syncRoute);
    };
  }, []);

  useEffect(() => {
    let isActive = true;
    authApi.session()
      .then(({ user }) => {
        if (!isActive) return;
        if (user) applyServerUser(user);
        else setIsLoggedIn(false);
      })
      .catch(() => {
        if (isActive) setIsLoggedIn(false);
      })
      .finally(() => {
        if (isActive) setAuthReady(true);
      });
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('bitva_logged_in', isLoggedIn ? '1' : '0');
    localStorage.setItem('bitva_balance', String(balance));
    localStorage.setItem('bitva_name', profileName);
    localStorage.setItem('bitva_favorites', JSON.stringify([...favorites]));
    localStorage.setItem('bitva_register_name', registerName);
    localStorage.setItem('bitva_register_email', registerEmail);
    localStorage.removeItem('bitva_register_phone');
    localStorage.removeItem('bitva_login_phone');
    localStorage.setItem('bitva_login_email', loginEmail);
    localStorage.setItem('bitva_auth_intent', authIntent);
    localStorage.setItem('bitva_music_category', musicCategory);
    localStorage.setItem(BLANK_ORDER_STORAGE_KEY, JSON.stringify(blankOrder));
    localStorage.setItem(PURCHASED_BLANKS_STORAGE_KEY, JSON.stringify(purchasedBlanks));
    localStorage.setItem(PURCHASED_CATEGORIES_STORAGE_KEY, JSON.stringify(purchasedCategories));
    localStorage.setItem('bitva_payment_intent', paymentIntent);
    localStorage.setItem('bitva_wallet_top_up_amount', walletTopUpAmount);
  }, [isLoggedIn, balance, profileName, favorites, registerName, registerEmail, loginEmail, authIntent, musicCategory, blankOrder, purchasedBlanks, purchasedCategories, paymentIntent, walletTopUpAmount]);

  useEffect(() => {
    localStorage.setItem('bitva_music_song_index', String(musicSongIndex));
    localStorage.setItem('bitva_music_played_indexes', JSON.stringify(playedMusicIndexes));
  }, [musicSongIndex, playedMusicIndexes]);

  useEffect(() => {
    localStorage.setItem('bitva_music_show_category_cover', showMusicCategoryCover ? '1' : '0');
  }, [showMusicCategoryCover]);

  useEffect(() => {
    let isActive = true;
    loadLotoCatalog()
      .then((catalog) => {
        if (isActive) setLotoCatalog(catalog);
      })
      .catch(() => {
        if (isActive) setLotoCatalog(null);
      });
    return () => {
      isActive = false;
    };
  }, []);

  const goTo = (next, options = {}) => {
    const requestedRoute = next || 'home';
    const resolved = resolveRoute(requestedRoute);
    const nextRoute = resolved.route;
    const scrollTarget = options.scrollTarget || resolved.scrollTarget;
    const currentDepth = Number(window.history.state?.bitvaDepth || 0);
    const historyState = {
      bitvaRoute: true,
      bitvaDepth: options.replace ? currentDepth : currentDepth + 1,
      ...(scrollTarget ? { bitvaScrollTarget: scrollTarget } : {}),
    };
    window.history[options.replace ? 'replaceState' : 'pushState'](
      historyState,
      '',
      hashForRoute(nextRoute),
    );
    setRoute(nextRoute);
    scrollToRouteTarget(scrollTarget, options.behavior || 'instant');
  };

  const goBack = (fallback = 'home') => {
    if (Number(window.history.state?.bitvaDepth || 0) > 0) {
      window.history.back();
      return;
    }
    goTo(fallback, { replace: true });
  };

  const finishFlowAt = (next = 'home') => {
    const resolved = resolveRoute(next);
    const nextRoute = resolved.route;
    const currentDepth = Number(window.history.state?.bitvaDepth || 0);
    const commitRoute = () => {
      window.history.replaceState(
        {
          bitvaRoute: true,
          bitvaDepth: 0,
          ...(resolved.scrollTarget ? { bitvaScrollTarget: resolved.scrollTarget } : {}),
        },
        '',
        hashForRoute(nextRoute),
      );
      setRoute(nextRoute);
      scrollToRouteTarget(resolved.scrollTarget);
    };

    if (currentDepth <= 0) {
      commitRoute();
      return;
    }

    window.addEventListener('popstate', commitRoute, { once: true });
    window.history.go(-currentDepth);
  };

  const showNotice = (text) => {
    setNotice(text);
    window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setNotice(''), 1800);
  };

  useEffect(() => () => {
    window.clearTimeout(noticeTimerRef.current);
    window.clearTimeout(profileNameSaveTimerRef.current);
  }, []);

  useEffect(() => {
    if (!authReady || !isLoggedIn) return undefined;
    const nextName = profileName.trim();
    if (nextName.length < 2 || nextName === lastServerProfileNameRef.current) return undefined;
    window.clearTimeout(profileNameSaveTimerRef.current);
    profileNameSaveTimerRef.current = window.setTimeout(() => {
      saveProfileNameToServer().catch((error) => showNotice(authErrorMessage(error)));
    }, 700);
    return () => window.clearTimeout(profileNameSaveTimerRef.current);
  }, [authReady, isLoggedIn, profileName]);

  useEffect(() => {
    if (!authReady || isLoggedIn || !PROTECTED_ROUTES.has(route)) return;
    const entitlementEntry = route === 'balance-top-up'
      ? entitlementPurchaseByIntent(paymentIntent)
      : Object.entries(GAME_ENTITLEMENT_PURCHASES)
        .find(([, purchase]) => route === purchase.insufficientRoute || route === purchase.successRoute);
    if (entitlementEntry) setPaymentIntent(entitlementEntry[1].paymentIntent);
    setAuthIntent(entitlementEntry?.[1].authIntent
      || (route === 'buy-blanks' || route === 'balance-top-up' ? 'purchase' : 'default'));
    goTo('login', { replace: true });
  }, [authReady, isLoggedIn, paymentIntent, route]);

  const hasRoyalBirthdayEntitlement = layout56Purchases.includes('royal:birthday');
  useEffect(() => {
    if (!authReady || hasRoyalBirthdayEntitlement || !ROYAL_BIRTHDAY_ENTITLEMENT_ROUTES.has(route)) return;
    // A guest opening the protected success URL still needs the normal auth flow.
    if (!isLoggedIn && route === LAYOUT6_PURCHASE_ROUTES.success) return;
    goTo('royal-battle-collection-birthday', { replace: true });
    showNotice('Сначала откройте сборник «День рождения»');
  }, [authReady, hasRoyalBirthdayEntitlement, isLoggedIn, route]);

  useEffect(() => {
    if (!isLoggedIn || route !== 'register-success' || purchasedBlanks.length > 0) return;
    goTo('music-buy-blanks', { replace: true });
  }, [isLoggedIn, purchasedBlanks.length, route]);

  const finishAuthentication = (user, successRoute = 'auth-login-success') => {
    setFavorites((current) => (current.size ? current : new Set(DEFAULT_FAVORITE_IDS)));
    applyServerUser(user);
    setAuthReady(true);
    goTo(successRoute, { replace: true });
    showNotice('Вы вошли');
  };

  const registrationPayload = () => ({
    name: registerName.trim(),
    email: normalizeEmail(registerEmail),
    password: registerPassword,
  });

  const validateRegistration = () => {
    const nextName = registerName.trim();
    const nextErrors = {
      name: nextName.length < 2 ? 'Введите имя' : '',
      email: !isValidEmail(registerEmail) ? 'Введите корректный email' : '',
      password: !isValidAuthPassword(registerPassword) ? 'Минимум 8 символов, буквы и цифры' : '',
      passwordConfirm: registerPassword !== registerPasswordConfirm ? 'Пароли не совпадают' : '',
    };
    if (Object.values(nextErrors).some(Boolean)) {
      setRegisterErrors(nextErrors);
      return false;
    }
    setRegisterErrors({});
    return true;
  };

  const requestRegistrationCode = async ({ navigate = false } = {}) => {
    if (!validateRegistration()) return null;
    const result = await authApi.register(registrationPayload());
    if (navigate) goTo('register-code');
    showNotice('Код отправлен на почту');
    return result;
  };

  const startRegistration = async () => {
    if (authLoading) return;
    setAuthLoading(true);
    try {
      await requestRegistrationCode({ navigate: true });
    } catch (error) {
      if (error instanceof AuthApiError && error.code === 'EMAIL_EXISTS') {
        goTo('register-email-exists');
      } else {
        const message = authErrorMessage(error);
        setRegisterErrors((current) => ({ ...current, email: message }));
        showNotice(message);
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const completeRegistration = async (code) => {
    const result = await authApi.verifyCode({
      email: normalizeEmail(registerEmail),
      code,
      purpose: 'register',
    });
    setRegisterName('');
    setRegisterEmail('');
    setRegisterPassword('');
    setRegisterPasswordConfirm('');
    setRegisterErrors({});
    finishAuthentication(result.user, 'auth-register-success');
  };

  const requestLoginCode = async ({ navigate = false } = {}) => {
    const nextEmail = normalizeEmail(loginEmail);
    if (!isValidEmail(nextEmail)) {
      setLoginError('not-found');
      return null;
    }
    const result = await authApi.requestLoginCode(nextEmail);
    setLoginError('');
    if (navigate) goTo('login-code');
    showNotice('Код отправлен на почту');
    return result;
  };

  const startLogin = async () => {
    if (authLoading) return;
    const nextEmail = normalizeEmail(loginEmail);
    if (!isValidEmail(nextEmail)) {
      setLoginError('not-found');
      return;
    }
    setAuthLoading(true);
    try {
      if (loginMode === 'code') {
        await requestLoginCode({ navigate: true });
        return;
      }
      const result = await authApi.login({ email: nextEmail, password: loginPassword });
      setLoginError('');
      setLoginPassword('');
      finishAuthentication(result.user, 'auth-login-success');
    } catch (error) {
      if (error instanceof AuthApiError && error.code === 'ACCOUNT_NOT_FOUND') setLoginError('not-found');
      else if (error instanceof AuthApiError && error.code === 'INVALID_CREDENTIALS') setLoginError('credentials');
      else {
        setLoginError('server');
        showNotice(authErrorMessage(error));
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const completeLogin = async (code) => {
    const result = await authApi.verifyCode({ email: normalizeEmail(loginEmail), code, purpose: 'login' });
    setLoginError('');
    finishAuthentication(result.user, 'auth-login-success');
  };

  const requestRecoveryCode = async ({ navigate = false } = {}) => {
    const nextEmail = normalizeEmail(loginEmail);
    if (!isValidEmail(nextEmail)) {
      setLoginError('not-found');
      return null;
    }
    const result = await authApi.requestRecoveryCode(nextEmail);
    setLoginError('');
    if (navigate) goTo('recovery-code');
    showNotice('Код восстановления отправлен');
    return result;
  };

  const startRecovery = async () => {
    if (authLoading) return;
    setAuthLoading(true);
    try {
      await requestRecoveryCode({ navigate: true });
    } catch (error) {
      if (error instanceof AuthApiError && error.code === 'ACCOUNT_NOT_FOUND') setLoginError('not-found');
      else {
        setLoginError('server');
        showNotice(authErrorMessage(error));
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const completeRecovery = async (code) => {
    await authApi.verifyCode({ email: normalizeEmail(loginEmail), code, purpose: 'recovery' });
    goTo('new-password');
  };

  const completePasswordReset = async (nextPassword) => {
    await authApi.resetPassword(nextPassword);
    setLoginPassword('');
    setLoginMode('password');
    goTo('login', { replace: true });
    showNotice('Пароль обновлён');
  };

  const logout = async () => {
    window.clearTimeout(profileNameSaveTimerRef.current);
    try {
      await saveProfileNameToServer();
      await authApi.logout();
    } catch (error) {
      showNotice(authErrorMessage(error));
    }
    setIsLoggedIn(false);
    setLayout56Purchases([]);
    setAuthIntent('default');
    goTo('home', { replace: true });
    showNotice('Вы вышли');
  };

  const toggleFavorite = (id) => {
    if (!isLoggedIn) {
      showNotice('Войдите, чтобы добавить игру');
      return;
    }
    setFavorites((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const buyGame = () => {
    window.location.assign(MAFIA_GAME_URL);
  };

  const activatePromo = async () => {
    if (!promo.trim()) {
      showNotice('Введите промокод');
      return;
    }
    if (!isLoggedIn) {
      setAuthIntent('promo');
      goTo('login');
      showNotice('Войдите, чтобы активировать промокод');
      return;
    }
    if (promoLoading) return;
    setPromoLoading(true);
    try {
      const result = await authApi.activatePromo(promo);
      setBalance(Number.isFinite(Number(result.balanceCoins)) ? Number(result.balanceCoins) : 0);
      setPromo('');
      showNotice(`Промокод активирован: +${formatBalance(result.rewardCoins)} монет`);
    } catch (error) {
      if (error instanceof AuthApiError && error.code === 'PROMO_ALREADY_USED') {
        showNotice('Вы уже активировали этот промокод');
      } else if (error instanceof AuthApiError && error.code === 'PROMO_LIMIT_REACHED') {
        showNotice('Лимит активаций промокода закончился');
      } else if (error instanceof AuthApiError && error.code === 'PROMO_NOT_AVAILABLE') {
        showNotice('Промокод не найден или больше не действует');
      } else {
        showNotice(authErrorMessage(error));
      }
    } finally {
      setPromoLoading(false);
    }
  };

  const currentMusicSong = useMemo(
    () => getCurrentMusicSong(musicSongIndex, musicCategory || DEFAULT_MUSIC_CATEGORY, lotoCatalog),
    [lotoCatalog, musicCategory, musicSongIndex],
  );
  const playedMusicSongs = useMemo(
    () => playedMusicIndexes.map(
      (index) => getCurrentMusicSong(index, musicCategory || DEFAULT_MUSIC_CATEGORY, lotoCatalog),
    ),
    [lotoCatalog, musicCategory, playedMusicIndexes],
  );
  const remainingMusicSongs = Math.max(0, MUSIC_TOTAL_SONGS - playedMusicIndexes.length);

  const openGame = (game) => {
    if (game.comingSoon) return;
    playGame(game, isLoggedIn, goTo);
  };

  const selectMusicCategory = (category) => {
    const normalizedCategory = normalizeMusicCategory(category);
    setMusicCategory(normalizedCategory);
    setMusicSongIndex(pickRandomMusicIndex([], MUSIC_TOTAL_SONGS));
    setPlayedMusicIndexes([]);
    setHasSelectedMusicCategory(Boolean(normalizedCategory));
    setShowMusicCategoryCover(Boolean(normalizedCategory));
    setIsMusicPaused(false);
  };

  const purchaseGameEntitlement = async (entitlementId) => {
    const purchase = GAME_ENTITLEMENT_PURCHASES[entitlementId];
    if (!purchase) return null;
    if (!isLoggedIn) {
      setPaymentIntent(purchase.paymentIntent);
      setAuthIntent(purchase.authIntent);
      goTo('login');
      return null;
    }
    setLayout56PurchaseLoading(true);
    setLayout56PurchaseError('');
    try {
      const result = await authApi.purchaseGameEntitlement(entitlementId);
      applyServerUser(result.user);
      goTo(purchase.successRoute, { replace: true });
      showNotice(result.alreadyOwned ? 'Покупка уже доступна' : 'Покупка завершена');
      return result;
    } catch (error) {
      if (error instanceof AuthApiError && error.code === 'INSUFFICIENT_FUNDS') {
        const session = await authApi.session().catch(() => null);
        if (session?.user) applyServerUser(session.user);
        setLayout56PurchaseError('У вас не хватает монет');
        if (entitlementId === 'karaoke:girls') {
          setPaymentIntent(purchase.paymentIntent);
          setPaymentError('На балансе не хватает монет для категории «Девичник».');
          goTo('balance-top-up', { replace: true });
          showNotice('Не хватает монет — пополните баланс');
          return null;
        }
        goTo(purchase.insufficientRoute, { replace: true });
        return null;
      }
      const message = authErrorMessage(error);
      setLayout56PurchaseError(message);
      showNotice(message);
      return null;
    } finally {
      setLayout56PurchaseLoading(false);
    }
  };

  const openGameEntitlementTopUp = (entitlementId) => {
    const purchase = GAME_ENTITLEMENT_PURCHASES[entitlementId];
    if (!purchase) return;
    setPaymentIntent(purchase.paymentIntent);
    setPaymentError('');
    setLayout56PurchaseError('');
    setPaymentLoading(false);
    goTo('balance-top-up');
  };

  const nextMusicSong = () => {
    if (showMusicCategoryCover) {
      setShowMusicCategoryCover(false);
      setIsMusicPaused(false);
      return;
    }
    const currentIndex = normalizeMusicIndex(musicSongIndex);
    const playedWithCurrent = playedMusicIndexes.includes(currentIndex)
      ? playedMusicIndexes
      : [...playedMusicIndexes, currentIndex];
    const hasCompletedPlaylist = playedWithCurrent.length >= MUSIC_TOTAL_SONGS;
    setPlayedMusicIndexes(hasCompletedPlaylist ? [] : playedWithCurrent);
    setMusicSongIndex(pickRandomMusicIndex(
      hasCompletedPlaylist ? [currentIndex] : playedWithCurrent,
      MUSIC_TOTAL_SONGS,
    ));
    setIsMusicPaused(false);
  };

  const resetMusicGame = () => {
    setMusicSongIndex(pickRandomMusicIndex([], MUSIC_TOTAL_SONGS));
    setPlayedMusicIndexes([]);
    setIsMusicPaused(false);
    setShowMusicCategoryCover(hasSelectedMusicCategory);
    goBack('music-game');
    showNotice('Новая игра началась');
  };

  const startMusicGame = ({ preserveCategory = false } = {}) => {
    const categoryToStart = normalizeMusicCategory(musicCategory);
    const canPreserveCategory = preserveCategory
      && hasSelectedMusicCategory
      && Boolean(categoryToStart);
    setMusicSongIndex(canPreserveCategory ? pickRandomMusicIndex([], MUSIC_TOTAL_SONGS) : 0);
    setPlayedMusicIndexes([]);
    setIsMusicPaused(false);
    setShowMusicCategoryCover(canPreserveCategory);
    if (!canPreserveCategory) {
      setMusicCategory('');
      setHasSelectedMusicCategory(false);
    }
    goTo('music-game');
  };

  const prepareBlankOrder = (order) => {
    setBlankOrder({ ...order, count: normalizeBlankCount(order?.count) });
    setHasJustToppedUp(false);
  };

  const openWalletTopUp = () => {
    setPaymentIntent('balance');
    setPaymentError('');
    setPaymentLoading(false);
    goTo('balance-top-up');
  };

  const blankOrderCost = normalizeBlankCount(blankOrder?.count) * BLANK_UNIT_PRICE;
  const requestedWalletTopUp = Number(walletTopUpAmount);
  const entitlementPurchaseEntry = entitlementPurchaseByIntent(paymentIntent);
  const topUpAmount = entitlementPurchaseEntry
    ? Math.max(0, entitlementPurchaseEntry[1].price - balance)
    : paymentIntent === 'balance'
      ? (Number.isSafeInteger(requestedWalletTopUp) && requestedWalletTopUp >= 1 && requestedWalletTopUp <= 1_500 ? requestedWalletTopUp : 0)
      : Math.max(0, blankOrderCost - balance);
  const topUpPurchaseKind = entitlementPurchaseEntry
    ? (entitlementPurchaseEntry[0].startsWith('royal:') ? 'сборника' : 'категории')
    : 'бланков';
  const startBalanceTopUp = async () => {
    if (paymentLoading || topUpAmount <= 0) return;
    setPaymentLoading(true);
    setPaymentError('');
    try {
      const { payment } = await authApi.createTochkaPayment(topUpAmount);
      if (!payment?.id || !payment?.paymentLink) throw new Error('PAYMENT_LINK_MISSING');
      localStorage.setItem('bitva_pending_payment', payment.id);
      window.location.assign(payment.paymentLink);
    } catch (error) {
      const message = error instanceof AuthApiError && error.code === 'PAYMENT_PROVIDER_FORBIDDEN'
        ? 'Эквайринг Точки ещё не разрешён для этого ключа'
        : authErrorMessage(error);
      setPaymentError(message);
      showNotice(message);
      setPaymentLoading(false);
    }
  };

  useEffect(() => {
    if (!authReady || !isLoggedIn || route !== 'balance-top-up') return undefined;
    const query = new URLSearchParams(window.location.search);
    const paymentId = query.get('paymentId') || localStorage.getItem('bitva_pending_payment');
    const paymentResult = query.get('paymentResult');
    if (!paymentId) return undefined;
    let cancelled = false;
    let attempts = 0;
    let timer;
    const clearPendingPayment = () => {
      localStorage.removeItem('bitva_pending_payment');
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('paymentId');
      cleanUrl.searchParams.delete('paymentResult');
      window.history.replaceState(window.history.state, '', `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
    };
    const check = async () => {
      attempts += 1;
      setPaymentLoading(true);
      try {
        const { payment } = await authApi.paymentStatus(paymentId);
        if (cancelled) return;
        if (payment?.status === 'APPROVED' && payment.credited) {
          setBalance(Number(payment.balanceCoins || 0));
          setHasJustToppedUp(paymentIntent !== 'balance');
          setPaymentError('');
          clearPendingPayment();
          if (entitlementPurchaseEntry) {
            const [entitlementId, entitlementPurchase] = entitlementPurchaseEntry;
            try {
              const purchase = await authApi.purchaseGameEntitlement(entitlementId);
              if (cancelled) return;
              applyServerUser(purchase.user);
              setLayout56PurchaseError('');
              goTo(entitlementPurchase.successRoute, { replace: true });
              showNotice('Оплата и покупка подтверждены');
            } catch (error) {
              if (cancelled) return;
              const message = authErrorMessage(error);
              setLayout56PurchaseError(message);
              goTo(entitlementPurchase.insufficientRoute, { replace: true });
              showNotice(message);
            }
            setPaymentLoading(false);
            return;
          }
          goTo(
            paymentIntent === 'balance'
                ? 'profile'
                : 'buy-blanks',
            { replace: true },
          );
          showNotice('Оплата подтверждена');
          return;
        }
        if (paymentResult === 'failed') {
          clearPendingPayment();
          setPaymentError('Оплата не прошла. Деньги не списаны. Попробуйте ещё раз или выберите другой способ оплаты.');
          setPaymentLoading(false);
          return;
        }
        if (['FAILED', 'EXPIRED', 'REFUNDED'].includes(payment?.status)) {
          clearPendingPayment();
          setPaymentError('Платёж не завершён. Попробуйте ещё раз.');
          setPaymentLoading(false);
          return;
        }
        if (attempts < 15) timer = window.setTimeout(check, 2000);
        else {
          setPaymentError('Платёж ещё обрабатывается. Проверка продолжится при следующем открытии страницы.');
          setPaymentLoading(false);
        }
      } catch (error) {
        if (cancelled) return;
        setPaymentError(authErrorMessage(error));
        setPaymentLoading(false);
      }
    };
    check();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [authReady, isLoggedIn, paymentIntent, route]);

  const royalRouteNeedsEntitlement = authReady
    && !hasRoyalBirthdayEntitlement
    && ROYAL_BIRTHDAY_ENTITLEMENT_ROUTES.has(route)
    && (isLoggedIn || route !== LAYOUT6_PURCHASE_ROUTES.success);
  const visibleRoute = !authReady
    ? null
    : !isLoggedIn && PROTECTED_ROUTES.has(route)
    ? 'login'
    : royalRouteNeedsEntitlement
      ? 'royal-battle-collection-birthday'
      : route;

  return (
    <div className="app-shell">
      <ResponsiveCanvas route={visibleRoute}>
      {isLayout7Route(visibleRoute) && (
        <Layout7Routes
          route={visibleRoute}
          goTo={goTo}
          Nav={DetailPageNav}
          Footer={Footer}
          Coin={Coin}
          balance={balance}
          isLoggedIn={isLoggedIn}
          profileName={profileName}
          purchasedCategories={layout56Purchases}
          purchaseBusy={layout56PurchaseLoading}
          purchaseError={layout56PurchaseError}
          onPurchaseGameEntitlement={purchaseGameEntitlement}
          onOpenGameEntitlementTopUp={openGameEntitlementTopUp}
        />
      )}
      {!isLayout7Route(visibleRoute) && LAYOUT56_ROUTES.includes(visibleRoute) && (
        <Layout56Routes
          route={visibleRoute}
          goTo={goTo}
          goBack={goBack}
          Nav={DetailPageNav}
          Footer={Footer}
          Coin={Coin}
          balance={balance}
          isLoggedIn={isLoggedIn}
          profileName={profileName}
          purchasedCategories={layout56Purchases}
          purchasedBlanks={purchasedBlanks}
          purchasedMusicCategories={purchasedCategories}
          favoriteIds={favorites}
          onToggleFavorite={toggleFavorite}
          karaokeCategoryId={karaokeBattleCategoryId}
          setKaraokeCategoryId={setKaraokeBattleCategoryId}
          karaokeStage={karaokeBattleStage}
          setKaraokeStage={setKaraokeBattleStage}
          karaokeSongIndex={karaokeBattleSongIndex}
          setKaraokeSongIndex={setKaraokeBattleSongIndex}
          karaokeRemaining={karaokeBattleRemaining}
          setKaraokeRemaining={setKaraokeBattleRemaining}
          karaokePlayedSongIndexes={karaokeBattlePlayedSongIndexes}
          setKaraokePlayedSongIndexes={setKaraokeBattlePlayedSongIndexes}
          purchaseBusy={layout56PurchaseLoading}
          purchaseError={layout56PurchaseError}
          onPurchaseGameEntitlement={purchaseGameEntitlement}
          onOpenGameEntitlementTopUp={openGameEntitlementTopUp}
          onOpenBalance={openWalletTopUp}
        />
      )}
      {visibleRoute === 'home' && (
        <HomePage
          balance={balance}
          filter={filter}
          favorites={favorites}
          goTo={goTo}
          isLoggedIn={isLoggedIn}
          openGame={openGame}
          promo={promo}
          promoLoading={promoLoading}
          profileName={profileName}
          setFilter={setFilter}
          setPromo={setPromo}
          showNotice={showNotice}
          setAuthIntent={setAuthIntent}
          toggleFavorite={toggleFavorite}
          activatePromo={activatePromo}
        />
      )}
      {visibleRoute === 'logged-in-home' && <LoggedInHome goBack={goBack} goTo={goTo} balance={balance} profileName={profileName} />}
      {visibleRoute === 'profile' && (
        <ProfilePage
          balance={balance}
          favorites={favorites}
          goTo={goTo}
          logout={logout}
          onTopUp={openWalletTopUp}
          profileName={profileName}
          purchasesCount={purchasedBlanks.length + purchasedCategories.length + layout56Purchases.length}
          setProfileName={setProfileName}
          promo={promo}
          promoLoading={promoLoading}
          setPromo={setPromo}
          activatePromo={activatePromo}
          goBack={goBack}
          showNotice={showNotice}
        />
      )}
      {visibleRoute === 'favorites' && (
        <FavoritesPage
          balance={balance}
          favorites={favorites}
          goTo={goTo}
          isLoggedIn={isLoggedIn}
          profileName={profileName}
          goBack={goBack}
          toggleFavorite={toggleFavorite}
        />
      )}
      {visibleRoute === 'forms' && (
        <FormsPage
          goBack={goBack}
          goTo={goTo}
          onStartGame={startMusicGame}
          purchasedBlanks={purchasedBlanks}
          showNotice={showNotice}
        />
      )}
      {visibleRoute === 'register' && (
        <RegisterPage
          loading={authLoading}
          email={registerEmail}
          errors={registerErrors}
          goBack={goBack}
          goTo={goTo}
          onSubmit={startRegistration}
          name={registerName}
          password={registerPassword}
          passwordConfirm={registerPasswordConfirm}
          setEmail={(value) => {
            setRegisterEmail(value);
            setRegisterErrors((current) => ({ ...current, email: '' }));
          }}
          setName={(value) => {
            setRegisterName(value);
            setRegisterErrors((current) => ({ ...current, name: '' }));
          }}
          setPassword={(value) => {
            setRegisterPassword(value);
            setRegisterErrors((current) => ({ ...current, password: '', passwordConfirm: '' }));
          }}
          setPasswordConfirm={(value) => {
            setRegisterPasswordConfirm(value);
            setRegisterErrors((current) => ({ ...current, passwordConfirm: '' }));
          }}
        />
      )}
      {visibleRoute === 'register-email-exists' && (
        <EmailExistsPage
          email={registerEmail}
          goBack={goBack}
          goTo={goTo}
          onRecover={() => {
            setLoginEmail(registerEmail);
            goTo('login');
          }}
        />
      )}
      {visibleRoute === 'register-code' && (
        <CodePage
          email={registerEmail}
          goBack={goBack}
          goTo={goTo}
          onResend={() => requestRegistrationCode()}
          onSuccess={completeRegistration}
          showNotice={showNotice}
        />
      )}
      {visibleRoute === 'register-success' && <SuccessPage goBack={goBack} goTo={goTo} />}
      {visibleRoute === 'auth-register-success' && (
        <AuthSuccessPage
          authIntent={authIntent}
          balance={balance}
          finishFlowAt={finishFlowAt}
          goBack={goBack}
          goTo={goTo}
          paymentIntent={paymentIntent}
          profileName={profileName}
          setAuthIntent={setAuthIntent}
          setPaymentIntent={setPaymentIntent}
          variant="register"
        />
      )}
      {visibleRoute === 'login' && (
        <LoginPage
          email={loginEmail}
          error={loginError}
          goBack={goBack}
          goTo={goTo}
          loading={authLoading}
          mode={loginMode}
          onSubmit={startLogin}
          onRecover={startRecovery}
          password={loginPassword}
          setEmail={(value) => { setLoginEmail(value); setLoginError(''); }}
          setMode={(value) => { setLoginMode(value); setLoginError(''); }}
          setPassword={(value) => { setLoginPassword(value); setLoginError(''); }}
        />
      )}
      {visibleRoute === 'login-code' && (
        <CodePage
          backRoute="login"
          email={loginEmail}
          goBack={goBack}
          goTo={goTo}
          onResend={() => requestLoginCode()}
          onSuccess={completeLogin}
          showNotice={showNotice}
          title="Вход в аккаунт"
        />
      )}
      {visibleRoute === 'recovery-code' && (
        <CodePage
          backRoute="login"
          email={loginEmail}
          goBack={goBack}
          goTo={goTo}
          onResend={() => requestRecoveryCode()}
          onSuccess={completeRecovery}
          showNotice={showNotice}
          title="Вход в аккаунт"
        />
      )}
      {visibleRoute === 'new-password' && (
        <NewPasswordPage
          email={loginEmail}
          goBack={goBack}
          goTo={goTo}
          onSubmit={completePasswordReset}
        />
      )}
      {visibleRoute === 'auth-login-success' && (
        <AuthSuccessPage
          authIntent={authIntent}
          balance={balance}
          finishFlowAt={finishFlowAt}
          goBack={goBack}
          goTo={goTo}
          paymentIntent={paymentIntent}
          profileName={profileName}
          setAuthIntent={setAuthIntent}
          setPaymentIntent={setPaymentIntent}
          variant="login"
        />
      )}
      {visibleRoute === 'privacy' && <PrivacyPage goBack={goBack} goTo={goTo} />}
      {visibleRoute === 'game-detail' && (
        <GameDetailPage
          balance={balance}
          buyGame={buyGame}
          favorites={favorites}
          goTo={goTo}
          goBack={goBack}
          isLoggedIn={isLoggedIn}
          profileName={profileName}
          toggleFavorite={toggleFavorite}
          favorite={isLoggedIn && favorites.has('mafia')}
          showNotice={showNotice}
        />
      )}
      {(visibleRoute === 'music-detail' || visibleRoute === 'music-buy-blanks') && (
        <MusicDetailPage
          balance={balance}
          favorites={favorites}
          focusPurchase={visibleRoute === 'music-buy-blanks'}
          goBack={goBack}
          goTo={goTo}
          isLoggedIn={isLoggedIn}
          onStartGame={startMusicGame}
          profileName={profileName}
          setAuthIntent={setAuthIntent}
          setBlankOrder={prepareBlankOrder}
          showNotice={showNotice}
          toggleFavorite={toggleFavorite}
        />
      )}
      {visibleRoute === 'music-blanks' && (
        <MusicBlanksPage
          balance={balance}
          goBack={goBack}
          goTo={goTo}
          isLoggedIn={isLoggedIn}
          onStartGame={() => startMusicGame({ preserveCategory: true })}
          profileName={profileName}
          purchasedBlanks={purchasedBlanks}
          setAuthIntent={setAuthIntent}
          setBlankOrder={prepareBlankOrder}
          showNotice={showNotice}
        />
      )}
      {visibleRoute === 'music-game' && (
        <MusicGamePage
          backRoute="music-detail"
          balance={balance}
          categoryNavigation="inline"
          categoryRoute="music-detail"
          goBack={goBack}
          goTo={goTo}
          isLoggedIn={isLoggedIn}
          currentSong={currentMusicSong}
          isPaused={isMusicPaused}
          hasSelectedCategory={hasSelectedMusicCategory}
          musicCategory={musicCategory}
          onNextSong={nextMusicSong}
          onTogglePause={() => setIsMusicPaused((current) => !current)}
          pageTitle="Музыкальное лото Дома"
          playedSongsCount={playedMusicSongs.length}
          profileName={profileName}
          purchasedBlanksCount={purchasedBlanks.length}
          remainingSongs={remainingMusicSongs}
          setMusicCategory={selectMusicCategory}
          showCategoryCover={showMusicCategoryCover}
        />
      )}
      {visibleRoute === 'music-songs' && (
        <MusicSongsPage
          balance={balance}
          goBack={goBack}
          goTo={goTo}
          isLoggedIn={isLoggedIn}
          playedSongs={playedMusicSongs}
          profileName={profileName}
        />
      )}
      {visibleRoute === 'music-new-game' && (
        <MusicNewGamePage
          balance={balance}
          goBack={goBack}
          goTo={goTo}
          isLoggedIn={isLoggedIn}
          currentSong={currentMusicSong}
          isPaused={isMusicPaused}
          hasSelectedCategory={hasSelectedMusicCategory}
          musicCategory={musicCategory}
          onNextSong={nextMusicSong}
          onResetGame={resetMusicGame}
          onTogglePause={() => setIsMusicPaused((current) => !current)}
          playedSongsCount={playedMusicSongs.length}
          profileName={profileName}
          purchasedBlanksCount={purchasedBlanks.length}
          remainingSongs={remainingMusicSongs}
          setMusicCategory={selectMusicCategory}
          showCategoryCover={showMusicCategoryCover}
        />
      )}
      {visibleRoute === 'music-winner' && (
        <MusicWinnerPage
          balance={balance}
          goBack={goBack}
          goTo={goTo}
          isLoggedIn={isLoggedIn}
          profileName={profileName}
        />
      )}
      {visibleRoute === 'buy-blanks' && (
        <BuyBlanksPage
          balance={balance}
          blankOrder={blankOrder}
          goBack={goBack}
          goTo={goTo}
          hasJustToppedUp={hasJustToppedUp}
          onApplyServerUser={applyServerUser}
          profileName={profileName}
          setBalance={setBalance}
          setHasJustToppedUp={setHasJustToppedUp}
          setPaymentIntent={setPaymentIntent}
          setPurchasedBlanks={setPurchasedBlanks}
          showNotice={showNotice}
        />
      )}
      {visibleRoute === 'balance-top-up' && (
        <BalanceTopUpPage
          amount={topUpAmount}
          amountValue={walletTopUpAmount}
          backRoute={entitlementPurchaseEntry?.[1].insufficientRoute || (paymentIntent === 'balance' ? 'profile' : 'buy-blanks')}
          goBack={goBack}
          goTo={goTo}
          isStandalone={paymentIntent === 'balance'}
          onAmountChange={setWalletTopUpAmount}
          onPay={startBalanceTopUp}
          paymentError={paymentError}
          paymentLoading={paymentLoading}
          purchaseKind={topUpPurchaseKind}
        />
      )}
      </ResponsiveCanvas>
      {notice ? <div className="notice" role="status">{notice}</div> : null}
    </div>
  );
}

function ResponsiveCanvas({ children, route }) {
  const stageRef = useRef(null);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    const page = stage?.querySelector(':scope > .page');
    if (!stage || !page) return undefined;

    let heightFrame = 0;

    const measure = () => {
      window.cancelAnimationFrame(heightFrame);

      const pageStyles = window.getComputedStyle(page);
      const sourceWidth = Number.parseFloat(pageStyles.getPropertyValue('--canvas-width'))
        || page.offsetWidth
        || 540;
      const targetWidth = Number.parseFloat(pageStyles.getPropertyValue('--canvas-target-width'))
        || 540;
      const viewportWidth = document.documentElement.clientWidth
        || window.innerWidth;
      const responsiveScale = Math.min(1, viewportWidth / targetWidth);
      const referenceScale = targetWidth / sourceWidth;
      const scale = referenceScale * responsiveScale;

      stage.style.setProperty('--canvas-scale', scale.toFixed(6));
      stage.dataset.scaled = responsiveScale < 0.999 ? 'true' : 'false';
      page.style.zoom = '1';
      page.style.transform = `scale(${scale})`;

      heightFrame = window.requestAnimationFrame(() => {
        const fixedCanvasHeight = Number.parseFloat(pageStyles.getPropertyValue('--canvas-height'));
        const naturalHeight = fixedCanvasHeight || Math.max(page.scrollHeight, page.offsetHeight);
        stage.style.height = `${Math.ceil(naturalHeight * scale)}px`;
      });
    };

    const pageObserver = new ResizeObserver(measure);
    pageObserver.observe(page);
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    window.addEventListener('load', measure);
    document.fonts?.ready.then(measure);
    measure();

    return () => {
      window.cancelAnimationFrame(heightFrame);
      pageObserver.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
      window.removeEventListener('load', measure);
    };
  }, [route]);

  return (
    <div className="responsive-canvas" ref={stageRef}>
      {children}
    </div>
  );
}

function Header({ balance, goTo, isLoggedIn, profileName, setAuthIntent }) {
  const openLogin = () => {
    setAuthIntent?.('default');
    goTo('login');
  };

  return (
    <header className="topbar">
      <button className="brand" type="button" onClick={() => goTo('home')} aria-label="На главную">
        <BrandMark />
      </button>
      {isLoggedIn ? (
        <button className="account-pill" type="button" onClick={() => goTo('profile')} aria-label="Открыть профиль">
          <span className="account-balance">
            <Coin />
            <strong>{formatBalance(balance)}</strong>
          </span>
          <span className="avatar-sm">{profileInitial(profileName)}</span>
        </button>
      ) : (
        <button className="login-pill" type="button" onClick={openLogin}>
          <span className="login-avatar">●</span>
          <span>Войти</span>
        </button>
      )}
    </header>
  );
}

function BrandMark({ className = '' }) {
  return (
    <span className={`brand-mark ${className}`} aria-hidden="true">
      <img className="brand-image" alt="" src={assets.brandLogo} />
    </span>
  );
}

function HomeBrandLink({ className = '', goTo }) {
  return (
    <a
      className="brand-home-link"
      href="#/"
      onClick={(event) => {
        event.preventDefault();
        goTo('home');
      }}
      aria-label="На главную"
    >
      <BrandMark className={className} />
    </a>
  );
}

function FooterBrandMark() {
  return (
    <span className="footer-brand-mark">
      <a className="footer-brand-home-link" href="#/" aria-label="На главную">
        <img alt="" src="/generated/footer-logo-mcp.png" />
      </a>
    </span>
  );
}

function LegacyBrandMark({ className = '' }) {
  return (
    <span className={`brand-mark ${className}`} aria-hidden="true">
      <img className="brand-letters" alt="" src={assets.brandLetters} />
      <img className="brand-zig brand-zig-top-left" alt="" src={assets.brandZigTopLeft} />
      <img className="brand-zig brand-zig-top-mid" alt="" src={assets.brandZigBottom} />
      <img className="brand-zig brand-zig-top-right" alt="" src={assets.brandZigTopRight} />
      <img className="brand-zig brand-zig-bottom-left" alt="" src={assets.brandZigBottom} />
      <img className="brand-zig brand-zig-bottom-mid" alt="" src={assets.brandZigShort} />
      <img className="brand-zig brand-zig-bottom-right" alt="" src={assets.brandZigBottom} />
      <span className="brand-games">И Г Р Ы</span>
    </span>
  );
}

function HomePage(props) {
  const {
    balance,
    filter,
    favorites,
    goTo,
    isLoggedIn,
    openGame,
    promo,
    promoLoading,
    profileName,
    setFilter,
    setPromo,
    setAuthIntent,
    showNotice,
    toggleFavorite,
    activatePromo,
  } = props;

  const filteredGames = useMemo(() => {
    return games.filter((game) => {
      if (filter === 'free' && !game.tags.includes('free')) return false;
      if (filter === 'no-props' && !game.tags.includes('no-props')) return false;
      if (filter === 'favorite' && (!isLoggedIn || !favorites.has(game.id))) return false;
      return true;
    });
  }, [favorites, filter, isLoggedIn]);

  const homeClasses = [
    'page',
    'home-page',
    isLoggedIn ? 'is-logged-in' : 'is-guest',
    filter === 'all' ? 'filter-all' : 'has-filter',
    promo ? 'has-promo' : 'promo-empty',
  ].join(' ');
  const scrollToCatalog = () => {
    document.querySelector('.home-page .catalog')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  return (
    <main className={homeClasses}>
      <section className="hero-section">
        <img
          alt=""
          aria-hidden="true"
          className="hero-decoration"
          src="/generated/home-hero-decoration-figma.svg"
        />
        <Header
          balance={balance}
          goTo={goTo}
          isLoggedIn={isLoggedIn}
          profileName={profileName}
          setAuthIntent={setAuthIntent}
        />
        <a className="hero-logo" href="#/" aria-label="На главную"><img alt="Битва игры" src={assets.homeHeroLogo} /></a>
        <div className="hero-art">
          <img alt="" className="hero-art-base" src={assets.homeHeroArtBase} />
          <img alt="" className="hero-art-glow" src={assets.homeHeroArtGlow} />
        </div>
        <div className="hero-copy">
          <img className="hero-title-vector" alt="место, где начинается веселье" src={assets.homeHeroTitle} />
          <p>
            Сервис с готовыми онлайн-<br />
            играми и играми для компании<br />
            дома: от быстрых развлечений<br />
            до полноценных игровых<br />
            вечеринок.
          </p>
        </div>
        <div className="company-copy">
          <h2>для компаний</h2>
          <p>
            Собирай друзей, семью<br />
            или коллег и превращай<br />
            обычный вечер в игру.
          </p>
        </div>
        <button className="play-main" type="button" onClick={scrollToCatalog} aria-label="Перейти к каталогу игр">
          <svg className="play-main-arc" viewBox="0 0 137 143" aria-hidden="true">
            <defs>
              <path id="hero-play-arc" d="M 37 14 A 68 68 0 0 1 130 61" />
            </defs>
            <text>
              <textPath href="#hero-play-arc">заглянуть в коробку</textPath>
            </text>
          </svg>
          <span className="play-main-triangle" aria-hidden="true" />
        </button>
      </section>

      <section className="light-section">
        <div className="intro-grid">
          <div>
            <h2>Просто выбирайте <span>игру...</span></h2>
            <p>
              ...а мы позаботимся<br />
              обо всём остальном: всё уже продумано, чтобы<br />
              вы не тратили время<br />
              на подготовку, а сразу погружались в процесс.
            </p>
          </div>
          <article className="feature-card">
            <FeaturedGameCard onPlay={() => goTo('music-detail')} />
            <div className="feature-blanks" aria-label="Бланки внутри">
              <h3>Бланки внутри!</h3>
              <div className="feature-blank-options">
                <a className="feature-blank-option" href="#/music-buy-blanks" onClick={(event) => { event.preventDefault(); goTo('music-buy-blanks'); }}>
                  <span><strong>5 бланков</strong><small>для игры</small></span>
                  <b><span className="display-label">250 р.</span></b>
                </a>
                <a className="feature-blank-option" href="#/music-buy-blanks" onClick={(event) => { event.preventDefault(); goTo('music-buy-blanks'); }}>
                  <span><strong>10 бланков</strong><small>для игры</small></span>
                  <b><span className="display-label">500 р.</span></b>
                </a>
              </div>
            </div>
          </article>
        </div>

        <section className="catalog" id="games" aria-label="Каталог игр">
          <div className="filters">
            <FilterButton active={filter === 'free'} onClick={() => setFilter(filter === 'free' ? 'all' : 'free')}>Бесплатно</FilterButton>
            <FilterButton active={filter === 'no-props'} onClick={() => setFilter(filter === 'no-props' ? 'all' : 'no-props')}>Без реквизита</FilterButton>
            <button className={`heart-filter ${filter === 'favorite' ? 'is-active' : ''}`} type="button" onClick={() => setFilter(filter === 'favorite' ? 'all' : 'favorite')} aria-label="Избранное">
              <img alt="" aria-hidden="true" src="/generated/layout4-icons/heart.png" />
            </button>
          </div>
          <div className="game-grid">
            {filteredGames.map((game) => (
              <GameCard
                key={game.id}
                game={game}
                favorite={isLoggedIn && favorites.has(game.id)}
                onFavorite={() => toggleFavorite(game.id)}
                onHelp={game.comingSoon ? undefined : () => goTo(routeForGame(game, isLoggedIn))}
                onPlay={game.comingSoon ? undefined : () => openGame(game)}
              />
            ))}
            {!filteredGames.length ? <div className="empty">Ничего не найдено</div> : null}
          </div>
        </section>

        <PromoBlock promo={promo} promoLoading={promoLoading} setPromo={setPromo} activatePromo={activatePromo} />
      </section>
      <Footer />
    </main>
  );
}

function FeaturedGameCard({ onPlay }) {
  return (
    <article className="featured-game-card is-clickable">
      <img alt="" src={assets.musical} />
      <button
        className="game-card-hitbox"
        type="button"
        onClick={onPlay}
        aria-label="Открыть Музыкальное лото"
      />
      <div className="featured-game-card-text">
        <span className="featured-badge">🔥 хит недели</span>
        <h3>Музыкальное<br />лото</h3>
      </div>
      <span className="featured-play" aria-hidden="true" />
    </article>
  );
}

function FilterButton({ active, children, onClick }) {
  return (
    <button className={`filter ${active ? 'is-active' : ''}`} type="button" onClick={onClick}>
      {children}
    </button>
  );
}

function GameCard({ compact, favorite, favoriteOnly, game, onFavorite, onHelp, onPlay }) {
  const isComingSoon = Boolean(game.comingSoon);
  const isCardClickable = !favoriteOnly && !isComingSoon && typeof onPlay === 'function';
  const actionLabel = `Открыть ${game.title}`;

  return (
    <article className={`game-card is-${game.id} ${compact ? 'is-compact' : ''} ${favoriteOnly ? 'is-favorite-only' : ''} ${isCardClickable ? 'is-clickable' : ''} ${isComingSoon ? 'is-coming-soon' : ''}`}>
      <img alt="" src={game.image} />
      {isCardClickable ? (
        <button
          className="game-card-hitbox"
          type="button"
          onClick={onPlay}
          aria-label={actionLabel}
        />
      ) : null}
      <div className="game-card-top">
        <h3>{favoriteOnly && game.id === 'mafia' ? 'Распредели\u00adтель ролей в мафии' : game.title}</h3>
        {!compact && isComingSoon ? (
          <span className="game-card-coming-help" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M12.1 4.8c2.6 0 4.3 1.5 4.3 3.75 0 1.6-.83 2.63-2.25 3.5-1.08.68-1.38 1.2-1.38 2.23h-2.2c0-1.65.55-2.73 1.96-3.6 1.01-.61 1.59-1.12 1.59-2.03 0-1.02-.75-1.72-2.03-1.72-1.25 0-2.11.73-2.28 2.02l-2.21-.31C7.86 6.26 9.6 4.8 12.1 4.8Zm-1.52 10.85h2.32v2.31h-2.32v-2.31Z" />
            </svg>
          </span>
        ) : null}
        {!compact && !isComingSoon ? (
          <button className="help" type="button" onClick={onHelp || onPlay} aria-label={`Информация: ${game.title}`}>
            <img alt="" aria-hidden="true" src="/generated/layout4-icons/question.png" />
          </button>
        ) : null}
      </div>
      <div className="game-card-actions">
        {favoriteOnly ? (
          <button className={`like ${favorite ? 'is-liked' : ''}`} type="button" onClick={onFavorite} aria-label="В избранное">
            <img alt="" aria-hidden="true" src="/generated/layout4-icons/heart.png" />
          </button>
        ) : null}
        {!favoriteOnly && !isComingSoon ? (
          <span className="play-card" aria-hidden="true" />
        ) : null}
      </div>
      {isComingSoon ? (
        <>
          <span className="game-card-coming-lock" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M8.2 10.25V7.8a3.8 3.8 0 1 1 7.6 0v2.45h1.1c1.16 0 2.1.94 2.1 2.1v6.55c0 1.16-.94 2.1-2.1 2.1H7.1A2.1 2.1 0 0 1 5 18.9v-6.55c0-1.16.94-2.1 2.1-2.1h1.1Zm1.85 0h3.9V7.8a1.95 1.95 0 1 0-3.9 0v2.45Z" />
              <circle cx="12" cy="15.1" r="1.4" />
              <rect x="11.3" y="15.1" width="1.4" height="2.9" rx="0.7" />
            </svg>
          </span>
          <span className="game-card-placeholder">в разработке</span>
        </>
      ) : null}
    </article>
  );
}

function PromoBlock({ promo, promoLoading, setPromo, activatePromo }) {
  return (
    <section className="promo-block">
      <h2>Есть <span>промокод?</span></h2>
      <div className="promo-input-wrap">
        <input
          aria-label="Промокод"
          value={promo}
          placeholder="Промокод"
          maxLength={PROMO_LIMIT}
          disabled={promoLoading}
          onChange={(event) => setPromo(event.target.value.slice(0, PROMO_LIMIT))}
        />
        <button type="button" disabled={promoLoading} onClick={activatePromo} aria-busy={promoLoading} aria-label="Активировать промокод">
          <img alt="" aria-hidden="true" src="/generated/promo-arrow-icon-figma.svg" />
        </button>
      </div>
      <div className="promo-caption">
        <PromoCoin />
        <div className="promo-caption-copy">
          <div className="promo-caption-title"><span>Активируйте</span><strong>промокод</strong></div>
          <p>монеты автоматически зачислятся на баланс<br />после регистрации</p>
        </div>
      </div>
    </section>
  );
}

function ProfilePage({ activatePromo, balance, favorites, goBack, goTo, logout, onTopUp, profileName, promo, promoLoading, purchasesCount, setProfileName, setPromo, showNotice }) {
  const nameInputRef = useRef(null);
  const counters = {
    favoritesCount: favorites.size,
    purchasesCount,
  };
  const rows = accountRows.map(([icon, label, countKey, target]) => {
    const count = countKey ? Number(counters[countKey]) : 0;
    return [icon, label, Number.isFinite(count) && count > 0 ? String(count) : '', target];
  });
  const handleAccountAction = (target, label) => {
    if (/^https:\/\//i.test(target)) {
      window.location.assign(target);
      return;
    }
    if (target !== 'profile') {
      goTo(target);
      return;
    }
    if (label === 'Редактировать профиль') {
      nameInputRef.current?.focus();
      showNotice('Можно изменить имя');
      return;
    }
    showNotice(`${label}: раздел готовится`);
  };

  return (
    <PageFrame title="Личный кабинет" goBack={goBack} goTo={goTo} pageClassName="profile-page">
      <section className="profile-head">
        <Avatar name={profileName} size="large" />
        <div>
          <label
            className="profile-name"
          >
            <span className="profile-name-field">
              <span className="profile-name-measure" aria-hidden="true">{profileName || ' '}</span>
              <input
                ref={nameInputRef}
                value={profileName}
                onChange={(event) => setProfileName(event.target.value)}
                aria-label="Имя"
              />
            </span>
            <span className="profile-pencil-icon" aria-hidden="true">
              <img alt="" src="/generated/profile-pencil-figma.svg" />
            </span>
          </label>
          <p>ID 0427</p>
        </div>
        <BalanceBadge balance={balance} />
      </section>
      <ProfileWallet
        activatePromo={activatePromo}
        balance={balance}
        promo={promo}
        promoLoading={promoLoading}
        onTopUp={onTopUp}
        setPromo={setPromo}
      />
      <h2 className="section-title">Управление аккаунтом</h2>
      <div className="account-list">
        {rows.map(([icon, label, count, target]) => (
          <button key={label} type="button" onClick={() => handleAccountAction(target, label)}>
            <em>{icon}</em>
            <span>{label}</span>
            {count ? <b>{count}</b> : null}
            <i>›</i>
          </button>
        ))}
        <button type="button" className="logout" onClick={logout}>Выйти из аккаунта</button>
      </div>
      <button type="button" className="account-logout" onClick={logout} aria-label="Выйти из аккаунта">
        <em aria-hidden="true">⇥</em>
        <span>Выйти</span>
        <i aria-hidden="true">›</i>
      </button>
    </PageFrame>
  );
}

function ProfileWallet({ activatePromo, balance, onTopUp, promo, promoLoading, setPromo }) {
  return (
    <section className="profile-wallet">
      <div className="profile-balance-panel">
        <span>Баланс</span>
        <strong>{formatBalance(balance)}</strong>
        <button type="button" onClick={onTopUp}>Пополнить</button>
      </div>
      <div className="profile-promo-panel">
        <h2>Есть <span>промокод?</span></h2>
        <div className="profile-promo-input">
          <input
            aria-label="Промокод"
            value={promo}
            placeholder="Промокод"
            maxLength={PROMO_LIMIT}
            disabled={promoLoading}
            onChange={(event) => setPromo(event.target.value.slice(0, PROMO_LIMIT))}
          />
          <button type="button" disabled={promoLoading} onClick={activatePromo} aria-busy={promoLoading} aria-label="Активировать промокод">
            <img alt="" aria-hidden="true" src="/generated/promo-arrow-icon-figma.svg" />
          </button>
        </div>
        <p><Coin /> Активируйте <strong>промокод</strong><br />и получите начисление<br />на баланс</p>
      </div>
    </section>
  );
}

function AccountSummary({ balance, profileName, showEditIcon = true }) {
  return (
    <section className="account-summary">
      <div className="account-summary-user">
        <Avatar name={profileName} size="large" />
        <div>
          <div className="account-summary-name-row">
            <h2>{profileName}</h2>
            {showEditIcon ? (
              <img className="account-summary-pencil" alt="" aria-hidden="true" src="/generated/profile-pencil-figma.svg" />
            ) : null}
          </div>
          <p>ID 0427</p>
        </div>
      </div>
      <BalanceBadge balance={balance} />
    </section>
  );
}

function FavoritesPage({ balance, favorites, goBack, goTo, isLoggedIn, profileName, toggleFavorite }) {
  const list = isLoggedIn ? games.filter((game) => favorites.has(game.id)) : [];
  const pageClassName = `favorites-page ${isLoggedIn && list.length === games.length ? 'favorites-complete' : 'favorites-live'}`;
  return (
    <PageFrame title="Избранное" goBack={goBack} goTo={goTo} pageClassName={pageClassName}>
      {isLoggedIn ? <AccountSummary balance={balance} profileName={profileName} /> : null}
      <div className="game-grid inner">
        {list.map((game) => (
          <GameCard
            key={game.id}
            game={game}
            favorite
            favoriteOnly
            onFavorite={() => toggleFavorite(game.id)}
            onPlay={() => playGame(game, isLoggedIn, goTo)}
          />
        ))}
      </div>
      {!list.length ? <div className="empty-panel">В избранном пусто</div> : null}
      <button className="show-all live" type="button" onClick={() => goTo('home')}>Показать все игры</button>
    </PageFrame>
  );
}

function FormsPage({ goBack, goTo, onStartGame, purchasedBlanks, showNotice }) {
  return (
    <PageFrame backRoute="purchases" title="Музыкальное лото дома" goBack={goBack} goTo={goTo} pageClassName="forms-page">
      <PurchaseHero compact />
      <PurchasedBlankList
        goTo={goTo}
        purchasedBlanks={purchasedBlanks}
        showNotice={showNotice}
      />
      <GamePreparationCard onStartGame={onStartGame} />
      <button className="primary-wide how-button" type="button" onClick={() => goTo('music-detail')}>
        <span className="display-label">Как играть?</span>
      </button>
    </PageFrame>
  );
}

function purchasedBlankViewModels(purchasedBlanks) {
  const iconByCategory = {
    Девичник: ['/generated/forms-icon-devichnik-figma.png', 'pink'],
    'Хиты 90-х': ['/generated/forms-icon-90s-figma.png', 'blue'],
    'Хиты 2000-х': ['/generated/forms-icon-2000s-figma.png', 'yellow'],
    'Хиты караоке': ['/generated/forms-icon-karaoke-figma.png', 'green'],
  };
  return purchasedBlanks.map((blank) => {
    const [iconImage = '/generated/forms-icon-karaoke-figma.png', tone = 'green'] = iconByCategory[blank.category] || [];
    const count = normalizeBlankCount(blank.count);
    return {
      id: blank.id || `${blank.category}-${blank.date}-${blank.count}`,
      title: blank.category,
      category: blank.category,
      count,
      packSeed: blank.packSeed || blank.id || `${blank.category}-${blank.date}-${blank.count}`,
      iconImage,
      tone,
      tags: [blank.date || 'сегодня', `${count} бланков`],
    };
  });
}

async function downloadPurchasedBlankPack(blank, showNotice) {
  const count = Math.min(BLANK_MAX_COUNT, Math.max(1, Number(blank.count) || 1));
  const category = normalizeMusicCategory(blank.category) || DEFAULT_MUSIC_CATEGORY;
  showNotice(`Готовим ${count} бланков…`);

  try {
    const catalog = await loadLotoCatalog();
    const availableBlankFiles = catalog?.categories?.[category]?.blanks || [];
    const packSeed = blank.packSeed || blank.id || `${category}-${blank.date}-${count}`;
    const blankFiles = selectRandomBlankFiles(availableBlankFiles, count, packSeed);
    if (blankFiles.length !== count) {
      throw new Error(`Not enough blanks for ${category}: ${blankFiles.length}/${count}`);
    }

    const archive = new JSZip();
    const batchSize = 6;
    for (let offset = 0; offset < blankFiles.length; offset += batchSize) {
      const files = await Promise.all(
        blankFiles.slice(offset, offset + batchSize).map(async (filePath) => {
          const response = await fetch(filePath);
          if (!response.ok) throw new Error(`Blank request failed: ${response.status}`);
          return { filePath, data: await response.arrayBuffer() };
        }),
      );
      files.forEach(({ filePath, data }) => {
        archive.file(filePath.split('/').pop(), data);
      });
    }

    const file = await archive.generateAsync({ type: 'blob', compression: 'STORE' });
    const url = URL.createObjectURL(file);
    const anchor = document.createElement('a');
    const safeCategory = category.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '-').replace(/^-|-$/g, '');
    anchor.href = url;
    anchor.download = `музыкальное-лото-${safeCategory || 'бланки'}-${count}-бланков.zip`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    showNotice(`${category}: скачано ${count} бланков`);
  } catch (error) {
    console.error(error);
    showNotice('Не удалось скачать бланки. Попробуйте ещё раз');
  }
}

function PurchasedBlankList({ purchasedBlanks, showNotice }) {
  const [showAllPurchases, setShowAllPurchases] = useState(false);
  const allBlanks = purchasedBlankViewModels(purchasedBlanks).reverse();
  const blanks = showAllPurchases ? allBlanks : allBlanks.slice(0, 3);
  return (
    <>
      <h2 className="forms-title">Мои бланки</h2>
      {blanks.map((blank) => (
        <PurchaseCard
          key={blank.id}
          title={blank.title}
          iconImage={blank.iconImage}
          tone={blank.tone}
          tags={blank.tags}
          meta=""
          action="Скачать"
          onClick={() => downloadPurchasedBlankPack(blank, showNotice)}
        />
      ))}
      {!blanks.length ? <div className="empty-panel">Бланков пока нет</div> : null}
      {allBlanks.length > 3 && !showAllPurchases ? (
        <button className="show-all live" type="button" onClick={() => setShowAllPurchases(true)}>
          Показать все покупки
        </button>
      ) : null}
    </>
  );
}

function GamePreparationCard({ onStartGame }) {
  return (
    <section className="prep-card">
      <h2><span>Этапы</span> подготовки к игре</h2>
      <div className="prep-step">
        <b>1</b>
        <p><strong>Распечатайте бланки</strong>Каждому участнику нужен бланк — распечатанный<br />или на телефоне, главное чтобы можно было зачёркивать поля.</p>
      </div>
      <button className="prep-step prep-step-action" type="button" onClick={onStartGame}>
        <b>2</b>
        <p><strong>Начните играть</strong>Жмите «Начать игру» и включайте песни вашей категории.</p>
      </button>
    </section>
  );
}

function PurchaseHero({ actionLabel, compact, goTo }) {
  return (
    <section className={`purchase-hero ${compact ? 'is-compact' : ''} ${actionLabel ? 'has-action' : ''}`}>
      <div>
        <h2>
          <span className="purchase-title-text">Музыкальное лото</span>
          <span className="purchase-home-mark"><img alt="дома" src="/generated/purchase-home-doma-figma-transparent.png" /></span>
        </h2>
        {actionLabel ? <button type="button" onClick={() => goTo('forms')}>{actionLabel} <img alt="" aria-hidden="true" src="/generated/layout4-icons/purchase-chevron.png" /></button> : null}
      </div>
      <div className="purchase-sheet" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="purchase-pencil" aria-hidden="true" />
    </section>
  );
}

function PurchaseCard({ action, icon, iconImage, meta, onClick, tags, title, tone }) {
  const tagIcons = ['/generated/figma-icon-calendar.svg', '/generated/figma-icon-invoice.svg'];
  return (
    <article className="purchase-card">
      <div className={`blank-icon is-${tone || 'orange'}`} aria-hidden="true">
        {iconImage ? <img alt="" src={iconImage} /> : icon || '↓'}
      </div>
      <div className="purchase-card-copy">
        <h3>{title}</h3>
        <p>{meta}</p>
        {tags?.length ? (
          <div className="blank-tags">
            {tags.map((tag, index) => (
              <span key={tag}>
                {tagIcons[index] ? <img alt="" src={tagIcons[index]} /> : null}
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <button type="button" onClick={onClick} aria-label={`${action} ${title}`}>
        <span className="download-mark" aria-hidden="true">
          <img alt="" src="/generated/figma-icon-download.svg" />
        </span>
      </button>
    </article>
  );
}

function RegisterPage({ email, errors, goBack, goTo, loading, name, onSubmit, password, passwordConfirm, setEmail, setName, setPassword, setPasswordConfirm }) {
  const [isAgreed, setIsAgreed] = useState(false);
  const hasErrors = Object.values(errors).some(Boolean);
  return (
    <AuthPage
      title="Регистрация"
      hero={<><span>Войдите</span><br />или зарегистрируйтесь</>}
      cardTitle="Создайте аккаунт"
      progress={1}
      goTo={goTo}
      goBack={goBack}
      pageClassName="register-page"
    >
      <div className="auth-fields">
        <AuthField error={errors.name}>
          <AuthInput autoComplete="name" error={Boolean(errors.name)} label="Ваше имя" onChange={(event) => setName(event.target.value)} value={name} />
        </AuthField>
        <AuthField error={errors.email}>
          <AuthInput autoComplete="email" error={Boolean(errors.email)} label="Электронная почта" onChange={(event) => setEmail(event.target.value)} type="email" value={email} />
        </AuthField>
        <AuthField error={errors.password}>
          <AuthInput autoComplete="new-password" error={Boolean(errors.password)} label="Пароль" onChange={(event) => setPassword(event.target.value)} revealable type="password" value={password} />
        </AuthField>
        <AuthField error={errors.passwordConfirm}>
          <AuthInput autoComplete="new-password" error={Boolean(errors.passwordConfirm)} label="Подтвердите пароль" onChange={(event) => setPasswordConfirm(event.target.value)} revealable type="password" value={passwordConfirm} />
        </AuthField>
      </div>
      <label className="checkbox">
        <input checked={isAgreed} type="checkbox" onChange={(event) => setIsAgreed(event.target.checked)} />
        <span>Я согласен на <a href="#/privacy" onClick={(event) => { event.preventDefault(); event.stopPropagation(); goTo('privacy'); }}>обработку персональных данных</a></span>
      </label>
      <button className="primary-wide" type="button" onClick={onSubmit} disabled={!isAgreed || hasErrors || loading}>
        <span className="display-label">Создать аккаунт</span>
      </button>
      <button className="secondary-wide" type="button" onClick={() => goTo('login')}>
        <span className="display-label">Уже есть аккаунт</span>
      </button>
    </AuthPage>
  );
}

function EmailExistsPage({ email, goBack, goTo, onRecover }) {
  return (
    <AuthPage
      title="Регистрация"
      hero={<><span>Войдите</span><br />или зарегистрируйтесь</>}
      cardTitle={normalizeEmail(email) || 'email@mail.ru'}
      progress={2}
      goTo={goTo}
      goBack={() => goBack('register')}
      pageClassName="email-exists-page"
    >
      <p className="auth-subtitle">Эта почта уже зарегистрирована</p>
      <button className="primary-wide" type="button" onClick={() => {
        onRecover();
      }}>
        <span className="display-label">Войти</span>
      </button>
      <button className="link-button" type="button" onClick={onRecover}>Восстановить доступ</button>
    </AuthPage>
  );
}

function CodePage({ backRoute = 'register', email, goBack, goTo, onResend, onSuccess, showNotice, title = 'Регистрация' }) {
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [errorMessage, setErrorMessage] = useState('');
  const [resendSeconds, setResendSeconds] = useState(60);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const codeRowRef = useRef(null);
  const isReady = code.every(Boolean);
  const activeCodeIndex = code.findIndex((digit) => !digit);

  useEffect(() => {
    if (resendSeconds <= 0) return undefined;
    const timer = window.setInterval(() => {
      setResendSeconds((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendSeconds]);

  const confirmCode = async () => {
    if (!isReady || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSuccess(code.join(''));
      setErrorMessage('');
    } catch (error) {
      setCode(['', '', '', '', '', '']);
      const message = error instanceof AuthApiError && error.code === 'CODE_EXPIRED'
        ? 'Код истёк. Отправьте новый'
        : error instanceof AuthApiError && error.code === 'CODE_LOCKED'
          ? 'Слишком много попыток. Отправьте новый код'
          : 'Неверный код. Попробуйте еще раз';
      setErrorMessage(message);
      if (error instanceof AuthApiError && error.retryAfter) setResendSeconds(error.retryAfter);
      if (!(error instanceof AuthApiError) || ['AUTH_SERVER_UNAVAILABLE', 'INTERNAL_ERROR'].includes(error.code)) {
        showNotice(authErrorMessage(error));
      }
      window.requestAnimationFrame(() => codeRowRef.current?.querySelector('input')?.focus());
    } finally {
      setIsSubmitting(false);
    }
  };

  const resendCode = async () => {
    if (resendSeconds > 0 || isSubmitting) return;
    setCode(['', '', '', '', '', '']);
    setErrorMessage('');
    setIsSubmitting(true);
    try {
      const result = await onResend();
      setResendSeconds(Number(result?.retryAfter || 60));
    } catch (error) {
      if (error instanceof AuthApiError && error.retryAfter) setResendSeconds(error.retryAfter);
      showNotice(authErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthPage
      title={title}
      hero={<>Подтвердите<br /><span>почту</span></>}
      cardTitle={normalizeEmail(email) || 'email@mail.ru'}
      progress={2}
      goTo={() => goTo(backRoute)}
      goBack={() => goBack(backRoute)}
      pageClassName="code-page"
    >
      <p className="auth-subtitle">Введите код из 6 цифр, которые вы получили<br />по электронной почте</p>
      <div ref={codeRowRef} className={`code-row ${errorMessage ? 'has-error' : ''}`}>
        {code.map((value, index) => (
          <input
            key={index}
            aria-label={`Цифра кода ${index + 1}`}
            autoFocus={index === 0}
            className={index === (activeCodeIndex === -1 ? code.length - 1 : activeCodeIndex) ? 'is-active' : ''}
            inputMode="numeric"
            maxLength={1}
            placeholder=" "
            value={value}
            onChange={(event) => {
              const next = [...code];
              const value = event.target.value.replace(/\D/g, '').slice(0, 1);
              next[index] = value;
              setCode(next);
              setErrorMessage('');
              if (value) {
                event.currentTarget.parentElement?.querySelectorAll('input')?.[index + 1]?.focus();
              }
            }}
            onPaste={(event) => {
              event.preventDefault();
              const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, code.length);
              if (!pasted) return;
              const next = [...code];
              pasted.split('').forEach((digit, pastedIndex) => {
                next[pastedIndex] = digit;
              });
              setCode(next);
              setErrorMessage('');
              event.currentTarget.parentElement?.querySelectorAll('input')?.[Math.min(pasted.length, code.length) - 1]?.focus();
            }}
          />
        ))}
      </div>
      {errorMessage ? <p className="auth-code-error">{errorMessage}</p> : null}
      <button className="link-button" type="button" onClick={resendCode} disabled={resendSeconds > 0 || isSubmitting}>
        {resendSeconds > 0 ? `Отправить еще один код через 00:${String(resendSeconds).padStart(2, '0')}` : 'Отправить еще один код'}
      </button>
      <button className="secondary-wide code-confirm" type="button" onClick={confirmCode} disabled={!isReady || isSubmitting}>
        <span className="display-label">Подтвердить</span>
      </button>
    </AuthPage>
  );
}

function SuccessPage({ goBack, goTo }) {
  return (
    <AuthPage
      title="Купить бланки"
      hero={<><span>Урааа!</span></>}
      cardTitle={null}
      confetti
      success
      goTo={goTo}
      goBack={goBack}
      pageClassName="register-success-page"
    >
      <div className="success-document" aria-hidden="true"></div>
      <h1>Спасибо за покупку</h1>
      <p className="auth-subtitle">Бланки уже доступны в личном кабинете, скачайте и распечатайте их</p>
      <button className="primary-wide" type="button" onClick={() => goTo('profile')}>
        <span className="display-label">В личный кабинет</span>
      </button>
      <button className="secondary-wide" type="button" onClick={() => goTo('music-game')}>
        <span className="display-label">Вернуться в игру</span>
      </button>
    </AuthPage>
  );
}

function AuthModeToggle({ mode, setMode }) {
  return (
    <div className="auth-mode-toggle" role="group" aria-label="Способ входа">
      <button className={mode === 'password' ? 'is-active' : ''} type="button" onClick={() => setMode('password')}>Ввести пароль</button>
      <button className={mode === 'code' ? 'is-active' : ''} type="button" onClick={() => setMode('code')}>Код</button>
    </div>
  );
}

function LoginPage({ email, error, goBack, goTo, loading, mode, onRecover, onSubmit, password, setEmail, setMode, setPassword }) {
  const isCredentialsError = error === 'credentials';
  const isNotFoundError = error === 'not-found';
  return (
    <AuthPage
      title="Вход в аккаунт"
      hero={<><span>Войдите</span> в аккаунт</>}
      cardTitle="Войти"
      progress={1}
      goTo={goTo}
      goBack={goBack}
      pageClassName="login-page"
    >
      <AuthModeToggle mode={mode} setMode={setMode} />
      <div className="auth-fields login-fields">
        <AuthField error={isNotFoundError ? 'Аккаунт не найден. Проверьте, правильно ли введены данные или зарегистрируйтесь' : ''}>
          <AuthInput
            autoComplete="email"
            error={isCredentialsError || isNotFoundError}
            label="Электронная почта"
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            value={email}
          />
        </AuthField>
        {mode === 'password' ? (
          <AuthField error={isCredentialsError ? 'Неверный email или пароль' : ''}>
            <AuthInput
              autoComplete="current-password"
              error={isCredentialsError}
              label="Пароль"
              onChange={(event) => setPassword(event.target.value)}
              revealable
              type="password"
              value={password}
            />
          </AuthField>
        ) : null}
      </div>
      {isCredentialsError ? <button className="link-button auth-recovery-link" type="button" onClick={onRecover}>Восстановить доступ</button> : null}
      <button className="primary-wide" type="button" onClick={onSubmit} disabled={Boolean(error) || loading}>
        <span className="display-label">{mode === 'password' ? 'Войти' : 'Получить код на почту'}</span>
      </button>
      <button className="secondary-wide auth-register-action" type="button" onClick={() => goTo('register')}>
        <span className="display-label">Регистрация</span>
      </button>
    </AuthPage>
  );
}

function NewPasswordPage({ email, goBack, goTo, onSubmit }) {
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async () => {
    const nextErrors = {
      password: !isValidAuthPassword(password) ? 'Минимум 8 символов, буквы и цифры' : '',
      passwordConfirm: password !== passwordConfirm ? 'Пароли не совпадают' : '',
    };
    if (Object.values(nextErrors).some(Boolean)) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    setIsSubmitting(true);
    try {
      await onSubmit(password);
    } catch (error) {
      setErrors({ password: authErrorMessage(error) });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthPage
      title="Вход в аккаунт"
      hero={<>Придумаем <span>новый пароль?</span></>}
      cardTitle={normalizeEmail(email) || 'email@mail.ru'}
      progress={2}
      goTo={goTo}
      goBack={() => goBack('login')}
      pageClassName="new-password-page"
    >
      <div className="auth-fields">
        <AuthField error={errors.password}>
          <AuthInput autoComplete="new-password" error={Boolean(errors.password)} label="Новый пароль" onChange={(event) => { setPassword(event.target.value); setErrors((current) => ({ ...current, password: '', passwordConfirm: '' })); }} type="password" value={password} />
        </AuthField>
        <AuthField error={errors.passwordConfirm}>
          <AuthInput autoComplete="new-password" error={Boolean(errors.passwordConfirm)} label="Повторите пароль" onChange={(event) => { setPasswordConfirm(event.target.value); setErrors((current) => ({ ...current, passwordConfirm: '' })); }} type="password" value={passwordConfirm} />
        </AuthField>
      </div>
      <button className="primary-wide" type="button" onClick={submit} disabled={isSubmitting}>
        <span className="display-label">Подтвердить пароль</span>
      </button>
      <button className="secondary-wide" type="button" onClick={() => goTo('login')}>
        <span className="display-label">Пропустить</span>
      </button>
    </AuthPage>
  );
}

function PrivacyPage({ goBack, goTo }) {
  return (
    <PageFrame title="Политика" goBack={goBack} goTo={goTo} pageClassName="privacy-page">
      <section className="privacy-card">
        <h1>Политика конфиденциальности</h1>
        <p>Мы используем введенные данные только для регистрации, входа в аккаунт, сохранения покупок и связи с пользователем по игровым материалам.</p>
        <p>Данные не отображаются публично и могут быть изменены в личном кабинете.</p>
        <button className="primary-wide" type="button" onClick={() => goTo('register')}>
          <span className="display-label">Вернуться к регистрации</span>
        </button>
      </section>
    </PageFrame>
  );
}

function LoggedInHome({ balance, goBack, goTo, profileName }) {
  return (
    <PageFrame title="Вход в аккаунт" balance={balance} goBack={goBack} goTo={goTo} profileName={profileName} pageClassName="logged-page">
      <h1 className="logged-title">Вы вошли<br /><span>в аккаунт</span></h1>
      <section className="logged-card">
        <div className="logged-progress" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <h2>С возвращением!</h2>
        <Avatar name={profileName} size="huge" />
        <h1>{profileName}</h1>
        <p>ID 0427</p>
        <button className="secondary-wide" type="button" onClick={() => goTo('home')}>
          <span className="display-label">На главную</span>
        </button>
      </section>
      <div className="logged-footer-spacer" aria-hidden="true" />
    </PageFrame>
  );
}

function GameDetailPage({ balance, buyGame, favorite, favorites, goBack, goTo, isLoggedIn, profileName, showNotice, toggleFavorite }) {
  const scrollToHow = () => {
    document.querySelector('#how-to-play')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const openRecommended = (game) => goTo(routeForGame(game, isLoggedIn));
  const recommended = games.filter((game) => game.id !== 'mafia').slice(0, 3);

  return (
    <main className="page game-detail">
      <section className="detail-hero">
        <div className="detail-photo">
          <img alt="" src={assets.gameHero} />
          <img alt="" aria-hidden="true" className="detail-phone-screen" src={assets.gamePhoneScreen} />
        </div>
        <div className="detail-shade" aria-hidden="true" />
        <DetailPageNav
          balance={balance}
          goBack={goBack}
          goTo={goTo}
          isLoggedIn={isLoggedIn}
          profileName={profileName}
          title="Главная"
        />
        <div className="detail-tags" aria-label="Бесплатно, от 3-х человек, без реквизита">
          <span>🔥 бесплатно</span>
          <span>от 3-х человек</span>
          <span>без реквизита</span>
          <button className={`detail-like ${favorite ? 'is-liked' : ''}`} type="button" onClick={() => toggleFavorite('mafia')} aria-label={favorite ? 'Убрать из избранного' : 'Добавить в избранное'}>
            <img
              alt=""
              aria-hidden="true"
              src={favorite
                ? '/figma-assets/572a0a0d98ac-81d9372e753489636c48fc165cba082f96daf840.svg'
                : '/figma-assets/2d1599259b29-470595e416dc45fea7c8044332d0ab0bc9a47125.svg'}
            />
          </button>
        </div>
      </section>

      <section className="detail-body" aria-label="Описание игры Распределитель ролей в мафии">
        <section className="detail-intro">
          <img className="detail-mafia-logo" alt="" src={assets.mafiaLogoMark} />
          <h1>Распределитель ролей в мафии</h1>
          <p>Здесь можно раздать роли для игры в мафию,<br />а ведущему следить за ходом игры.</p>
          <div className="detail-actions">
            <button type="button" onClick={scrollToHow}><span className="display-label">Как играть?</span></button>
            <button type="button" onClick={buyGame}><span className="display-label">Начать игру</span></button>
          </div>
        </section>

        <section className="detail-fast-start">
          <div className="detail-speed-card" aria-hidden="true">
            <img alt="" src={assets.mafiaFastIcon} />
          </div>
          <h2>
            <span>Самый быстрый старт</span>
            <span>игры в мафию</span>
          </h2>
          <p>Меньше минуты — и игра началась!</p>
        </section>

        <FeatureList />

        <section className="detail-cta" id="how-to-play">
          <button type="button" onClick={buyGame}><span className="display-label">Распределить роли</span></button>
        </section>

        <section className="detail-black-section">
          <h2 className="detail-black-title">
            <span className="detail-black-title-top">Одно устройство. Все роли.</span>
            <span className="detail-black-title-bottom">И никакого <em>хаоса!</em></span>
          </h2>
          <div className="chaos-stage" aria-hidden="true">
            <article className="chaos-card chaos-card-left">
              <img alt="" src={assets.roleCardLeftSymbol} />
              <b>Любовница</b>
              <p>Ночью проводит ночь с выбранным игроком.</p>
            </article>
            <article className="chaos-card chaos-card-main">
              <img alt="" src={assets.roleCardMafia} />
              <b>Мафия</b>
              <p>Просыпается ночью и выбирает жертву.</p>
            </article>
            <article className="chaos-card chaos-card-right">
              <img alt="" src={assets.roleCardDoctor} />
              <b>Доктор</b>
              <p>Ночью может спасти одного игрока</p>
            </article>
            <img className="chaos-symbol" alt="" src={assets.roleCardMafiaSymbol} />
          </div>
          <p>
            Приложение ведёт все этапы автоматически: телефон<br />
            передаётся по кругу, роль видит только сам игрок.
          </p>
          <button type="button" onClick={buyGame}><span className="display-label">Распределить роли</span></button>
        </section>

        <section className="detail-compare">
          <h2><span>Почему с нами — </span><em>проще?</em></h2>
          <div className="compare-grid">
            <article>
              <div className="compare-card-head">
                <h3>Наш сервис</h3>
                <img className="compare-mafia-logo" alt="1Мафия" src={assets.mafiaLogoCompare} />
                <p>Всё в одном телефоне, собирай друзей и играй сразу</p>
              </div>
              <ul>
                <li>Роли раздаются автоматически</li>
                <li>Таймеры и сценарий — встроены</li>
                <li>До старта игры — меньше минуты</li>
                <li>Ведущий может быть новичком</li>
                <li><strong>7 ролей</strong> включая Маньяка и Любовницу</li>
                <li>Телефон передаётся по кругу — роль тайная</li>
              </ul>
            </article>
            <article>
              <div className="compare-card-head">
                <h3>Обычный способ</h3>
                <b>Карточная мафия</b>
                <p>Формат самостоятельной организации игры</p>
              </div>
              <ul>
                <li>Роли нужно печатать и раздавать вручную</li>
                <li>Таймер — отдельный телефон или часы</li>
                <li>Подготовка занимает <strong>10–15 минут</strong></li>
                <li>Нужен опытный ведущий</li>
                <li>Роли ограничены набором карточек</li>
                <li>Карточки можно случайно подсмотреть</li>
              </ul>
            </article>
          </div>
          <div className="compare-speed">Подготовка ~ на 12 минут быстрее</div>
          <button type="button" onClick={buyGame}><span className="display-label">Распределить роли</span></button>
        </section>

        <HowToMafiaSection />

        <RoundsSection />

        <RolesSection />

        <section className="detail-bottom">
          <h2><span>Ночь наступила?</span><span>Раздавайте карты!</span></h2>
          <button type="button" onClick={buyGame}><span className="display-label">Начать игру</span></button>
          <h3>Вам может понравиться</h3>
          <div className="detail-recommend-grid">
            {recommended.map((game) => (
              <GameCard
                key={game.id}
                game={game}
                favorite={isLoggedIn && favorites.has(game.id)}
                onFavorite={() => toggleFavorite(game.id)}
                onHelp={() => showNotice(`${game.title}: карточка игры`)}
                onPlay={() => openRecommended(game)}
              />
            ))}
          </div>
          <button className="show-all live" type="button" onClick={() => goTo('home')}>Показать все игры</button>
        </section>
        <Footer dark />
      </section>
    </main>
  );
}

function DetailPageNav({ backRoute = 'home', balance, goBack, goTo, isLoggedIn, profileName, title }) {
  return (
    <nav className={`detail-nav new-detail-nav ${isLoggedIn ? 'detail-nav--account' : 'detail-nav--login'}`}>
      <button
        className="detail-nav-back"
        type="button"
        onClick={() => goBack(backRoute)}
        aria-label={`Назад: ${title}`}
      >
        <BackArrow className="detail-nav-back-arrow" />
        <strong>{title}</strong>
      </button>
      {isLoggedIn ? (
        <button className="nav-account detail-account" type="button" onClick={() => goTo('profile')} aria-label="Открыть профиль">
          <BalanceBadge balance={balance} />
          <Avatar name={profileName} size="small" />
        </button>
      ) : (
        <button className="close-user" type="button" onClick={() => goTo('login')}>Войти</button>
      )}
    </nav>
  );
}

function scrollToMusicBlankPurchase() {
  document.querySelector('#music-buy-blanks')?.scrollIntoView({ behavior: 'auto', block: 'start' });
}

function MusicDetailPage({ balance, favorites, focusPurchase, goBack, goTo, isLoggedIn, onStartGame, profileName, setAuthIntent, setBlankOrder, showNotice, toggleFavorite }) {
  const favorite = isLoggedIn && favorites.has('musical');
  const recommended = ['royal', 'karaoke', 'mafia']
    .map((gameId) => games.find((game) => game.id === gameId))
    .filter(Boolean);

  useEffect(() => {
    if (!focusPurchase) return;
    const frame = window.requestAnimationFrame(scrollToMusicBlankPurchase);
    return () => window.cancelAnimationFrame(frame);
  }, [focusPurchase]);

  const startGame = () => onStartGame();
  const openBlankPurchase = (event) => {
    event?.preventDefault();
    if (!focusPurchase) goTo('music-buy-blanks');
    window.requestAnimationFrame(scrollToMusicBlankPurchase);
  };

  const features = [
    {
      number: 1,
      body: (
        <>
          Распечатайте <a className="feature-accent music-blanks-inline-link" href="#/music-buy-blanks" onClick={openBlankPurchase}>индивидуальные бланки каждому участнику,</a> приготовьте ручки или карандаши.
        </>
      ),
      image: assets.musicFeaturePrint,
    },
    {
      number: 2,
      body: 'Запустите игру, на экране будут появляться композиции. Песня есть в бланке? Зачеркивайте! Параллельно подпевайте свои любимые хиты!',
      image: assets.musicFeatureLaptop,
    },
    {
      number: 3,
      body: 'Первый, кто соберет линию из зачёркнутых полей (по вертикали или горизонтали), побеждает!',
      image: assets.musicFeatureCrossout,
    },
    {
      attention: true,
      title: 'Обратите внимание!',
      body: (
        <>
          для игры понадобятся бланки,{' '}
          <span className="music-attention-link">которые можно приобрести ниже</span>
        </>
      ),
      image: assets.musicFeatureBlank,
    },
  ];

  return (
    <main className="page music-detail-page">
      <section className="music-detail-hero">
        <img className="music-detail-photo" alt="" src={assets.musicHero} />
        <DetailPageNav
          balance={balance}
          goBack={goBack}
          goTo={goTo}
          isLoggedIn={isLoggedIn}
          profileName={profileName}
          title="Главная"
        />
        <div className="detail-tags music-detail-tags" aria-label="За монеты, от 3-х человек, без реквизита">
          <span>🔥 за монеты</span>
          <span>от 3-х человек</span>
          <span>без реквизита</span>
          <button className={`detail-like ${favorite ? 'is-liked' : ''}`} type="button" onClick={() => toggleFavorite('musical')} aria-label={favorite ? 'Убрать из избранного' : 'Добавить в избранное'}>
            <img
              alt=""
              aria-hidden="true"
              src={favorite
                ? '/figma-assets/572a0a0d98ac-81d9372e753489636c48fc165cba082f96daf840.svg'
                : '/figma-assets/2d1599259b29-470595e416dc45fea7c8044332d0ab0bc9a47125.svg'}
            />
          </button>
        </div>
      </section>

      <section className="music-detail-body">
        <section className="music-intro">
          <div className="music-title-row">
            <h1>Музыкальное лото</h1>
            <img alt="дома" src="/generated/purchase-home-doma-figma-transparent.png" />
          </div>
          <p>Музыкальное лото — это игра, где каждому участнику выдаётся бланк с песнями и первый, кто соберёт комбинацию из зачеркнутых полей, побеждает!</p>
        </section>

        <section className="music-feature-grid" aria-label="Особенности музыкального лото">
          {features.map((feature) => (
              <article
                className={`music-feature-card ${feature.attention ? 'is-attention' : ''}`}
                key={feature.title || feature.number}
              >
                {feature.attention ? (
                  <a
                    className="music-blanks-attention"
                    href="#/music-buy-blanks"
                    aria-label="Купить бланки для этой игры или другой категории"
                    onClick={openBlankPurchase}
                  />
                ) : null}
                <figure>
                  <img alt="" src={feature.image} />
                  {feature.number ? <span className="feature-number">{feature.number}</span> : null}
                </figure>
                {feature.title ? <h2>{feature.title}</h2> : null}
                <p className="music-feature-copy">{feature.body}</p>
              </article>
          ))}
        </section>

        <div className="music-action-pair">
          <button className="music-start-game" type="button" onClick={startGame}>Начать игру</button>
          <button className="music-how-button" type="button" onClick={() => document.querySelector('#music-how')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Как играть?</button>
        </div>

        <section className="music-prep" id="music-how">
          <div className="music-prep-hero">
            <div className="music-prep-photo">
              <img alt="" src={assets.musicPrep} />
            </div>
            <span><b>4 простых шага</b></span>
          </div>
          <h2><span>Этапы</span> подготовки к игре</h2>
          {[
            ['Распечатайте бланки', <>Выберите категорию игры и необходимое количество бланков по форме ниже <span>(1 бланк = 1 участник).</span></>],
            ['Перейдите в личный кабинет', 'Бланки будут доступны в личном кабинете после оплаты.'],
            ['Распечатайте бланки', 'Каждому участнику нужен бланк - распечатанный или на телефоне.'],
            ['Начните играть', 'Жмите «Начать игру» и включайте песни вашей категории.'],
          ].map(([title, text], index) => (
            <div className="music-prep-step" key={`${title}-${index}`}>
              <b>{index + 1}</b>
              <p><strong>{title}</strong>{text}</p>
            </div>
          ))}
        </section>

        <button className="music-start-after-prep" type="button" onClick={startGame}>Начать игру</button>

        <MusicBuyBlanksSection
          goTo={goTo}
          isLoggedIn={isLoggedIn}
          setAuthIntent={setAuthIntent}
          setBlankOrder={setBlankOrder}
          showNotice={showNotice}
        />

        <MusicTipsStack />

        <section className="music-ready-cta">
          <h2>Всё готово? Тогда жмите!</h2>
          <button type="button" onClick={startGame}>Начать игру</button>
        </section>

        <section className="music-recommend">
          <h2>Вам может понравиться</h2>
          <div className="detail-recommend-grid">
            {recommended.map((game) => (
              <GameCard
                key={game.id}
                game={game}
                favorite={isLoggedIn && favorites.has(game.id)}
                onFavorite={() => toggleFavorite(game.id)}
                onHelp={game.comingSoon ? undefined : () => goTo(routeForGame(game, isLoggedIn))}
                onPlay={game.comingSoon ? undefined : () => playGame(game, isLoggedIn, goTo)}
              />
            ))}
          </div>
          <button className="show-all live" type="button" onClick={() => goTo('home')}>Показать все игры</button>
        </section>
      </section>
      <Footer dark />
    </main>
  );
}

function MusicBuyBlanksSection({ goTo, isLoggedIn, setAuthIntent, setBlankOrder, showNotice }) {
  const categories = ['Девичник', 'Хиты 90-х', 'Хиты 2000-х', 'Хиты караоке'];
  const [isOpen, setIsOpen] = useState(false);
  const [category, setCategory] = useState('');
  const [count, setCount] = useState(BLANK_MIN_COUNT);
  const cost = count * BLANK_UNIT_PRICE;

  const buy = () => {
    if (!category) {
      showNotice('Выберите категорию');
      setIsOpen(true);
      return;
    }
    setBlankOrder({ category, count });
    if (!isLoggedIn) {
      setAuthIntent('purchase');
      goTo('login');
      return;
    }
    goTo('buy-blanks');
  };

  return (
    <section className="blank-buy-section" id="music-buy-blanks">
      <h2><span>Купить</span> бланки</h2>
      <div className={`blank-buy-card ${isOpen ? 'is-open' : ''}`}>
        <button className="blank-category-button" type="button" onClick={() => setIsOpen((value) => !value)} aria-expanded={isOpen}>
          <span>{category || 'выбрать категорию'}</span>
          <i aria-hidden="true">
            <svg viewBox="0 0 16 16">
              <path d="M8 2.5v10M3.75 8.5 8 12.75l4.25-4.25" />
            </svg>
          </i>
        </button>
        {isOpen ? (
          <div className="blank-category-list" role="listbox">
            {categories.map((item) => (
              <button
                className={item === category ? 'is-selected' : ''}
                key={item}
                type="button"
                onClick={() => {
                  setCategory(item);
                  setIsOpen(false);
                }}
              >
                {item}
              </button>
            ))}
          </div>
        ) : null}

        <h3>Сколько бланков?</h3>
        <div className="blank-counter">
          <button
            type="button"
            aria-label="Уменьшить количество бланков"
            disabled={count <= BLANK_MIN_COUNT}
            onClick={() => setCount((value) => normalizeBlankCount(value - 1))}
          >
            <span className="blank-counter-sign" aria-hidden="true" />
          </button>
          <strong>{formatBlankCount(count)}</strong>
          <button
            type="button"
            aria-label="Увеличить количество бланков"
            disabled={count >= BLANK_MAX_COUNT}
            onClick={() => setCount((value) => normalizeBlankCount(value + 1))}
          >
            <span className="blank-counter-sign" aria-hidden="true" />
          </button>
        </div>
        <div className="blank-cost-row">
          <span><img alt="" src={assets.figmaCoin} />Стоимость: {formatBalance(cost)}</span>
          <span>1 бланк на человека</span>
        </div>
        <button className="blank-buy-submit" type="button" onClick={buy}>Купить бланки</button>
        <p>После покупки бланки будут доступны<br /><button type="button" onClick={() => {
          if (!isLoggedIn) setAuthIntent('purchase');
          goTo(isLoggedIn ? 'forms' : 'login');
        }}>в личном кабинете</button></p>
      </div>
    </section>
  );
}

function MusicBlanksPage({
  balance,
  goBack,
  goTo,
  isLoggedIn,
  onStartGame,
  profileName,
  purchasedBlanks,
  setAuthIntent,
  setBlankOrder,
  showNotice,
}) {
  return (
    <main className="page music-blanks-page">
      <DetailPageNav
        backRoute="music-game"
        balance={balance}
        goBack={goBack}
        goTo={goTo}
        isLoggedIn={isLoggedIn}
        profileName={profileName}
        title="Музыкальное лото Дома"
      />
      <section className="music-blanks-content">
        <PurchaseHero compact />
        <PurchasedBlankList
          goTo={goTo}
          purchasedBlanks={purchasedBlanks}
          showNotice={showNotice}
        />
        <MusicBuyBlanksSection
          goTo={goTo}
          isLoggedIn={isLoggedIn}
          setAuthIntent={setAuthIntent}
          setBlankOrder={setBlankOrder}
          showNotice={showNotice}
        />
        <GamePreparationCard onStartGame={onStartGame} />
        <button className="music-blanks-start" type="button" onClick={onStartGame}>Начать игру</button>
      </section>
      <Footer dark year={2026} />
    </main>
  );
}

function MusicTipsStack() {
  const tips = [
    ['Откройте игру', 'Откройте окно с игрой, в которой рандомно будут приходить песни.', 'open', assets.musicTipOpen],
    ['Подключите устройство', 'Не забудьте подключить телефон или ноутбук к колонке', 'device', assets.musicTipDevice],
    ['Пойте вместе', 'Включайте песни, зачеркивайте поля и подпевайте!', 'sing', assets.musicTipSing],
  ];
  return (
    <section className="music-tips-stack">
      {tips.map(([title, text, icon, image]) => (
        <article className={`tip-${icon}`} key={title}>
          <span className="music-tip-icon" aria-hidden="true"><img alt="" src={image} /></span>
          <div>
            <h2>{title}</h2>
            <p>{text}</p>
          </div>
        </article>
      ))}
    </section>
  );
}

function MusicGameControls({ goTo, playedSongsCount = 0, purchasedBlanksCount = 0 }) {
  const controls = [
    ['Купить и скачать бланки', 'blank', '/generated/layout4-icons/control-category.png', () => goTo('music-blanks')],
    ['Выпавшие песни', 'played', '', () => goTo('music-songs')],
    ['Объявить победителя', 'cup', '/generated/layout4-icons/control-settings.png', () => goTo('music-winner')],
    ['Новая игра', 'play', '/generated/layout4-icons/control-play.png', () => goTo('music-new-game')],
  ];

  return (
    <div className="karaoke-controls music-game-controls" aria-label="Управление игрой">
      {controls.map(([title, icon, iconSrc, onClick]) => (
        <button key={title} type="button" onClick={onClick}>
          <i className={`karaoke-control-icon is-${icon}`} aria-hidden="true">
          {iconSrc ? <img alt="" src={iconSrc} /> : <span>{playedSongsCount}</span>}
          </i>
          <strong>{title}</strong>
          <span className="music-control-tail" aria-hidden="true">
            {icon === 'blank' && purchasedBlanksCount > 0 ? (
              <b className="music-control-count">{purchasedBlanksCount}</b>
            ) : null}
            <span className="music-control-chevron">
              <img alt="" src="/generated/layout4-icons/control-chevron.png" />
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

function MusicCategorySelector({
  hasSelectedCategory,
  isOpen,
  musicCategory,
  onChooseCategory,
  onToggle,
}) {
  return (
    <div className="music-category-selector">
      <button
        className={`music-category-select ${isOpen ? 'is-open' : ''}`}
        type="button"
        aria-expanded={isOpen}
        onClick={onToggle}
      >
        <span>Выбрать категорию</span>
        <i aria-hidden="true">
          <img alt="" src="/generated/layout4-icons/dropdown.png" />
        </i>
      </button>
      {isOpen ? (
        <div className="music-category-dropdown" aria-label="Категории песен">
          {MUSIC_CATEGORIES.map((item) => (
            <button
              className={hasSelectedCategory && item === musicCategory ? 'is-active' : ''}
              key={item}
              type="button"
              onClick={() => onChooseCategory(item)}
            >
              {item}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MusicCategoryCover({ category }) {
  const normalizedCategory = normalizeMusicCategory(category) || DEFAULT_MUSIC_CATEGORY;
  const cover = MUSIC_CATEGORY_COVERS[normalizedCategory] || MUSIC_CATEGORY_COVERS[DEFAULT_MUSIC_CATEGORY];

  return (
    <div className={`music-category-cover is-${cover.tone}`} aria-label={`Обложка категории ${normalizedCategory}`}>
      {cover.layered ? (
        <>
          <img className="karaoke-hero-bg" alt="" src={cover.image} />
          <img className="karaoke-hero-figure" alt="" src={cover.figure} />
          <img className="karaoke-title-mark" alt={normalizedCategory} src={cover.logo} />
        </>
      ) : (
        <>
          <div className="music-category-cover-bg" aria-hidden="true">
            <img alt="" src={cover.image} />
          </div>
          {cover.figure ? <img className="music-category-cover-figure" alt="" src={cover.figure} /> : null}
          {cover.logo ? <img className="music-category-cover-logo" alt={normalizedCategory} src={cover.logo} /> : null}
        </>
      )}
      {cover.yearLabel ? (
        <div className="music-category-cover-hits-title" aria-label={normalizedCategory}>
          <span>ХИТЫ</span>
          <b>{cover.yearLabel}</b>
        </div>
      ) : null}
      {!cover.fullArtwork ? (
        <div className="music-category-cover-copy">
          <span>Категория</span>
          <strong>{normalizedCategory}</strong>
        </div>
      ) : null}
    </div>
  );
}

function MusicGameStage({
  blurred = false,
  categoryMode = 'select',
  categoryNavigation = 'catalog',
  categoryRoute = 'karaoke-categories',
  currentSong = getCurrentMusicSong(0),
  goTo,
  hasSelectedCategory = false,
  isPaused = false,
  musicCategory = '',
  onNextSong = () => {},
  onTogglePause = () => {},
  remainingSongs = 60,
  setMusicCategory = () => {},
  showCategoryCover = false,
}) {
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const [isSongFullscreen, setIsSongFullscreen] = useState(false);
  const [isSongFinished, setIsSongFinished] = useState(false);
  const audioRef = useRef(null);
  const shouldShowCategoryCover = hasSelectedCategory && showCategoryCover;
  const audioUrl = useYandexBlobAsset(YANDEX_LOTO_PUBLIC_KEY, currentSong.audioPath);
  const squareImageUrl = useYandexAsset(YANDEX_LOTO_PUBLIC_KEY, currentSong.squarePath);
  const albumImageUrl = useYandexAsset(YANDEX_LOTO_PUBLIC_KEY, currentSong.albumPath);
  const songImageUrl = isSongFullscreen ? albumImageUrl || squareImageUrl : squareImageUrl || albumImageUrl;

  const chooseCategory = (item) => {
    setMusicCategory(item);
    setIsCategoryOpen(false);
    setIsSongFullscreen(false);
  };
  const advanceToNextSong = () => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      audio.removeAttribute('src');
      audio.load();
    }
    setIsSongFinished(false);
    onNextSong();
  };
  useEffect(() => {
    if (isCategoryOpen) setIsSongFullscreen(false);
  }, [isCategoryOpen]);

  useEffect(() => {
    if (shouldShowCategoryCover) setIsSongFullscreen(false);
  }, [shouldShowCategoryCover]);

  useEffect(() => {
    if (!isSongFullscreen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setIsSongFullscreen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.classList.add('song-fullscreen-open');
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.classList.remove('song-fullscreen-open');
    };
  }, [isSongFullscreen]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioUrl || !hasSelectedCategory || shouldShowCategoryCover) return;
    audio.currentTime = 0;
    setIsSongFinished(false);
  }, [audioUrl, currentSong.number, hasSelectedCategory, shouldShowCategoryCover]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPaused || shouldShowCategoryCover || !hasSelectedCategory) {
      audio.pause();
      return;
    }
    if (audioUrl) audio.play().catch(() => {});
  }, [audioUrl, hasSelectedCategory, isPaused, shouldShowCategoryCover]);

  return (
    <section className={`music-game-stage ${blurred ? 'is-blurred' : ''}`} aria-hidden={blurred || undefined}>
      {categoryMode === 'chips' ? (
        <>
          <div className="music-category-title">Выберите категорию</div>
          <div className="music-category-row" aria-label="Категории песен">
            {MUSIC_CATEGORIES.map((item, index) => (
              <button
                className={hasSelectedCategory && item === musicCategory ? 'is-active' : ''}
                key={item}
                type="button"
                onClick={() => (categoryNavigation === 'inline' ? chooseCategory(item) : goTo(categoryRoute))}
              >
                {item}
              </button>
            ))}
          </div>
        </>
      ) : (
        <MusicCategorySelector
          hasSelectedCategory={hasSelectedCategory}
          isOpen={categoryNavigation === 'inline' && isCategoryOpen}
          musicCategory={musicCategory}
          onChooseCategory={chooseCategory}
          onToggle={() => (categoryNavigation === 'inline' ? setIsCategoryOpen((current) => !current) : goTo(categoryRoute))}
        />
      )}
      {!hasSelectedCategory ? (
        <div className="music-game-placeholder" role="status">
          <h2>Выберите категорию</h2>
          <p>Песня появится здесь после выбора категории</p>
          <img alt="" src={assets.musicGameEmptySheet} />
        </div>
      ) : shouldShowCategoryCover ? (
        <MusicCategoryCover category={musicCategory} />
      ) : (
      <div className={`music-current-card ${isSongFullscreen ? 'is-fullscreen' : ''}`}>
        <audio
          ref={audioRef}
          className="music-audio"
          src={audioUrl || undefined}
          preload="auto"
          autoPlay={!isPaused && !shouldShowCategoryCover}
          onEnded={() => setIsSongFinished(true)}
          referrerPolicy="no-referrer"
        />
        {songImageUrl ? (
          <img
            className="music-current-art"
            src={songImageUrl}
            alt={`${currentSong.artist} — ${currentSong.title}`}
            draggable="false"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="music-song-loading" role="status">
            <strong>{currentSong.artist}</strong>
            <span>{currentSong.title}</span>
            <small>Загружаем песню…</small>
          </div>
        )}
        <button
          className={`music-share ${isSongFullscreen ? 'is-active' : ''}`}
          type="button"
          aria-label={isSongFullscreen ? 'Закрыть полноэкранный режим' : 'Открыть песню на весь экран'}
          aria-pressed={isSongFullscreen}
          onClick={() => setIsSongFullscreen((current) => !current)}
        >
          <img
            alt=""
            aria-hidden="true"
            src={isSongFullscreen ? '/generated/layout4-icons/collapse.svg' : '/generated/layout4-icons/expand.png'}
          />
        </button>
        {false && <p>
          То ли это ветерок мои губы колышет<br />
          То ли это я кричу тебе, но ты меня не слышишь<br /><br />
          Если хочешь остаться, останься просто так<br />
          Пусть тебе приснятся сны о теплых берегах<br />
          Давно за двенадцать, а ты еще в гостях<br />
          Ты думаешь остаться, так останься просто так<br /><br />
          Все изменены сплетни за долгие месяцы<br />
          И гитара давно позабыла на лестнице<br />
          И ей уже не хочется песен
        </p>}
        <button
          className={`music-pause ${isPaused ? 'is-paused' : ''}`}
          type="button"
          aria-label={isPaused ? 'Продолжить' : 'Пауза'}
          aria-pressed={isPaused}
          onClick={onTogglePause}
        >
          <img
            alt=""
            aria-hidden="true"
            src={isPaused ? '/generated/layout4-icons/play.png' : '/generated/layout4-icons/pause.png'}
          />
        </button>
        {isSongFullscreen ? (
          <button
            className="music-fullscreen-next"
            type="button"
            onClick={advanceToNextSong}
          >
            Новая песня
          </button>
        ) : null}
      </div>
      )}
      {hasSelectedCategory && !isSongFullscreen ? (
        <button className="music-next-song" type="button" onClick={advanceToNextSong}>
          <span>{shouldShowCategoryCover ? 'Начать игру' : 'Новая песня'}</span>
          <b>осталось {shouldShowCategoryCover ? MUSIC_TOTAL_SONGS : remainingSongs} песен</b>
        </button>
      ) : null}
    </section>
  );
}

function MusicGamePage({
  backRoute = 'music-detail',
  balance,
  categoryNavigation = 'inline',
  categoryRoute = 'music-detail',
  currentSong,
  goBack,
  goTo,
  hasSelectedCategory,
  isLoggedIn,
  isPaused,
  musicCategory,
  onNextSong,
  onTogglePause,
  pageTitle = 'Музыкальное лото Дома',
  playedSongsCount,
  profileName,
  purchasedBlanksCount,
  remainingSongs,
  setMusicCategory,
  showCategoryCover,
}) {
  const gameStateClass = !hasSelectedCategory
    ? 'is-empty'
    : showCategoryCover
      ? 'is-category-cover'
      : 'is-playing';

  return (
    <main className={`page music-game-page ${gameStateClass}`}>
      <DetailPageNav
        backRoute={backRoute}
        balance={balance}
        goBack={goBack}
        goTo={goTo}
        isLoggedIn={isLoggedIn}
        profileName={profileName}
        title={pageTitle}
      />
      <section className="music-game-content">
        <MusicGameStage
          categoryNavigation={categoryNavigation}
          categoryRoute={categoryRoute}
          currentSong={currentSong}
          goTo={goTo}
          hasSelectedCategory={hasSelectedCategory}
          isPaused={isPaused}
          musicCategory={musicCategory}
          onNextSong={onNextSong}
          onTogglePause={onTogglePause}
          remainingSongs={remainingSongs}
          setMusicCategory={setMusicCategory}
          showCategoryCover={showCategoryCover}
        />
        <h2 className="karaoke-section-title"><span>Управление</span> игрой</h2>
        <MusicGameControls
          goTo={goTo}
          playedSongsCount={playedSongsCount}
          purchasedBlanksCount={purchasedBlanksCount}
        />
        <h2 className="karaoke-section-title tips-title">Советы</h2>
        <MusicTipsStack />
      </section>
      <Footer dark year={2026} />
    </main>
  );
}

function MusicSongsPage({ balance, goBack, goTo, isLoggedIn, playedSongs = [], profileName }) {
  return (
    <main className="page music-songs-page">
      <DetailPageNav
        backRoute="music-game"
        balance={balance}
        goBack={goBack}
        goTo={goTo}
        isLoggedIn={isLoggedIn}
        profileName={profileName}
        title="Музыкальное лото Дома"
      />
      <section className="music-songs-content">
        <h1>Выпали песни</h1>
        <div className="music-songs-list">
          {playedSongs.length ? (
            playedSongs.map((song, index) => (
              <div className="music-song-row" key={`${song.listTitle}-${index}`}>
                <b className="music-song-number">{index + 1}</b>
                <span className="music-song-name">{song.listTitle}</span>
              </div>
            ))
          ) : (
            <p className="music-songs-empty">Песни еще не выпадали</p>
          )}
        </div>
        <button className="music-return-button" type="button" onClick={() => goTo('music-game')}>Вернуться в игру</button>
      </section>
      <Footer dark year={2026} />
    </main>
  );
}

function MusicNewGamePage({
  backRoute = 'music-game',
  balance,
  categoryNavigation = 'inline',
  categoryRoute = 'music-detail',
  currentSong,
  gameRoute = 'music-game',
  goBack,
  goTo,
  hasSelectedCategory,
  isLoggedIn,
  isPaused,
  musicCategory,
  onNextSong,
  onResetGame,
  onTogglePause,
  pageTitle = 'Музыкальное лото Дома',
  playedSongsCount,
  profileName,
  purchasedBlanksCount,
  remainingSongs,
  setMusicCategory,
  showCategoryCover,
}) {
  return (
    <main className="page music-game-page music-new-game-page">
      <DetailPageNav
        backRoute={backRoute}
        balance={balance}
        goBack={goBack}
        goTo={goTo}
        isLoggedIn={isLoggedIn}
        profileName={profileName}
        title={pageTitle}
      />
      <section className="music-game-content">
        <MusicGameStage
          blurred
          categoryMode="chips"
          categoryNavigation={categoryNavigation}
          categoryRoute={categoryRoute}
          currentSong={currentSong}
          goTo={goTo}
          hasSelectedCategory={hasSelectedCategory}
          isPaused={isPaused}
          musicCategory={musicCategory}
          onNextSong={onNextSong}
          onTogglePause={onTogglePause}
          remainingSongs={remainingSongs}
          setMusicCategory={setMusicCategory}
          showCategoryCover={showCategoryCover}
        />
        <h2 className="karaoke-section-title"><span>Управление</span> игрой</h2>
        <MusicGameControls
          goTo={goTo}
          playedSongsCount={playedSongsCount}
          purchasedBlanksCount={purchasedBlanksCount}
        />
      </section>
      <div className="music-modal-layer">
        <section className="music-reset-modal" role="dialog" aria-modal="true" aria-labelledby="music-reset-title">
          <button className="music-modal-close" type="button" onClick={() => goBack(gameRoute)} aria-label="Закрыть">
            <img alt="" aria-hidden="true" src="/generated/layout4-icons/popup-close.svg" />
          </button>
          <h2 id="music-reset-title">Вы хотите начать <span>новую игру?</span></h2>
          <p>Текущий прогресс<br />будет сброшен</p>
          <button className="music-modal-primary" type="button" onClick={onResetGame}><span>Начать новую игру</span></button>
          <button className="music-modal-secondary" type="button" onClick={() => goBack(gameRoute)}><span>Назад</span></button>
        </section>
      </div>
      <Footer dark year={2026} />
    </main>
  );
}

function MusicWinnerPage({ backRoute = 'music-game', balance, goBack, goTo, isLoggedIn, profileName }) {
  return (
    <main className="page music-winner-page">
      <div className="winner-confetti" aria-hidden="true">
        <img alt="" src="/generated/winner-confetti-figma-transparent.png" />
      </div>
      <DetailPageNav
        backRoute={backRoute}
        balance={balance}
        goBack={goBack}
        goTo={goTo}
        isLoggedIn={isLoggedIn}
        profileName={profileName}
        title="Выбрать победителя"
      />
      <section className="winner-bingo" aria-label="Бинго">
        <span>Бингоо</span>
        <span aria-hidden="true">Бингоо</span>
        <span aria-hidden="true">Бингоо</span>
      </section>
      <Footer dark year={2026} />
    </main>
  );
}

function BalanceTopUpPage({ amount, amountValue, backRoute = 'buy-blanks', goBack, goTo, isStandalone = false, onAmountChange, onPay, paymentError, paymentLoading, purchaseKind = 'бланков' }) {
  return (
    <main className="page balance-top-up-page">
      <nav className="payment-nav">
        <button
          className="payment-nav-back"
          type="button"
          onClick={() => goBack(backRoute)}
          aria-label={isStandalone ? 'Вернуться в личный кабинет' : 'Вернуться к покупке'}
        >
          <BackArrow className="payment-nav-back-arrow" />
          <strong>Сайт оплаты</strong>
        </button>
        <HomeBrandLink className="payment-logo" goTo={goTo} />
      </nav>
      <section className="payment-card">
        <span className="payment-kicker">Пополнение баланса</span>
        {isStandalone ? (
          <label className="payment-amount-field">
            <span>Сумма пополнения</span>
            <span className="payment-amount-control">
              <input
                aria-label="Сумма пополнения в рублях"
                inputMode="numeric"
                maxLength={4}
                pattern="[0-9]*"
                value={amountValue}
                onChange={(event) => {
                  const digits = event.target.value.replace(/\D/g, '').slice(0, 4);
                  onAmountChange(digits ? String(Math.min(1_500, Number(digits))) : '');
                }}
              />
              <b>₽</b>
            </span>
            <small>От 1 до 1 500 ₽</small>
          </label>
        ) : <h1>{formatBalance(amount)} ₽</h1>}
        <p>
          {isStandalone
            ? 'После оплаты монеты автоматически зачислятся на ваш баланс.'
            : `После оплаты вы вернётесь к подтверждению покупки ${purchaseKind}.`}
        </p>
        <button type="button" onClick={onPay} disabled={paymentLoading || amount <= 0}>
          {paymentLoading ? 'Проверяем оплату…' : 'Перейти к оплате'}
        </button>
        {paymentError ? <p className="payment-error" role="alert">{paymentError}</p> : null}
      </section>
    </main>
  );
}

function BuyBlanksPage({ balance, blankOrder, goBack, goTo, hasJustToppedUp, onApplyServerUser, profileName, setBalance, setHasJustToppedUp, setPaymentIntent, setPurchasedBlanks, showNotice }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const count = normalizeBlankCount(blankOrder?.count);
  const category = blankOrder?.category || 'Девичник';
  const cost = count * BLANK_UNIT_PRICE;
  const shortage = Math.max(0, cost - balance);

  const pay = async () => {
    if (shortage > 0) {
      setHasJustToppedUp(false);
      setPaymentIntent('blanks');
      goTo('balance-top-up');
      return;
    }
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const result = await authApi.purchaseBlanks({ category, count });
      if (result.user) {
        onApplyServerUser?.(result.user);
      } else {
        setBalance((current) => Math.max(0, current - cost));
        setPurchasedBlanks((current) => [...current, result.purchase]);
      }
      setHasJustToppedUp(false);
      showNotice('Бланки добавлены');
      goTo('register-success', { replace: true });
    } catch (error) {
      if (error instanceof AuthApiError && error.code === 'INSUFFICIENT_FUNDS') {
        const session = await authApi.session().catch(() => null);
        if (session?.user) onApplyServerUser?.(session.user);
        setHasJustToppedUp(false);
        setPaymentIntent('blanks');
        goTo('balance-top-up');
        return;
      }
      showNotice(authErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="page buy-blanks-page">
      <DetailPageNav
        backRoute="music-buy-blanks"
        balance={balance}
        goBack={goBack}
        goTo={goTo}
        isLoggedIn
        profileName={profileName}
        title="Купить бланки"
      />
      <section className={`buy-confirm-card ${hasJustToppedUp ? 'is-topped-up' : ''} ${shortage === 0 ? 'has-funds' : ''}`}>
        <h1>{hasJustToppedUp ? <>Ваш баланс пополнен <span>подтвердите вашу покупку</span></> : <><span>Подтвердите</span> вашу покупку</>}</h1>
        <div className="buy-sheet-stack" aria-hidden="true">
          <span className="sheet-one" />
          <span className="sheet-two" />
        </div>
        <div className="buy-summary">
          <div><span>Бланков</span><strong>{count} шт.</strong></div>
          <div><span>Категория песен</span><strong>{category}</strong></div>
          <div className="summary-total"><span>Итого</span><strong><img alt="" src={assets.figmaCoin} />{formatBalance(cost)} монет</strong></div>
          {shortage > 0 ? <p><b>!</b>У вас не хватает монет<br />(1 монета = 1 рубль)</p> : null}
        </div>
        <button className="buy-confirm-button" type="button" onClick={pay} disabled={isSubmitting}>
          <span>{isSubmitting ? 'Сохраняем покупку' : shortage > 0 ? 'Пополнить баланс' : 'Оплатить'}</span>
          <b>{formatBalance(shortage || cost)} {shortage > 0 ? 'рублей' : 'монет'}</b>
        </button>
        {shortage === 0 ? <p className="buy-confirm-note">После покупки бланки будут доступны в личном кабинете</p> : null}
      </section>
      <Footer dark year={2025} />
    </main>
  );
}

function FeatureList() {
  const cards = [
    {
      title: 'Всё предусмотрено за вас',
      text: 'Здесь можно раздать роли для игры в мафию, а ведущему — удобно следить за ходом игры',
      icon: assets.preparedHat,
      className: 'is-white is-hat',
    },
    {
      title: 'Рандомайзер',
      text: 'Случайное распределение ролей, таймеры и сценарий игры — всё в одном приложении',
      icon: assets.preparedCardLogo,
      className: 'is-red is-card',
    },
    {
      title: 'Можно без опыта',
      text: 'Теперь даже новичок проведёт «Мафию» как профи',
      icon: assets.preparedGlasses,
      className: 'is-white is-glasses',
    },
  ];

  return (
    <section className="detail-prepared">
      {cards.map((card) => (
        <article className={`prepared-card ${card.className}`} key={card.title}>
          {card.className.includes('is-card') ? (
            <span className="prepared-random-icon" aria-hidden="true">
              <span className="prepared-random-back" />
              <span className="prepared-random-front"><b>1</b><i>M</i></span>
            </span>
          ) : (
            <img alt="" src={card.icon} />
          )}
          <div>
            <h3>{card.className.includes('is-glasses') ? <>Можно <span>без опыта</span></> : card.title}</h3>
            <p>{card.className.includes('is-card') ? <>Случайное распределение ролей, таймеры<br />и сценарий игры — всё в одном приложении</> : card.text}</p>
          </div>
        </article>
      ))}
    </section>
  );
}

function HowToMafiaSection() {
  const steps = [
    [assets.howHand, 'Раздайте карточки ролей', 'Каждый игрок тайно получает роль. Мафиози знают друг друга, остальные — нет.'],
    [assets.howTable, 'Наступает ночь — мафия действует', 'Все закрывают глаза. Мафия просыпается и молча выбирает жертву. Детектив проверяет подозреваемого.'],
    [assets.howTable, 'День — обсуждение и голосование', 'Город просыпается. Все обсуждают, спорят, блефуют. Затем голосуют, кого устранить.'],
    [assets.howVictory, 'Победа — когда все мафиози устранены', 'Мирные жители побеждают, когда вся мафия вычислена. Мафия побеждает, если сравняется по числу с мирными.'],
  ];

  return (
    <section className="how-mafia-real">
      <h2>Как играть <span>в мафию</span></h2>
      <p>Популярный формат досуга дома</p>
      <div>
        {steps.map(([image, title, text], index) => (
          <article key={title}>
            <figure>
              <img alt="" src={image} />
              <b>{index + 1}</b>
            </figure>
            <h3>{title}</h3>
            <p>{text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function RoundsSection() {
  const rounds = [
    ['Ночь', 'ведущий вызывает мафию, доктора, комиссара по очереди.'],
    ['Рассвет', 'ведущий объявляет, кто убит и кто спасён.'],
    ['Речи', 'живые игроки по кругу высказываются.'],
    ['Голосование', 'поднятие рук, исключение или ничья.'],
    ['Проверка условий победы', 'если никто не победил, начинается следующая ночь.'],
  ];

  return (
    <section className="rounds-real">
      <h2>Раунды</h2>
      <div>
        {rounds.map(([title, text], index) => (
          <article className={index === 4 ? 'is-wide' : ''} key={title}>
            <b>{index + 1}</b>
            <p><strong>{title}:</strong> {text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function RolesSection() {
  const roles = [
    ['Мафия', 'Просыпается ночью и выбирает жертву. Ею может стать любой игрок, но только один. Действует в своих интересах', 'is-red is-pink'],
    ['Дон мафии', 'Главарь мафии. Ночью может проверить одного игрока — Комиссар это или нет.', 'is-red is-pink'],
    ['Мирный житель', 'Ночью спит. Днём обсуждает с городом и голосует, чтобы найти мафию.', 'is-gray is-dark'],
    ['Мирный житель', 'Ночью спит. Днём обсуждает с городом и голосует, чтобы найти мафию.', 'is-gray is-green'],
    ['Комиссар', 'Ночью проверяет одного игрока. Ведущий показывает — мафия это или нет.', 'is-gray is-blue'],
    ['Маньяк', 'Играет сам за себя. Ночью убивает одного игрока. Побеждает, если остаётся один на один с любым.', 'is-gray is-red'],
    ['Любовница', 'Ночью проводит ночь с выбранным игроком. Если жертва мафии — этот игрок, он выживает.', 'is-gray is-pink-title'],
  ];
  return (
    <section className="roles-real">
      <h2>Роли в игре</h2>
      <div className="roles-grid">
        {roles.map(([title, text, className], index) => (
          <article className={className} key={`${title}-${index}`}>
            <h3>{title}</h3>
            <p>{text}</p>
          </article>
        ))}
      </div>
      <div className="teams-card">
        <h3>Команды</h3>
        <div className="teams-grid">
          <div className="team-item team-civilians">
            <span aria-hidden="true" />
            <div>
              <strong>Мирные</strong>
              <p>(включая Доктора, Комиссара) побеждают, если устранят всю мафию.</p>
            </div>
          </div>
          <div className="team-item team-maniac">
            <span aria-hidden="true" />
            <div>
              <strong>Маньяк</strong>
              <p>побеждает, если остаётся последним живым.</p>
            </div>
          </div>
          <div className="team-item team-mafia">
            <span aria-hidden="true" />
            <div>
              <strong>Мафия</strong>
              <p>побеждает, когда её количество равно количеству мирных.</p>
            </div>
          </div>
        </div>
        <div className="role-card-stack" aria-hidden="true">
          <span className="role-card role-card-back"><span className="role-card-mark"><b>1</b><i>M</i></span></span>
          <span className="role-card role-card-front"><span className="role-card-mark"><b>1</b><i>M</i></span></span>
        </div>
      </div>
    </section>
  );
}

function BackArrow({ className }) {
  return (
    <span className={`shared-back-arrow ${className}`} aria-hidden="true">
      <img alt="" src="/generated/layout4-icons/back.png" />
    </span>
  );
}

function PageFrame({ backRoute = 'home', balance, children, goBack, goTo, pageClassName = '', profileName, title }) {
  return (
    <main className={`page inner-page ${pageClassName}`}>
      <nav className="page-nav">
        <button
          className="page-nav-back"
          type="button"
          onClick={() => goBack?.(backRoute)}
          aria-label={`Назад: ${title}`}
        >
          <BackArrow className="page-nav-back-arrow" />
          <strong>{title}</strong>
        </button>
        {balance !== undefined ? (
          <button className="nav-account" type="button" onClick={() => goTo('profile')} aria-label="Открыть профиль">
            <BalanceBadge balance={balance} />
            <Avatar name={profileName} size="small" />
          </button>
        ) : (
          <HomeBrandLink className="nav-logo" goTo={goTo} />
        )}
      </nav>
      {children}
      <Footer />
    </main>
  );
}

function AuthSuccessPage({ authIntent, balance, finishFlowAt, goTo, paymentIntent, profileName, setAuthIntent, setPaymentIntent, variant }) {
  const isLogin = variant === 'login';
  const isPurchase = authIntent === 'purchase';
  const isPlay = authIntent === 'play';
  const isDefaultRegistration = !isLogin && authIntent === 'default';
  const entitlementEntry = entitlementPurchaseByIntent(paymentIntent);
  const entitlementPurchase = entitlementEntry?.[1]?.authIntent === authIntent ? entitlementEntry[1] : null;
  const entitlementRoute = entitlementPurchase
    ? (balance >= entitlementPurchase.price ? entitlementPurchase.confirmRoute : entitlementPurchase.insufficientRoute)
    : authIntent === 'royal-purchase' ? LAYOUT6_PURCHASE_ROUTES.insufficient : LAYOUT5_PURCHASE_ROUTES.confirm;
  const hero = isLogin ? (
    <>
      Вы вошли<br /><span>в аккаунт</span>
    </>
  ) : 'Урааа!';
  let primary;
  let secondary;

  if (authIntent === 'royal-purchase') {
    primary = ['Продолжить покупку', entitlementRoute];
    secondary = ['Личный кабинет', 'profile'];
  } else if (authIntent === 'category-purchase') {
    primary = ['Купить категорию', entitlementRoute];
    secondary = isLogin ? null : ['Личный кабинет', 'profile'];
  } else if (isPurchase) {
    primary = ['Продолжить покупку', 'buy-blanks'];
    secondary = ['Личный кабинет', 'profile'];
  } else if (isPlay) {
    primary = ['Играть', 'music-game'];
    secondary = ['На главную', 'home'];
  } else if (isLogin) {
    primary = ['На главную', 'home'];
    secondary = ['Личный кабинет', 'profile'];
  } else {
    primary = ['Личный кабинет', 'profile'];
    secondary = ['На главную', 'home'];
  }
  const openRoute = (nextRoute) => {
    setAuthIntent('default');
    if (nextRoute !== entitlementRoute && nextRoute !== 'buy-blanks') setPaymentIntent('blanks');
    finishFlowAt(nextRoute);
  };

  if (canUseLayout5AuthSuccessReference({ variant, authIntent, balance, profileName })) {
    return (
      <Layout5AuthSuccessReference
        variant={variant}
        authIntent={authIntent}
        primaryLabel={primary[0]}
        secondaryLabel={secondary?.[0]}
        onBack={() => openRoute('home')}
        onPrimary={() => openRoute(primary[1])}
        onSecondary={secondary ? () => openRoute(secondary[1]) : undefined}
        onAccount={() => openRoute('profile')}
        onHome={() => openRoute('home')}
      />
    );
  }

  return (
    <AuthPage
      accountNav={isDefaultRegistration}
      balance={balance}
      cardTitle={isLogin ? 'С возвращением!' : 'Вы зарегистрированы'}
      confetti={!isLogin}
      goBack={() => openRoute('home')}
      goTo={goTo}
      hero={hero}
      pageClassName={`auth-flow-success-page ${isLogin ? 'auth-flow-login-success-page' : 'auth-flow-register-success-page'} ${(isDefaultRegistration || (isLogin && authIntent === 'category-purchase')) ? 'auth-flow-success-compact' : ''}`}
      profileName={profileName}
      progress={3}
      success
      title={isDefaultRegistration ? 'Вход в аккаунт' : 'Регистрация'}
    >
      <div className="auth-success-profile">
        <Avatar name={profileName} size="huge" />
        <strong>{profileName}</strong>
        <span>ID 0427</span>
      </div>
      {!isDefaultRegistration ? <p className="auth-success-copy">Изменить личные данные можно в личном кабинете</p> : null}
      <button className="primary-wide" type="button" onClick={() => openRoute(primary[1])}>
        <span className="display-label">{primary[0]}</span>
      </button>
      {secondary ? (
        <button className="secondary-wide" type="button" onClick={() => openRoute(secondary[1])}>
          <span className="display-label">{secondary[0]}</span>
        </button>
      ) : null}
    </AuthPage>
  );
}

function AuthPage({ accountNav = false, backRoute = 'home', balance, cardTitle, children, confetti = false, goBack, goTo, hero, pageClassName = '', profileName, progress = 0, success, title }) {
  return (
    <main className={`page auth-page ${success ? 'is-success' : ''} ${confetti ? 'has-confetti' : ''} ${pageClassName}`}>
      <nav className="page-nav">
        <button
          className="page-nav-back"
          type="button"
          onClick={() => (goBack ? goBack(backRoute) : goTo(backRoute))}
          aria-label={`Назад: ${title}`}
        >
          <BackArrow className="page-nav-back-arrow" />
          <strong>{title}</strong>
        </button>
        {accountNav ? (
          <button className="nav-account" type="button" onClick={() => goTo('profile')} aria-label="Открыть профиль">
            <BalanceBadge balance={balance || 0} />
            <Avatar name={profileName} size="small" />
          </button>
        ) : <HomeBrandLink className="nav-logo" goTo={goTo} />}
      </nav>
      {hero ? <h1 className="auth-hero">{hero}</h1> : null}
      <section className="auth-card">
        {progress ? (
          <div className="auth-progress" aria-hidden="true">
            {[1, 2, 3].map((step) => <span key={step} className={step <= progress ? 'is-active' : ''} />)}
          </div>
        ) : null}
        {cardTitle !== null ? <h1>{cardTitle || title}</h1> : null}
        {children}
      </section>
      <Footer />
    </main>
  );
}

function AuthInput({ autoComplete, error = false, label, onChange, required = true, revealable = false, type = 'text', value }) {
  const [isVisible, setIsVisible] = useState(false);
  const inputProps = {
    'aria-label': label,
    autoComplete,
    onChange,
    placeholder: label,
    required,
    type: revealable && isVisible ? 'text' : type,
  };
  if (value !== undefined) inputProps.value = value;
  return (
    <div className={`auth-input ${required ? 'is-required' : ''} ${error ? 'is-error' : ''} ${revealable ? 'is-revealable' : ''}`}>
      <input {...inputProps} />
      {revealable ? (
        <button
          aria-label={isVisible ? 'Скрыть пароль' : 'Показать пароль'}
          aria-pressed={isVisible}
          className={`auth-password-toggle ${isVisible ? 'is-visible' : ''}`}
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setIsVisible((current) => !current)}
        >
          <span aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

function AuthField({ children, error = '' }) {
  return (
    <div className="auth-field-group">
      {children}
      {error ? <p className="auth-field-error">{error}</p> : null}
    </div>
  );
}

function Avatar({ name, size = 'normal' }) {
  return <div className={`avatar ${size}`}>{profileInitial(name)}</div>;
}

function Coin() {
  return <span className="coin" aria-hidden="true"><img alt="" src="/generated/balance-coin-clean.png" /></span>;
}

function PromoCoin() {
  return <span className="promo-coin" aria-hidden="true"><img alt="" src="/generated/promo-coin-cropped.png" /></span>;
}

function BalanceBadge({ balance }) {
  return <span className="balance-badge"><Coin /> <strong>{formatBalance(balance)}</strong></span>;
}

function Footer({ dark, year = 2026 }) {
  return (
    <footer className={`footer ${dark ? 'is-dark' : ''}`}>
      <FooterBrandMark />
      <p>ИП Шаталов Дмитрий Андреевич<br />ОГРН: 322861700029539<br />ИНН: 711404699134</p>
      <a href="#/privacy">Политика конфиденциальности</a>
      <span>© {year}. Все права защищены</span>
    </footer>
  );
}

createRoot(document.getElementById('root')).render(<App />);
