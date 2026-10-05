import React from 'react';
import freeCollectionReference from '../../../reference/layout6/free-collection.png';
import paidCollectionReference from '../../../reference/layout6/paid-collection.png';
import './layout6-collection.css';

export const LAYOUT6_COLLECTION_ROUTES = {
  party: 'royal-battle-collection-party',
  birthday: 'royal-battle-collection-birthday',
};

const COLLECTIONS = {
  party: {
    id: 'party',
    title: 'Вечеринка',
    heading: 'ВЕЧЕРИНКА',
    price: 0,
    gameCount: 10,
    hero: '/generated/layout6-collection/hero-party.png',
    management: '/generated/layout6-collection/management-free.png',
    figmaNode: '1:733',
  },
  birthday: {
    id: 'birthday',
    title: 'День рождения',
    heading: 'ДЕНЬ РОЖДЕНИЯ',
    price: 100,
    gameCount: 10,
    hero: '/generated/layout6-collection/hero-birthday.png',
    management: '/generated/layout6-collection/management-paid.png',
    figmaNode: '1:771',
  },
};

const FIGMA_EXPORTS = {
  props: '/generated/layout6-collection/props.png',
  tasks: '/generated/layout6-collection/task-types.png',
  tips: '/generated/layout6-collection/tips.png',
};

const REFERENCE_PROFILE = 'Тимур';
const REFERENCE_BALANCE = 11240;
const REFERENCE_ASSETS = Object.freeze({
  party: freeCollectionReference,
  birthday: paidCollectionReference,
});

function referenceBox({ x, y, width, height }) {
  return { left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px` };
}

function ReferenceHotspot({
  box,
  disabled = false,
  ariaDisabled = false,
  label,
  name,
  onClick,
  targetAction,
  targetRoute,
}) {
  return (
    <button
      type="button"
      className="l6c-reference-hotspot"
      style={referenceBox(box)}
      disabled={disabled}
      aria-disabled={ariaDisabled || undefined}
      onClick={onClick}
      aria-label={label}
      data-reference-hotspot={name}
      data-target-action={targetAction || undefined}
      data-target-route={targetRoute || undefined}
    />
  );
}

function CollectionReference({
  buyCollection,
  buyProps,
  data,
  goTo,
  headerBack,
  gameAvailable,
  locked,
  newGame,
  openCollections,
  openTaskList,
  startCollection,
}) {
  const footerTop = 5041;
  return (
    <>
      <img
        className="l6c-reference-image"
        src={REFERENCE_ASSETS[data.id]}
        alt=""
        aria-hidden="true"
        data-figma-reference={data.figmaNode}
      />
      <div className="l6c-visually-hidden">
        <h1 id="l6c-title">Сборник: {data.title}</h1>
        <p>{locked ? `Сборник стоит ${data.price} монет` : 'Сборник доступен для игры'}</p>
        <h2>Типы заданий</h2>
        <ul>
          <li>Соло</li><li>Батл-роял</li><li>Коммандос</li><li>Дуэль</li><li>Играют все</li>
        </ul>
        <h2>Управление сборником</h2>
      </div>

      <ReferenceHotspot
        name="back"
        label="Назад к сборникам Королевской битвы"
        box={{ x: 60, y: 107, width: 600, height: 123.431 }}
        onClick={headerBack}
        targetRoute="royal-battle-collections"
      />
      <ReferenceHotspot
        name="account"
        label="Открыть профиль"
        box={{ x: 670, y: 107, width: 350, height: 123.431 }}
        onClick={() => goTo?.('profile')}
        targetRoute="profile"
      />
      {locked ? (
        <ReferenceHotspot
          name="collection-buy"
          label={`Купить сборник «${data.title}» за ${data.price} монет`}
          box={{ x: 124, y: 1197.431, width: 524, height: 156 }}
          onClick={buyCollection}
          targetRoute="royal-battle-collection-confirm"
        />
      ) : null}
      <ReferenceHotspot
        name="start"
        label={!gameAvailable ? `Игры сборника «${data.title}» в разработке` : locked ? `Сначала купите сборник «${data.title}»` : `Начать сборник «${data.title}»`}
        box={{ x: 60, y: 1497.431, width: 960, height: 136 }}
        disabled={locked}
        ariaDisabled={!locked && !gameAvailable}
        onClick={gameAvailable ? startCollection : undefined}
        targetAction={gameAvailable ? 'start' : 'coming-soon'}
      />
      <ReferenceHotspot
        name="props-buy"
        label="Купить реквизит"
        box={{ x: 557, y: 1761.431, width: 397, height: 108 }}
        onClick={buyProps}
        targetRoute="royal-battle-props"
      />
      <ReferenceHotspot
        name="management-collections"
        label="Выбрать или купить другой сборник"
        box={{ x: 60, y: 3794.222, width: 960, height: 144 }}
        onClick={openCollections}
        targetRoute="royal-battle-collections"
      />
      <ReferenceHotspot
        name="management-tasks"
        label={!gameAvailable ? 'Список заданий в разработке' : locked ? 'Купить список заданий' : 'Открыть список заданий'}
        box={{ x: 60, y: 3938.222, width: 960, height: 144 }}
        ariaDisabled={!gameAvailable}
        onClick={gameAvailable ? openTaskList : undefined}
        targetAction={!gameAvailable ? 'coming-soon' : locked ? 'buy-collection' : 'open-task-list'}
      />
      <ReferenceHotspot
        name="management-winner"
        label="Объявление победителя в разработке"
        box={{ x: 60, y: 4082.222, width: 960, height: 144 }}
        ariaDisabled
        targetAction="coming-soon"
      />
      <ReferenceHotspot
        name="management-new-game"
        label={gameAvailable ? 'Новая игра' : 'Новая игра в разработке'}
        box={{ x: 60, y: 4226.222, width: 960, height: 144 }}
        ariaDisabled={!gameAvailable}
        onClick={gameAvailable ? newGame : undefined}
        targetAction={gameAvailable ? (locked ? 'buy-collection' : 'new-game') : 'coming-soon'}
      />
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

function runAction(callback, goTo, fallbackRoute, payload) {
  if (callback) {
    callback(payload);
    return;
  }
  if (fallbackRoute) goTo?.(fallbackRoute);
}

function FallbackHeader({ balance, onBack, profileName }) {
  const initial = String(profileName || 'Т').trim().charAt(0).toUpperCase() || 'Т';
  return (
    <nav className="l6c-fallback-header" aria-label="Навигация сборника">
      <button type="button" className="l6c-fallback-back" onClick={onBack}>
        <span aria-hidden="true">‹</span>
        <strong>Королевская битва</strong>
      </button>
      <div className="l6c-fallback-account" aria-label={`Баланс ${balance ?? 0} монет`}>
        <span className="l6c-fallback-balance">🪙 {balance ?? 0}</span>
        <span className="l6c-fallback-avatar">{initial}</span>
      </div>
    </nav>
  );
}

/**
 * Figma Layout 6 collection screen.
 *
 * `collection="party"` mirrors node 1:733. `collection="birthday"` mirrors
 * node 1:771. State and callbacks are intentionally namespaced to the royal
 * battle flow; this component does not read or mutate karaoke/music-loto data.
 */
export function Layout6Collection({
  collection = 'party',
  owned,
  Nav,
  Footer,
  balance,
  isLoggedIn = true,
  profileName,
  goTo,
  goBack,
  onOpenCollections,
  onBuyCollection,
  onBuyProps,
  onStart,
  onOpenTaskList,
  onNewGame,
  gameAvailable,
}) {
  const data = COLLECTIONS[collection] || COLLECTIONS.party;
  const hasAccess = owned ?? data.price === 0;
  const locked = data.price > 0 && !hasAccess;
  const hasGame = gameAvailable ?? data.id === 'birthday';
  const normalizedProfileName = String(profileName || '').trim();
  const canonicalCollectionState = data.id === 'party' ? hasAccess : locked;
  const useReference = Boolean(
    REFERENCE_ASSETS[data.id]
      && canonicalCollectionState
      && isLoggedIn
      && normalizedProfileName === REFERENCE_PROFILE
      && Number(balance) === REFERENCE_BALANCE,
  );

  const openCollections = () => runAction(onOpenCollections, goTo, 'royal-battle-collections', data);
  const buyCollection = () => runAction(onBuyCollection, goTo, 'royal-battle-collection-purchase', data);
  const buyProps = () => runAction(onBuyProps, goTo, 'royal-battle-props', data);
  const startCollection = () => {
    if (!hasGame) return;
    runAction(onStart, goTo, 'royal-battle-game', data);
  };
  const openTaskList = () => {
    if (!hasGame) return;
    if (locked) buyCollection();
    else runAction(onOpenTaskList, goTo, 'royal-battle-tasks', data);
  };
  const newGame = () => {
    if (!hasGame) return;
    if (locked) buyCollection();
    else runAction(onNewGame || onStart, goTo, 'royal-battle-game', data);
  };
  const headerBack = () => {
    if (onOpenCollections) onOpenCollections(data);
    else if (goBack) goBack('royal-battle-collections');
    else goTo?.('royal-battle-collections');
  };

  return (
    <main
      className={`page l6c-page l6c-page--${data.id}${locked ? ' is-locked' : ''}`}
      data-layout="6"
      data-figma-node={data.figmaNode}
      data-render-mode={useReference ? 'figma-reference' : 'live'}
      aria-labelledby="l6c-title"
    >
      {useReference ? (
        <CollectionReference
          buyCollection={buyCollection}
          buyProps={buyProps}
          data={data}
          goTo={goTo}
          headerBack={headerBack}
          gameAvailable={hasGame}
          locked={locked}
          newGame={newGame}
          openCollections={openCollections}
          openTaskList={openTaskList}
          startCollection={startCollection}
        />
      ) : <>
        <div className="l6c-stack">
        <div className="l6c-nav">
          {Nav ? (
            <Nav
              goTo={goTo || (() => {})}
              goBack={headerBack}
              backRoute="royal-battle-collections"
              balance={balance}
              isLoggedIn={isLoggedIn}
              profileName={profileName}
              title="Королевская битва"
            />
          ) : (
            <FallbackHeader balance={balance} onBack={headerBack} profileName={profileName} />
          )}
        </div>

        <h1 className="l6c-title" id="l6c-title">
          <span>СБОРНИК:</span>{' '}
          <em>{data.heading}</em>
        </h1>

        <section className="l6c-cover" aria-label={`Обложка сборника «${data.title}»`}>
          <img src={data.hero} alt="" aria-hidden="true" />
          {locked ? (
            <button
              className="l6c-hit l6c-cover-buy"
              type="button"
              onClick={buyCollection}
              aria-label={`Купить сборник «${data.title}» за ${data.price} монет`}
            />
          ) : null}
        </section>

        <button
          className="l6c-start"
          type="button"
          disabled={locked}
          aria-disabled={!locked && !hasGame ? true : undefined}
          onClick={hasGame ? startCollection : undefined}
          aria-label={!hasGame ? `Игры сборника «${data.title}» в разработке` : locked ? `Сначала купите сборник «${data.title}»` : `Начать сборник «${data.title}»`}
        >
          <span>Начать игру</span>
          <small>{data.gameCount} игр</small>
        </button>

        <section className="l6c-props" aria-label="Реквизит для сборника">
          <img src={FIGMA_EXPORTS.props} alt="" aria-hidden="true" />
          <button
            className="l6c-hit l6c-props-buy"
            type="button"
            onClick={buyProps}
            aria-label="Купить реквизит"
          />
          <div className="l6c-visually-hidden">
            <h2>В этом сборнике вам могут понадобиться</h2>
            <ul><li>Стаканчики</li><li>Теннисные мячики</li></ul>
          </div>
        </section>

        <section className="l6c-task-types" aria-label="Типы заданий и система раундов">
          <img src={FIGMA_EXPORTS.tasks} alt="" aria-hidden="true" />
          <div className="l6c-visually-hidden">
            <h2>Типы заданий</h2>
            <ul>
              <li>Соло — игрок выполняет задание самостоятельно.</li>
              <li>Батл-роял — все играют против друг друга.</li>
              <li>Коммандос — задание выполняется в команде с другим игроком.</li>
              <li>Дуэль — игра проходит между двумя игроками.</li>
              <li>Играют все — в игре принимают участие все игроки.</li>
            </ul>
            <p>10 раундов. Побеждает тот, у кого по итогам 10 раундов окажется больше всего баллов.</p>
          </div>
        </section>

        <section className="l6c-management" aria-label="Управление сборником">
          <img src={data.management} alt="" aria-hidden="true" />
          <button className="l6c-hit l6c-manage-row l6c-manage-row--collections" type="button" onClick={openCollections} aria-label="Выбрать или купить другой сборник" />
          <button className="l6c-hit l6c-manage-row l6c-manage-row--tasks" type="button" disabled={!hasGame} onClick={openTaskList} aria-label={!hasGame ? 'Список заданий в разработке' : locked ? 'Купить список заданий' : 'Открыть список заданий'} />
          <button className="l6c-hit l6c-manage-row l6c-manage-row--winner" type="button" disabled aria-label="Объявление победителя в разработке" />
          <button className="l6c-hit l6c-manage-row l6c-manage-row--new" type="button" disabled={!hasGame} onClick={newGame} aria-label={hasGame ? 'Новая игра' : 'Новая игра в разработке'} />
        </section>

        <section className="l6c-tips" aria-label="Советы перед игрой">
          <img src={FIGMA_EXPORTS.tips} alt="" aria-hidden="true" />
          <div className="l6c-visually-hidden">
            <h2>Советы</h2>
            <p>Заранее подготовьте реквизит, указанный в описании сборника.</p>
            <p>Назначьте одного человека считать очки — так никто не запутается в баллах.</p>
            <p>Перед каждой игрой посмотрите короткое описание, как играть в игру.</p>
          </div>
        </section>
        </div>

        {Footer ? <Footer /> : null}
      </>}
    </main>
  );
}
