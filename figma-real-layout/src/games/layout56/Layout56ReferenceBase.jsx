import React from 'react';
import layout5Description from '../../../reference/layout5/description.png';
import layout5Catalog from '../../../reference/layout5/catalog.png';
import layout6Description from '../../../reference/layout6/description.png';
import layout6Catalog from '../../../reference/layout6/catalog.png';

const DEFAULT_PROFILE_NAME = 'Тимур';
const DEFAULT_BALANCE = 11240;

const REFERENCE_SCREENS = Object.freeze({
  'karaoke-battle': {
    asset: layout5Description,
    figmaNode: '1:670',
    game: 'karaoke',
    kind: 'description',
    height: 6202,
    expectedEntitlements: ['karaoke:girls'],
    headerTop: 79,
    footerTop: 5697,
  },
  'karaoke-battle-categories': {
    asset: layout5Catalog,
    figmaNode: '1:5017',
    game: 'karaoke',
    kind: 'catalog',
    height: 3695,
    expectedEntitlements: ['karaoke:girls'],
    headerTop: 80,
    footerTop: 3190,
  },
  'royal-battle': {
    asset: layout6Description,
    figmaNode: '1:478',
    game: 'royal',
    kind: 'description',
    height: 7773,
    expectedEntitlements: [],
    headerTop: 79,
    footerTop: 7268,
  },
  'royal-battle-collections': {
    asset: layout6Catalog,
    figmaNode: '1:956',
    game: 'royal',
    kind: 'catalog',
    height: 3281,
    expectedEntitlements: ['royal:all'],
    headerTop: 80,
    footerTop: 2776,
  },
});

const CARD_LAYOUTS = Object.freeze({
  'karaoke-battle': [
    { id: 'hits', x: 60, y: 3903.705, width: 465, height: 465 },
    { id: '90s', x: 554, y: 3903.705, width: 465, height: 465 },
    { id: 'girls', x: 60, y: 4397.705, width: 465.5, height: 465 },
    { id: '2000s', x: 554.5, y: 4397.705, width: 465.5, height: 465 },
  ],
  'karaoke-battle-categories': [
    { id: 'hits', x: 57, y: 665, width: 465, height: 465 },
    { id: 'girls', x: 551, y: 665, width: 472.5, height: 465 },
    { id: '90s', x: 57, y: 1473, width: 465, height: 465 },
    { id: '2000s', x: 551, y: 1473, width: 465.5, height: 465 },
  ],
  'royal-battle': [
    { id: 'party', x: 53, y: 4565, width: 469.25, height: 465 },
    { id: 'all', x: 551.25, y: 4565, width: 469.25, height: 465 },
    { id: 'birthday', x: 53, y: 5060, width: 469.25, height: 465 },
    { id: 'picnic', x: 551.25, y: 5060, width: 469.25, height: 465 },
  ],
  'royal-battle-collections': [
    { id: 'party', x: 57, y: 665, width: 465, height: 465 },
    { id: 'all', x: 551, y: 665, width: 465, height: 465 },
    { id: 'birthday', x: 57, y: 1473, width: 465, height: 465 },
    { id: 'picnic', x: 551, y: 1473, width: 465, height: 465 },
  ],
});

const DESCRIPTION_CONTROLS = Object.freeze({
  karaoke: {
    start: { x: 60, y: 2086, width: 970, height: 120 },
    showCategories: { x: 60, y: 4902.705, width: 966, height: 108 },
    recommendationsTop: 5161.705,
    showGames: { x: 60, y: 5503.705, width: 966, height: 108 },
  },
  royal: {
    start: { x: 55, y: 2120, width: 970, height: 120 },
    showCategories: { x: 53, y: 5565, width: 967.5, height: 108 },
    recommendationsTop: 6738,
    showGames: { x: 60, y: 7080, width: 966, height: 108 },
    video: { x: 462, y: 6082, width: 156, height: 156 },
  },
});

const CATALOG_CONTROLS = Object.freeze({
  karaoke: {
    ownedShowAll: { x: 57, y: 1170, width: 966.5, height: 108 },
    availableShowAll: { x: 57, y: 1978, width: 966.5, height: 108 },
    start: { x: 59.25, y: 2890.43, width: 962, height: 120 },
  },
  royal: {
    ownedShowAll: { x: 57, y: 1170, width: 966.5, height: 108 },
    availableShowAll: { x: 57, y: 1978, width: 966.5, height: 108 },
    start: { x: 59.25, y: 2576, width: 962, height: 120 },
  },
});

const RECOMMENDATIONS = Object.freeze([
  { id: 'royal', label: 'Королевская битва', route: 'royal-battle' },
  { id: 'karaoke', label: 'Караоке-битва', route: 'karaoke-battle' },
  { id: 'mafia', label: 'Распределитель ролей в мафии', route: 'game-detail' },
]);

function normalizeEntitlements(entitlements) {
  return [...new Set((Array.isArray(entitlements) ? entitlements : [])
    .filter(value => typeof value === 'string'))].sort();
}

function hasExactEntitlements(actual, expected) {
  const normalized = normalizeEntitlements(actual);
  return normalized.length === expected.length
    && normalized.every((value, index) => value === [...expected].sort()[index]);
}

export function getLayout56ReferenceScreen(route, purchasedCategories) {
  const screen = REFERENCE_SCREENS[route];
  if (!screen || !hasExactEntitlements(purchasedCategories, screen.expectedEntitlements)) return null;
  return screen;
}

function boxStyle({ x, y, width, height }) {
  return { left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px` };
}

function ReferenceHotspot({
  name,
  label,
  box,
  onClick,
  targetRoute,
  targetState,
  ariaPressed,
  owned,
  ariaDisabled,
  className = '',
}) {
  return <button
    type="button"
    className={`l56r-hit ${className}${owned ? ' is-owned' : ''}`}
    style={boxStyle(box)}
    onClick={onClick}
    aria-label={label}
    aria-pressed={ariaPressed}
    aria-disabled={ariaDisabled || undefined}
    data-reference-hotspot={name}
    data-target-route={targetRoute || undefined}
    data-target-state={targetState || undefined}
    data-owned={owned === undefined ? undefined : String(Boolean(owned))}
  />;
}

function matchesReferenceHeader({ balance, isLoggedIn, profileName }) {
  const name = String(profileName || 'Пользователь').trim() || 'Пользователь';
  const numericBalance = Number(balance) || 0;
  return Boolean(isLoggedIn)
    && name === DEFAULT_PROFILE_NAME
    && numericBalance === DEFAULT_BALANCE;
}

function ReferenceHeader({ Nav, back, backRoute, balance, goTo, isLoggedIn, profileName, screen }) {
  const name = String(profileName || 'Пользователь').trim() || 'Пользователь';
  const numericBalance = Number(balance) || 0;
  const matchesReference = matchesReferenceHeader({ balance, isLoggedIn, profileName });
  const targetRoute = isLoggedIn ? 'profile' : 'login';
  const label = isLoggedIn ? `Открыть профиль ${name}` : 'Войти';

  if (matchesReference) {
    return <ReferenceHotspot
      name="account"
      label={label}
      box={{ x: 670, y: screen.headerTop, width: 350, height: 123.431 }}
      onClick={() => goTo(targetRoute)}
      targetRoute={targetRoute}
    />;
  }

  if (Nav) {
    const title = screen.kind === 'description'
      ? 'Главная'
      : screen.game === 'karaoke' ? 'Караоке-битва' : 'Королевская битва';
    return <div className="l56-nav l56r-dynamic-nav">
      <Nav
        backRoute={backRoute}
        balance={numericBalance}
        goBack={back}
        goTo={goTo}
        isLoggedIn={isLoggedIn}
        profileName={name}
        title={title}
      />
    </div>;
  }

  return <button
    type="button"
    className={`l56r-live-account${isLoggedIn ? '' : ' is-login'}`}
    style={{ top: `${screen.headerTop}px` }}
    onClick={() => goTo(targetRoute)}
    aria-label={label}
    data-reference-hotspot="account"
    data-target-route={targetRoute}
  >
    {isLoggedIn ? <>
      <span className="l56r-live-balance">
        <img src="/generated/balance-coin-clean.png" alt="" aria-hidden="true" />
        <span>{new Intl.NumberFormat('ru-RU').format(numericBalance)}</span>
      </span>
      <span className="l56r-live-avatar" aria-hidden="true">{name.charAt(0).toLocaleUpperCase('ru-RU')}</span>
    </> : <span className="l56r-login-pill">Войти</span>}
  </button>;
}

function ReferenceSemantics({ cards, game, kind }) {
  return <div className="l56r-visually-hidden">
    <h1>{game === 'karaoke' ? 'Караоке-битва' : 'Королевская битва'}</h1>
    <p>{kind === 'catalog' ? 'Каталог игры' : 'Описание игры'}</p>
    <ul>{cards.map(card => <li key={card.id}>{card.title.replaceAll('\n', ' ')} — {card.available === false ? 'в разработке' : card.owned ? 'куплено' : card.price ? `${card.price} монет` : 'бесплатно'}</li>)}</ul>
  </div>;
}

function CategoryHotspots({ cards, layouts, onAction, onInfo, resolveActionRoute, game }) {
  const byId = new Map(cards.map(card => [card.id, card]));
  return layouts.map(layout => {
    const card = byId.get(layout.id);
    if (!card) return null;
    const targetRoute = resolveActionRoute(card);
    const comingSoon = card.available === false;
    const actionState = comingSoon ? 'coming-soon' : undefined;
    const infoRoute = comingSoon
      ? undefined
      : game === 'karaoke'
        ? 'karaoke-battle-song-list'
        : card.id === 'birthday'
          ? 'royal-battle-info-birthday'
          : card.id === 'party' ? 'royal-battle-collection-party' : undefined;
    const infoState = infoRoute ? undefined : 'coming-soon';
    const title = card.title.replaceAll('\n', ' ');
    const actionLabel = comingSoon
      ? `${title} — в разработке`
      : card.owned
        ? `Играть: ${title} (куплено)`
        : card.price ? `Купить: ${title}, ${card.price} монет` : `Играть бесплатно: ${title}`;
    return <React.Fragment key={card.id}>
      <ReferenceHotspot
        name={`category-${card.id}-info`}
        label={`Подробнее: ${title}`}
        box={{ x: layout.x + layout.width - 103, y: layout.y + 40, width: 68, height: 68 }}
        onClick={comingSoon ? undefined : () => onInfo(card)}
        targetRoute={infoRoute}
        targetState={infoState}
        ariaDisabled={comingSoon}
      />
      <ReferenceHotspot
        name={`category-${card.id}-action`}
        label={actionLabel}
        box={{ x: layout.x + 35, y: layout.y + 322, width: 285, height: 123 }}
        onClick={comingSoon ? undefined : () => onAction(card)}
        targetRoute={targetRoute}
        targetState={actionState}
        ariaDisabled={comingSoon}
        owned={card.owned}
        className="l56r-card-action"
      />
    </React.Fragment>;
  });
}

function RecommendationHotspots({ goTo, top }) {
  return RECOMMENDATIONS.map((item, index) => <ReferenceHotspot
    key={item.id}
    name={`recommendation-${item.id}`}
    label={`Открыть игру: ${item.label}`}
    box={{ x: 227 + index * 326, y: top + 167, width: 105, height: 105 }}
    onClick={() => goTo(item.route)}
    targetRoute={item.route}
  />);
}

function FooterHotspots({ footerTop, goTo }) {
  return <>
    <ReferenceHotspot
      name="footer-home"
      label="На главную"
      box={{ x: 25, y: footerTop + 105, width: 484, height: 185 }}
      onClick={() => goTo('home')}
      targetRoute="home"
    />
    <ReferenceHotspot
      name="footer-privacy"
      label="Политика конфиденциальности"
      box={{ x: 545, y: footerTop + 245, width: 435, height: 72 }}
      onClick={() => goTo('privacy')}
      targetRoute="privacy"
    />
  </>;
}

export function Layout56ReferenceBase({
  route,
  screen,
  cards,
  Nav,
  balance,
  favorite,
  goBack,
  goTo,
  isLoggedIn,
  onCategoryAction,
  onCategoryInfo,
  onFavorite,
  onStart,
  profileName,
  resolveActionRoute,
}) {
  if (!screen) return null;
  const isDescription = screen.kind === 'description';
  const backRoute = isDescription ? 'home' : screen.game === 'karaoke' ? 'karaoke-battle' : 'royal-battle';
  const controls = isDescription ? DESCRIPTION_CONTROLS[screen.game] : CATALOG_CONTROLS[screen.game];
  const showRoute = screen.game === 'karaoke' ? 'karaoke-battle-categories' : 'royal-battle-collections';
  const cardLayouts = CARD_LAYOUTS[route] || [];
  const usesDynamicNav = Boolean(Nav)
    && !matchesReferenceHeader({ balance, isLoggedIn, profileName });
  const back = () => {
    if (goBack) goBack(backRoute);
    else goTo(backRoute);
  };

  return <>
    <img
      className="l56r-reference"
      src={screen.asset}
      alt=""
      aria-hidden="true"
      data-figma-reference={screen.figmaNode}
    />
    <ReferenceSemantics cards={cards} game={screen.game} kind={screen.kind} />
    {!usesDynamicNav ? <ReferenceHotspot
      name="back"
      label={`Назад: ${isDescription ? 'Главная' : screen.game === 'karaoke' ? 'Караоке-битва' : 'Королевская битва'}`}
      box={{ x: 60, y: screen.headerTop, width: 600, height: 123.431 }}
      onClick={back}
      targetRoute={backRoute}
    /> : null}
    <ReferenceHeader {...{ Nav, back, backRoute, balance, goTo, isLoggedIn, profileName, screen }} />

    {isDescription ? <>
      <ReferenceHotspot
        name="favorite"
        label={favorite ? 'Убрать из избранного' : 'Добавить в избранное'}
        box={{ x: 936, y: 700, width: 84, height: 84 }}
        onClick={onFavorite}
        targetState="aria-pressed"
        ariaPressed={favorite}
        className="l56r-favorite"
      />
      <ReferenceHotspot
        name="start"
        label="Начать игру"
        box={controls.start}
        onClick={onStart}
        targetRoute={showRoute}
      />
      <ReferenceHotspot
        name="categories-show-all"
        label={screen.game === 'karaoke' ? 'Показать все категории' : 'Показать все сборники'}
        box={controls.showCategories}
        onClick={() => goTo(showRoute)}
        targetRoute={showRoute}
      />
      {controls.video ? <ReferenceHotspot
        name="video-play"
        label="Видео с игрой в разработке"
        box={controls.video}
        targetState="coming-soon"
        ariaDisabled
      /> : null}
      <RecommendationHotspots goTo={goTo} top={controls.recommendationsTop} />
      <ReferenceHotspot
        name="recommendations-show-all"
        label="Показать все игры"
        box={controls.showGames}
        onClick={() => goTo('home')}
        targetRoute="home"
      />
    </> : <>
      <ReferenceHotspot
        name="owned-show-all"
        label={screen.game === 'karaoke' ? 'Показать все мои категории' : 'Показать все мои сборники'}
        box={controls.ownedShowAll}
        onClick={() => goTo(route)}
        targetRoute={route}
      />
      <ReferenceHotspot
        name="available-show-all"
        label={screen.game === 'karaoke' ? 'Показать все категории для покупки' : 'Показать все сборники для покупки'}
        box={controls.availableShowAll}
        onClick={() => goTo(route)}
        targetRoute={route}
      />
      <ReferenceHotspot
        name="start"
        label="Начать игру"
        box={controls.start}
        onClick={onStart}
        targetRoute={resolveActionRoute(cards.find(card => card.owned) || cards[0])}
      />
    </>}

    <CategoryHotspots
      cards={cards}
      layouts={cardLayouts}
      onAction={onCategoryAction}
      onInfo={onCategoryInfo}
      resolveActionRoute={resolveActionRoute}
      game={screen.game}
    />
    <FooterHotspots footerTop={screen.footerTop} goTo={goTo} />
  </>;
}
