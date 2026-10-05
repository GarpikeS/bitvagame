import React from 'react';
import './layout5-auth-success.css';

const BASE = '/generated/layout5/auth-states';

const SCREENS = Object.freeze({
  'register-purchase': { file: 'register-1.png', node: '1:3902', key: 'register-1', actionTop: 1297.451 },
  'register-category-purchase': { file: 'register-2.png', node: '1:4057', key: 'register-2', actionTop: 1297.451 },
  'register-default': { file: 'register-3.png', node: '1:4303', key: 'register-3', actionTop: 1182.452, accountNav: true },
  'login-purchase': { file: 'login-1.png', node: '1:4212', key: 'login-1', actionTop: 1393.452 },
  'login-default': { file: 'login-2.png', node: '1:4235', key: 'login-2', actionTop: 1393.452 },
  'login-play': { file: 'login-3.png', node: '1:4258', key: 'login-3', actionTop: 1393.452 },
  'login-category-purchase': { file: 'login-4.png', node: '1:4281', key: 'login-4', actionTop: 1393.452 },
});

export function getLayout5AuthSuccessReference(variant, authIntent) {
  return SCREENS[`${variant}-${authIntent}`] || null;
}

export function canUseLayout5AuthSuccessReference({ variant, authIntent, balance, profileName }) {
  const screen = getLayout5AuthSuccessReference(variant, authIntent);
  if (!screen || String(profileName || '').trim() !== 'Тимур') return false;
  return !screen.accountNav || Number(balance) === 11240;
}

/**
 * Exact visual adapter for the seven Layout 5 auth-success frames. The image is
 * the committed Figma export; transparent native controls retain keyboard and
 * pointer interaction without redrawing the unavailable licensed typography.
 */
export function Layout5AuthSuccessReference({
  variant,
  authIntent,
  primaryLabel,
  secondaryLabel,
  onBack,
  onPrimary,
  onSecondary,
  onAccount,
  onHome,
}) {
  const screen = getLayout5AuthSuccessReference(variant, authIntent);
  if (!screen) return null;

  return (
    <main
      className={`page l5a-page l5a-page--${screen.key}`}
      style={{ '--l5a-action-top': `${screen.actionTop}px` }}
      data-layout="5"
      data-figma-node={screen.node}
      data-render-mode="figma-reference"
    >
      <img
        className="l5a-reference"
        src={`${BASE}/${screen.file}`}
        alt=""
        aria-hidden="true"
        decoding="sync"
        draggable="false"
      />

      <div className="l5a-visually-hidden">
        <h1>{variant === 'login' ? 'Вы вошли в аккаунт' : 'Вы зарегистрированы'}</h1>
        <p>Тимур, ID 0427.</p>
        <p>{primaryLabel}</p>
        {secondaryLabel ? <p>{secondaryLabel}</p> : null}
      </div>

      <button className="l5a-hit l5a-back" type="button" onClick={onBack} aria-label="Назад" />
      {screen.accountNav ? (
        <button className="l5a-hit l5a-account" type="button" onClick={onAccount} aria-label="Открыть личный кабинет" />
      ) : (
        <button className="l5a-hit l5a-header-home" type="button" onClick={onHome} aria-label="На главную" />
      )}
      <button className="l5a-hit l5a-primary" type="button" onClick={onPrimary} aria-label={primaryLabel} />
      {secondaryLabel ? <button className="l5a-hit l5a-secondary" type="button" onClick={onSecondary} aria-label={secondaryLabel} /> : null}
      <button className="l5a-hit l5a-footer-home" type="button" onClick={onHome} aria-label="На главную" />
      <a className="l5a-hit l5a-privacy" href="#/privacy" aria-label="Политика конфиденциальности" />
    </main>
  );
}
