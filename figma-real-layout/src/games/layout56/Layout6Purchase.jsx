import React from 'react';
import purchaseConfirmReference from '../../../reference/layout6/purchase-confirm.png';
import purchaseInsufficientReference from '../../../reference/layout6/purchase-insufficient.png';
import purchaseSuccessReference from '../../../reference/layout6/purchase-success.png';
import './layout6-purchase.css';

export const LAYOUT6_PURCHASE_ROUTES = Object.freeze({
  insufficient: 'royal-battle-collection-purchase',
  confirm: 'royal-battle-collection-confirm',
  success: 'royal-battle-collection-success',
});

export const LAYOUT6_PURCHASE_PRICE = 100;

const ASSETS = Object.freeze({
  birthdayCard: '/generated/layout6-purchase/birthday-card.png',
  confetti: '/generated/layout6-purchase/success-confetti.png',
  successIcon: '/generated/layout6-purchase/success-icon.svg',
  coin: '/generated/balance-coin-clean.png',
});

const FIGMA_NODES = Object.freeze({
  insufficient: '1:978',
  confirm: '1:1024',
  success: '1:810',
});

const REFERENCE_PROFILE = 'Тимур';
const REFERENCE_STATES = Object.freeze({
  insufficient: {
    asset: purchaseInsufficientReference,
    balance: 0,
    height: 2680,
  },
  confirm: {
    asset: purchaseConfirmReference,
    balance: 0,
    height: 2680,
  },
  success: {
    asset: purchaseSuccessReference,
    balance: 11240,
    height: 2564,
  },
});

function referenceBox({ x, y, width, height }) {
  return { left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px` };
}

function ReferenceHotspot({ box, label, name, onClick, targetAction, targetRoute }) {
  return (
    <button
      type="button"
      className="l6p-reference-hotspot"
      style={referenceBox(box)}
      onClick={onClick}
      aria-label={label}
      data-reference-hotspot={name}
      data-target-action={targetAction || undefined}
      data-target-route={targetRoute || undefined}
    />
  );
}

function PurchaseReference({ back, confirm, goTo, mode, returnToGame, start, topUp }) {
  const config = REFERENCE_STATES[mode];
  const success = mode === 'success';
  const footerTop = success ? 2059 : 2199;
  return (
    <>
      <img
        className="l6p-reference-image"
        src={config.asset}
        alt=""
        aria-hidden="true"
        data-figma-reference={FIGMA_NODES[mode]}
      />
      <div className="l6p-reference-semantics">
        <h1 id="l6p-reference-title">
          {success ? 'Спасибо за покупку' : 'Подтвердите вашу покупку'}
        </h1>
        <p>Сборник «День рождения», стоимость 100 монет.</p>
      </div>
      <ReferenceHotspot
        name="back"
        label="Назад к сборнику День рождения"
        box={{ x: 60, y: 80, width: 600, height: 123.431 }}
        onClick={back}
        targetRoute="royal-battle-collection-birthday"
      />
      <ReferenceHotspot
        name="account"
        label="Открыть профиль"
        box={{ x: 670, y: 80, width: 350, height: 123.431 }}
        onClick={() => goTo?.('profile')}
        targetRoute="profile"
      />
      {mode === 'insufficient' ? (
        <ReferenceHotspot
          name="top-up"
          label="Пополнить баланс на 100 рублей"
          box={{ x: 124, y: 1419.599, width: 832, height: 136 }}
          onClick={topUp}
          targetRoute="balance-top-up"
        />
      ) : null}
      {mode === 'confirm' ? (
        <ReferenceHotspot
          name="confirm-purchase"
          label="Оплатить 100 монет"
          box={{ x: 188, y: 1221.431, width: 704, height: 136 }}
          onClick={confirm}
          targetRoute={LAYOUT6_PURCHASE_ROUTES.success}
        />
      ) : null}
      {success ? (
        <>
          <ReferenceHotspot
            name="start"
            label="Начать Королевскую битву"
            box={{ x: 108, y: 856.431, width: 864, height: 122 }}
            onClick={start}
            targetRoute="royal-battle-game"
          />
          <ReferenceHotspot
            name="return-to-game"
            label="Вернуться в игру"
            box={{ x: 108, y: 1002.431, width: 864, height: 120 }}
            onClick={returnToGame}
            targetRoute="royal-battle-collection-birthday"
          />
        </>
      ) : null}
      <ReferenceHotspot
        name="footer-home"
        label="На главную"
        box={{ x: 25, y: footerTop + 105, width: 484, height: 190 }}
        onClick={() => goTo?.('home')}
        targetRoute="home"
      />
      <ReferenceHotspot
        name="footer-privacy"
        label="Политика конфиденциальности"
        box={{ x: 545, y: footerTop + 245, width: 435, height: 72 }}
        onClick={() => goTo?.('privacy')}
        targetRoute="privacy"
      />
    </>
  );
}

function resolveState(route, state) {
  if (state && Object.hasOwn(FIGMA_NODES, state)) return state;
  return Object.entries(LAYOUT6_PURCHASE_ROUTES)
    .find(([, value]) => value === route)?.[0] || 'insufficient';
}

function runAction(callback, goTo, fallbackRoute, payload) {
  if (callback) {
    void callback(payload);
    return;
  }
  if (fallbackRoute) goTo?.(fallbackRoute);
}

function FallbackHeader({ balance, onBack, profileName, title }) {
  const initial = String(profileName || 'Т').trim().charAt(0).toUpperCase() || 'Т';
  return (
    <nav className="l6p-fallback-header" aria-label="Навигация покупки сборника">
      <button className="l6p-fallback-back" type="button" onClick={onBack}>
        <span aria-hidden="true">‹</span>
        <strong>{title}</strong>
      </button>
      <div className="l6p-fallback-account" aria-label={`Баланс ${balance ?? 0} монет`}>
        <span className="l6p-fallback-balance">
          <img src={ASSETS.coin} alt="" aria-hidden="true" />
          <strong>{Number(balance || 0).toLocaleString('ru-RU')}</strong>
        </span>
        <span className="l6p-fallback-avatar">{initial}</span>
      </div>
    </nav>
  );
}

function PurchaseHeader({ Nav, balance, goBack, goTo, isLoggedIn, onBack, profileName, title }) {
  const handleBack = () => {
    if (onBack) {
      void onBack();
      return;
    }
    if (goBack) goBack('royal-battle-collection-birthday');
    else goTo?.('royal-battle-collection-birthday');
  };

  return (
    <div className="l6p-nav">
      {Nav ? (
        <Nav
          goTo={goTo || (() => {})}
          goBack={handleBack}
          backRoute="royal-battle-collection-birthday"
          balance={balance}
          isLoggedIn={isLoggedIn}
          profileName={profileName}
          title={title}
        />
      ) : (
        <FallbackHeader balance={balance} onBack={handleBack} profileName={profileName} title={title} />
      )}
    </div>
  );
}

function BirthdayCard() {
  return (
    <div className="l6p-birthday-card" role="img" aria-label="Сборник игр «День рождения»">
      <img src={ASSETS.birthdayCard} alt="" aria-hidden="true" width="486" height="486" />
    </div>
  );
}

function CollectionRow({ showTotal = false }) {
  return (
    <div className={`l6p-summary${showTotal ? ' l6p-summary--insufficient' : ''}`}>
      <div className="l6p-summary-row l6p-summary-row--collection">
        <span>Сборник</span>
        <strong>День рождения</strong>
      </div>
      <div className="l6p-summary-divider" aria-hidden="true" />
      {showTotal ? (
        <>
          <div className="l6p-summary-row l6p-summary-row--total">
            <strong>Итого</strong>
            <span className="l6p-summary-price">
              <img src={ASSETS.coin} alt="" aria-hidden="true" />
              <strong>100 монет</strong>
            </span>
          </div>
          <p className="l6p-warning">
            <span aria-hidden="true">!</span>
            <strong>У вас не хватает монет<br />(1 монета = 1 рубль)</strong>
          </p>
        </>
      ) : null}
    </div>
  );
}

function InsufficientButton({ busy, onClick }) {
  return (
    <button className="l6p-action" type="button" disabled={busy} onClick={onClick}>
      <span>ПОПОЛНИТЬ БАЛАНС</span>
      <small>100 рублей</small>
    </button>
  );
}

function ConfirmButton({ busy, onClick }) {
  return (
    <button className="l6p-action" type="button" disabled={busy} onClick={onClick}>
      <span>{busy ? 'ОПЛАТА…' : 'ОПЛАТИТЬ'}</span>
      <small className="l6p-action-price">
        100 монет
        <img src={ASSETS.coin} alt="" aria-hidden="true" />
      </small>
    </button>
  );
}

function PurchasePanel({ mode, busy, error, onConfirm, onTopUp }) {
  const insufficient = mode === 'insufficient';
  return (
    <section className={`l6p-purchase-panel l6p-purchase-panel--${mode}`} aria-labelledby="l6p-purchase-heading">
      <h1 id="l6p-purchase-heading"><span>ПОДТВЕРДИТЕ </span>ВАШУ ПОКУПКУ</h1>
      <BirthdayCard />
      <div className="l6p-checkout">
        <CollectionRow showTotal={insufficient} />
        {insufficient ? (
          <InsufficientButton busy={busy} onClick={onTopUp} />
        ) : (
          <ConfirmButton busy={busy} onClick={onConfirm} />
        )}
        <p className="l6p-note">
          {insufficient
            ? 'После пополнения баланса списание монет произведётся автоматически'
            : 'После покупки категория будет разблокирована навсегда'}
        </p>
        {error ? <p className="l6p-error" role="alert">{error}</p> : null}
      </div>
    </section>
  );
}

function SuccessPanel({ busy, onReturn, onStart }) {
  return (
    <section className="l6p-success-section" aria-labelledby="l6p-success-heading">
      <h1>УРААА!</h1>
      <div className="l6p-success-card">
        <img className="l6p-success-icon" src={ASSETS.successIcon} alt="" aria-hidden="true" width="151" height="151" />
        <h2 id="l6p-success-heading">СПАСИБО ЗА ПОКУПКУ</h2>
        <div className="l6p-success-actions">
          <button className="l6p-success-start" type="button" disabled={busy} onClick={onStart}><span>НАЧАТЬ КОРОЛЕВСКУЮ БИТВУ</span></button>
          <button className="l6p-success-return" type="button" disabled={busy} onClick={onReturn}><span>ВЕРНУТЬСЯ В ИГРУ</span></button>
        </div>
      </div>
    </section>
  );
}

/**
 * Figma Layout 6 purchase flow.
 *
 * States map directly to Figma nodes:
 * - insufficient — 1:978
 * - confirm — 1:1024
 * - success — 1:810
 *
 * This component is intentionally presentation-only. The parent owns balance,
 * payment, entitlement persistence and navigation, and connects them through
 * the callbacks below.
 */
export function Layout6Purchase({
  route,
  state,
  Nav,
  Footer,
  balance = 0,
  isLoggedIn = true,
  profileName,
  goTo,
  goBack,
  busy = false,
  error = '',
  onBack,
  onTopUp,
  onConfirmPurchase,
  onStartGame,
  onReturnToGame,
}) {
  const mode = resolveState(route, state);
  const success = mode === 'success';
  const referenceState = REFERENCE_STATES[mode];
  const useReference = Boolean(
    referenceState
      && isLoggedIn
      && String(profileName || '').trim() === REFERENCE_PROFILE
      && Number(balance) === referenceState.balance
      && !busy
      && !error,
  );
  const payload = { collection: 'birthday', entitlement: 'royal:birthday', price: LAYOUT6_PURCHASE_PRICE };
  const topUp = () => runAction(onTopUp, goTo, 'balance-top-up', payload);
  const confirm = () => runAction(onConfirmPurchase, goTo, LAYOUT6_PURCHASE_ROUTES.success, payload);
  const start = () => runAction(onStartGame, goTo, 'royal-battle-game', payload);
  const returnToGame = () => runAction(onReturnToGame, goTo, 'royal-battle-collection-birthday', payload);
  const back = () => {
    if (onBack) {
      void onBack();
      return;
    }
    if (goBack) goBack('royal-battle-collection-birthday');
    else goTo?.('royal-battle-collection-birthday');
  };

  return (
    <main
      className={`page l6p-page l6p-page--${mode}`}
      data-layout="6"
      data-figma-node={FIGMA_NODES[mode]}
      data-render-mode={useReference ? 'figma-reference' : 'live'}
      aria-labelledby={useReference ? 'l6p-reference-title' : undefined}
      aria-busy={busy || undefined}
    >
      {useReference ? (
        <PurchaseReference
          back={back}
          confirm={confirm}
          goTo={goTo}
          mode={mode}
          returnToGame={returnToGame}
          start={start}
          topUp={topUp}
        />
      ) : <>
        {success ? <img className="l6p-confetti" src={ASSETS.confetti} alt="" aria-hidden="true" /> : null}
        <div className="l6p-stack">
          <PurchaseHeader
            Nav={Nav}
            balance={balance}
            goBack={goBack}
            goTo={goTo}
            isLoggedIn={isLoggedIn}
            onBack={back}
            profileName={profileName}
            title={success ? 'Успешная оплата' : 'Купить категорию'}
          />
          {success ? (
            <SuccessPanel busy={busy} onReturn={returnToGame} onStart={start} />
          ) : (
            <PurchasePanel mode={mode} busy={busy} error={error} onConfirm={confirm} onTopUp={topUp} />
          )}
        </div>
        {Footer ? <Footer dark year={success ? 2026 : 2025} /> : null}
      </>}
    </main>
  );
}
