import React from 'react';
import './layout5-purchase.css';

export const LAYOUT5_PURCHASE_ROUTES = Object.freeze({
  confirm: 'karaoke-battle-purchase-confirm',
  insufficient: 'karaoke-battle-purchase-insufficient',
  success: 'karaoke-battle-purchase-success',
  girls: 'karaoke-battle-girls-cover',
  confirm2000s: 'karaoke-battle-2000s-purchase-confirm',
  insufficient2000s: 'karaoke-battle-2000s-purchase-insufficient',
  success2000s: 'karaoke-battle-2000s-purchase-success',
});

export const LAYOUT5_CATEGORY_PRICES = Object.freeze({
  'karaoke:90s': 50,
  'karaoke:girls': 50,
  'karaoke:2000s': 50,
});

const PURCHASE_ROUTE_CONTEXT = Object.freeze({
  [LAYOUT5_PURCHASE_ROUTES.confirm]: { mode: 'confirm', categoryId: '90s' },
  [LAYOUT5_PURCHASE_ROUTES.insufficient]: { mode: 'insufficient', categoryId: '90s' },
  [LAYOUT5_PURCHASE_ROUTES.success]: { mode: 'success', categoryId: '90s' },
  [LAYOUT5_PURCHASE_ROUTES.girls]: { mode: 'girls', categoryId: 'girls' },
  [LAYOUT5_PURCHASE_ROUTES.confirm2000s]: { mode: 'confirm', categoryId: '2000s' },
  [LAYOUT5_PURCHASE_ROUTES.insufficient2000s]: { mode: 'insufficient', categoryId: '2000s' },
  [LAYOUT5_PURCHASE_ROUTES.success2000s]: { mode: 'success', categoryId: '2000s' },
});

const CATEGORY_DETAILS = Object.freeze({
  '90s': {
    title: 'Хиты 90-х',
    entitlement: 'karaoke:90s',
    layers: [
      { src: '/generated/layout5/category-a2.png', className: 'l5p-checkout-art-base' },
      { src: '/generated/layout5/category-a3.png', className: 'l5p-checkout-art-people' },
    ],
  },
  '2000s': {
    title: 'Хиты 2000-х',
    entitlement: 'karaoke:2000s',
    layers: [{ src: '/generated/layout5/category-b3.png', className: 'l5p-checkout-art-base' }],
  },
});

const FIGMA_NODES = Object.freeze({
  confirm: '1:754',
  insufficient: '1:1544',
  success: '1:2649',
  girls: '1:2133',
});

const ASSETS = Object.freeze({
  confirm: '/generated/layout5-purchase/confirm-screen.png',
  insufficient: '/generated/layout5-purchase/insufficient-screen.png',
  success: '/generated/layout5-purchase/success-screen.png',
  girls: '/generated/layout5-purchase/girls-screen.png',
});

function resolveContext(route, state) {
  const context = PURCHASE_ROUTE_CONTEXT[route] || PURCHASE_ROUTE_CONTEXT[LAYOUT5_PURCHASE_ROUTES.confirm];
  if (state && Object.hasOwn(FIGMA_NODES, state)) return { ...context, mode: state };
  return context;
}

function runAction(callback, goTo, fallbackRoute, payload) {
  if (callback) {
    void callback(payload);
    return;
  }
  if (fallbackRoute) goTo?.(fallbackRoute);
}

function DynamicHeader({ Nav, balance, goBack, goTo, isLoggedIn, mode, profileName }) {
  if (!Nav || mode === 'confirm') return null;
  const titles = {
    insufficient: 'Оплата',
    success: 'Успешная оплата',
    girls: 'Караоке-битва',
  };
  const backRoutes = {
    insufficient: 'karaoke-battle-categories',
    success: 'karaoke-battle-game',
    girls: 'karaoke-battle-categories',
  };
  const handleBack = () => {
    if (goBack) goBack(backRoutes[mode]);
    else goTo?.(backRoutes[mode]);
  };

  return (
    <div className="l5p-dynamic-nav">
      <Nav
        balance={balance}
        backRoute={backRoutes[mode]}
        goBack={handleBack}
        goTo={goTo || (() => {})}
        isLoggedIn={isLoggedIn}
        profileName={profileName}
        title={titles[mode]}
      />
    </div>
  );
}

function ScreenSemantics({ category, mode, playedCount }) {
  if (mode === 'girls') {
    return (
      <div className="l5p-visually-hidden">
        <h1>Девичник</h1>
        <p>Категория стоит 50 монет. Оплатите категорию, чтобы разблокировать игру.</p>
        <h2>Управление игрой</h2>
        <ul>
          <li>Выбрать или купить другую категорию</li>
          <li>Выпавшие песни: {playedCount}</li>
          <li>Объявить победителя</li>
          <li>Новая игра</li>
        </ul>
      </div>
    );
  }
  if (mode === 'success') {
    return (
      <div className="l5p-visually-hidden">
        <h1>Успешная оплата</h1>
        <p>Ура! Спасибо за покупку.</p>
      </div>
    );
  }
  return (
    <div className="l5p-visually-hidden">
      <h1>Подтвердите вашу покупку</h1>
      <p>Доступ к категории «{category.title}» за {category.price} монет.</p>
      {mode === 'insufficient' ? <p>У вас не хватает монет. Одна монета равна одному рублю.</p> : null}
    </div>
  );
}

function CheckoutPanel({ busy, category, mode, onBack, onConfirm, onTopUp }) {
  const insufficient = mode === 'insufficient';
  return (
    <section className={`l5p-checkout${insufficient ? ' is-insufficient' : ''}`} aria-label={`Покупка категории ${category.title}`}>
      <header className="l5p-checkout-heading">
        <h1>ПОДТВЕРДИТЕ <em>ВАШУ ПОКУПКУ</em></h1>
        {!insufficient ? (
          <button type="button" className="l5p-checkout-close" onClick={onBack} aria-label="Закрыть подтверждение покупки">×</button>
        ) : null}
      </header>
      <div className="l5p-checkout-card" aria-hidden="true">
        {category.layers.map(layer => <img key={layer.src} src={layer.src} className={layer.className} alt="" />)}
        <strong>{category.title}</strong>
      </div>
      <div className="l5p-checkout-summary">
        <span>Доступ к категории «{category.title}»</span>
        {insufficient ? <strong>ⓘ У вас не хватает монет<br />(1 монета = 1 рубль)</strong> : null}
      </div>
      <button
        type="button"
        className="l5p-checkout-pay"
        disabled={busy}
        onClick={insufficient ? onTopUp : onConfirm}
        aria-label={insufficient ? `Пополнить баланс и оплатить ${category.price} монет` : `Оплатить ${category.price} монет`}
      >
        <b>ОПЛАТИТЬ</b>
        <span><img src="/generated/balance-coin-clean.png" alt="" aria-hidden="true" />{category.price} монет</span>
      </button>
      <p className="l5p-checkout-note">{insufficient
        ? 'После пополнения баланса списание монет произойдёт автоматически'
        : 'После покупки категория будет разблокирована навсегда'}</p>
    </section>
  );
}

/**
 * Exact Layout 5 screens from Figma. The flattened Figma render is the visual
 * layer; real buttons and accessible copy are kept above it. The parent owns
 * payment, entitlement persistence and navigation.
 */
export function Layout5Purchase({
  route,
  state,
  Nav,
  balance = 0,
  isLoggedIn = true,
  profileName,
  goTo,
  goBack,
  busy = false,
  error = '',
  onBack,
  onConfirmPurchase,
  onTopUp,
  onStartGame,
  onReturnToGame,
  onSelectCategory,
  onPurchaseGirls,
  onShowPlayedSongs,
  onAnnounceWinner,
  onNewGame,
  playedCount = 0,
}) {
  const context = resolveContext(route, state);
  const mode = context.mode;
  const details = CATEGORY_DETAILS[context.categoryId] || CATEGORY_DETAILS['90s'];
  const category = {
    ...details,
    id: context.categoryId,
    price: LAYOUT5_CATEGORY_PRICES[details.entitlement],
  };
  const hitsPayload = { category: category.id, entitlement: details.entitlement, price: category.price };
  const girlsPayload = { category: 'girls', entitlement: 'karaoke:girls', price: LAYOUT5_CATEGORY_PRICES['karaoke:girls'] };
  const successRoute = category.id === '2000s' ? LAYOUT5_PURCHASE_ROUTES.success2000s : LAYOUT5_PURCHASE_ROUTES.success;
  const back = () => runAction(onBack, goTo, mode === 'confirm' ? 'karaoke-battle-categories' : 'karaoke-battle-game', mode === 'girls' ? girlsPayload : hitsPayload);
  const confirm = () => runAction(onConfirmPurchase, goTo, successRoute, hitsPayload);
  const topUp = () => runAction(onTopUp, goTo, 'balance-top-up', hitsPayload);
  const start = () => runAction(onStartGame, goTo, 'karaoke-battle-game', hitsPayload);
  const returnToGame = () => runAction(onReturnToGame, goTo, 'karaoke-battle-game', hitsPayload);
  const selectCategory = () => runAction(onSelectCategory, goTo, 'karaoke-battle-categories', girlsPayload);
  const purchaseGirls = () => runAction(onPurchaseGirls, goTo, 'karaoke-battle-categories', girlsPayload);
  const playedSongs = () => runAction(onShowPlayedSongs, goTo, 'karaoke-battle-viewed-songs', girlsPayload);
  const winner = () => runAction(onAnnounceWinner, goTo, 'karaoke-battle-game', girlsPayload);
  const newGame = () => runAction(onNewGame, goTo, 'karaoke-battle-game', girlsPayload);

  return (
    <main
      className={`page l5p-page l5p-page--${mode}`}
      data-layout="5"
      data-figma-node={FIGMA_NODES[mode]}
      aria-busy={busy || undefined}
    >
      <img className="l5p-screen" src={ASSETS[mode]} alt="" aria-hidden="true" />
      <ScreenSemantics mode={mode} category={category} playedCount={playedCount} />
      <DynamicHeader {...{ Nav, balance, goBack, goTo, isLoggedIn, mode, profileName }} />

      {mode === 'confirm' || mode === 'insufficient' ? (
        <CheckoutPanel busy={busy} category={category} mode={mode} onBack={back} onConfirm={confirm} onTopUp={topUp} />
      ) : null}
      {mode === 'success' ? (
        <>
          <button className="l5p-hit l5p-success-start" type="button" disabled={busy} onClick={start} aria-label="Начать караоке-битву" />
          <button className="l5p-hit l5p-success-return" type="button" disabled={busy} onClick={returnToGame} aria-label="Вернуться в игру" />
        </>
      ) : null}
      {mode === 'girls' ? (
        <>
          <button className="l5p-hit l5p-girls-category" type="button" onClick={selectCategory} aria-label="Выбрать категорию" />
          <button className="l5p-hit l5p-girls-buy" type="button" disabled={busy} onClick={purchaseGirls} aria-label="Купить категорию Девичник за 50 монет" />
          <button className="l5p-hit l5p-girls-start" type="button" disabled aria-label="Начать игру — сначала оплатите категорию" />
          <button className="l5p-hit l5p-girls-row l5p-girls-row--category" type="button" onClick={selectCategory} aria-label="Выбрать или купить другую категорию" />
          <span className="l5p-girls-played-count" aria-hidden="true" data-played-count={playedCount}>{playedCount}</span>
          <button className="l5p-hit l5p-girls-row l5p-girls-row--songs" type="button" onClick={playedSongs} aria-label={`Выпавшие песни: ${playedCount}`} />
          <button className="l5p-hit l5p-girls-row l5p-girls-row--winner" type="button" onClick={winner} aria-label="Объявить победителя" />
          <button className="l5p-hit l5p-girls-row l5p-girls-row--new" type="button" onClick={newGame} aria-label="Новая игра" />
        </>
      ) : null}
      {error ? <p className="l5p-visually-hidden" role="alert">{error}</p> : null}
      {mode !== 'confirm' ? <a className="l5p-hit l5p-privacy" href="#/privacy" onClick={() => goTo?.('privacy')} aria-label="Политика конфиденциальности" /> : null}
    </main>
  );
}
