import React from 'react';
import './layout6-screens.css';

export const LAYOUT6_SCREEN_ROUTES = {
  game: 'royal-battle-game',
  tasks: 'royal-battle-tasks',
  props: 'royal-battle-props',
  info: 'royal-battle-info-birthday',
};

const SCREENS = {
  [LAYOUT6_SCREEN_ROUTES.game]: {
    asset: '/generated/layout6-screens/game-birthday.png',
    figmaNode: '1:1061',
    height: 4604,
    footerTop: 4099,
    title: 'Королевская битва',
  },
  [LAYOUT6_SCREEN_ROUTES.tasks]: {
    asset: '/generated/layout6-screens/task-list.png',
    figmaNode: '1:1111',
    height: 4212,
    footerTop: 3707,
    title: 'Список заданий',
  },
  [LAYOUT6_SCREEN_ROUTES.props]: {
    asset: '/generated/layout6-screens/props-modal.png',
    figmaNode: '1:1121',
    height: 2074,
    footerTop: 1569,
    title: 'Королевская битва',
  },
  [LAYOUT6_SCREEN_ROUTES.info]: {
    asset: '/generated/layout6-screens/info-modal.png',
    figmaNode: '1:1288',
    height: 2074,
    footerTop: 1569,
    title: 'Королевская битва',
  },
};

const REFERENCE_PROFILE_NAME = 'Тимур';
const REFERENCE_BALANCE = 11240;

function isReferenceFixture({ balance, isLoggedIn, profileName }) {
  return Boolean(isLoggedIn)
    && String(profileName || '').trim() === REFERENCE_PROFILE_NAME
    && Number(balance) === REFERENCE_BALANCE;
}

function HiddenScreenCopy({ route }) {
  if (route === LAYOUT6_SCREEN_ROUTES.game) {
    return <div className="l6c-visually-hidden">
      <h1>Сборник: День рождения</h1>
      <h2>Тип игры: соло</h2>
      <p>Поставьте в ряд 5 стаканчиков с шариками внутри. У вас 1 минута, чтобы выдуть все 5 шариков из стаканчиков.</p>
      <p>Для игры понадобятся стаканчики и теннисные мячики.</p>
    </div>;
  }
  if (route === LAYOUT6_SCREEN_ROUTES.tasks) {
    return <div className="l6c-visually-hidden">
      <h1>Список заданий сборника «День рождения»</h1>
      <ol><li>Выдуйте шарики из стаканчиков.</li><li>Подвиньте стаканчики игральным кубиком.</li><li>Викторина «Битва».</li></ol>
    </div>;
  }
  if (route === LAYOUT6_SCREEN_ROUTES.props) {
    return <div className="l6c-visually-hidden"><h1>Приобрести реквизит для сборника</h1><p>Стаканчики, теннисные мячики или готовая корзина реквизита.</p></div>;
  }
  return <div className="l6c-visually-hidden"><h1>О сборнике «День рождения»</h1><p>Текст в разработке.</p></div>;
}

function DynamicHeader({ Nav, balance, goBack, goTo, isLoggedIn, profileName, title }) {
  if (!Nav) return null;
  return <div className="l6c-nav l6s-nav">
    <Nav
      goTo={goTo}
      goBack={goBack}
      backRoute="royal-battle-collection-birthday"
      balance={balance}
      isLoggedIn={isLoggedIn}
      profileName={profileName}
      title={title}
    />
  </div>;
}

function ReferenceChromeHits({ footerTop, goBack, goTo, isLoggedIn }) {
  const accountRoute = isLoggedIn ? 'profile' : 'login';
  return <>
    <button
      className="l6s-hit l6s-header-back"
      type="button"
      onClick={goBack}
      aria-label="Назад к сборнику «День рождения»"
      data-reference-hotspot="header-back"
      data-target-route="royal-battle-collection-birthday"
    />
    <button
      className="l6s-hit l6s-header-account"
      type="button"
      onClick={() => goTo(accountRoute)}
      aria-label={isLoggedIn ? 'Открыть личный кабинет' : 'Войти'}
      data-reference-hotspot="header-account"
      data-target-route={accountRoute}
    />
    <button
      className="l6s-hit l6s-footer-home"
      style={{ top: `${footerTop + 105}px` }}
      type="button"
      onClick={() => goTo('home')}
      aria-label="На главную"
      data-reference-hotspot="footer-home"
      data-target-route="home"
    />
    <button
      className="l6s-hit l6s-footer-privacy"
      style={{ top: `${footerTop + 245}px` }}
      type="button"
      onClick={() => goTo('privacy')}
      aria-label="Политика конфиденциальности"
      data-reference-hotspot="footer-privacy"
      data-target-route="privacy"
    />
  </>;
}

function ScreenHits({ route, goTo, onClose }) {
  if (route === LAYOUT6_SCREEN_ROUTES.game) {
    return <>
      <button className="l6s-hit l6s-game-previous" type="button" onClick={() => goTo(LAYOUT6_SCREEN_ROUTES.tasks)} aria-label="Вернуться к списку заданий" data-reference-hotspot="game-previous" data-target-route={LAYOUT6_SCREEN_ROUTES.tasks} />
      <button className="l6s-hit l6s-game-next" type="button" onClick={() => goTo(LAYOUT6_SCREEN_ROUTES.tasks)} aria-label="Выбрать новое задание" data-reference-hotspot="game-next" data-target-route={LAYOUT6_SCREEN_ROUTES.tasks} />
      <button className="l6s-hit l6s-manage-collections" type="button" onClick={() => goTo('royal-battle-collections')} aria-label="Выбрать другой сборник" data-reference-hotspot="manage-collections" data-target-route="royal-battle-collections" />
      <button className="l6s-hit l6s-manage-tasks" type="button" onClick={() => goTo(LAYOUT6_SCREEN_ROUTES.tasks)} aria-label="Открыть список заданий" data-reference-hotspot="manage-tasks" data-target-route={LAYOUT6_SCREEN_ROUTES.tasks} />
      <button className="l6s-hit l6s-manage-winner" type="button" aria-disabled="true" aria-label="Объявление победителя в разработке" data-reference-hotspot="manage-winner" data-target-state="coming-soon" />
      <button className="l6s-hit l6s-manage-new" type="button" onClick={() => goTo(LAYOUT6_SCREEN_ROUTES.tasks)} aria-label="Новая игра" data-reference-hotspot="manage-new" data-target-route={LAYOUT6_SCREEN_ROUTES.tasks} />
    </>;
  }
  if (route === LAYOUT6_SCREEN_ROUTES.tasks) {
    return <>
      <button className="l6s-hit l6s-task-play l6s-task-play--one" type="button" onClick={() => goTo(LAYOUT6_SCREEN_ROUTES.game)} aria-label="Сыграть первое задание" data-reference-hotspot="task-one" data-target-route={LAYOUT6_SCREEN_ROUTES.game} />
      <button className="l6s-hit l6s-task-play l6s-task-play--two" type="button" aria-disabled="true" aria-label="Задание «40 см» в разработке" data-reference-hotspot="task-two" data-target-state="coming-soon" />
      <button className="l6s-hit l6s-task-play l6s-task-play--three" type="button" aria-disabled="true" aria-label="Викторина «Битва» в разработке" data-reference-hotspot="task-three" data-target-state="coming-soon" />
    </>;
  }
  if (route === LAYOUT6_SCREEN_ROUTES.props) {
    return <>
      <button className="l6s-hit l6s-modal-close" type="button" onClick={onClose} aria-label="Закрыть покупку реквизита" data-reference-hotspot="modal-close" data-target-route="royal-battle-collection-birthday" />
      <a className="l6s-hit l6s-props-buy l6s-props-buy--cups" href="https://www.wildberries.ru/" target="_blank" rel="noreferrer" aria-label="Купить стаканчики на Wildberries" data-reference-hotspot="props-cups" data-target-state="external" />
      <a className="l6s-hit l6s-props-buy l6s-props-buy--balls" href="https://www.wildberries.ru/" target="_blank" rel="noreferrer" aria-label="Купить теннисные мячики на Wildberries" data-reference-hotspot="props-balls" data-target-state="external" />
      <a className="l6s-hit l6s-props-buy l6s-props-buy--all" href="https://www.wildberries.ru/" target="_blank" rel="noreferrer" aria-label="Купить весь реквизит на Wildberries" data-reference-hotspot="props-all" data-target-state="external" />
    </>;
  }
  return <button className="l6s-hit l6s-modal-close" type="button" onClick={onClose} aria-label="Закрыть информацию о сборнике" data-reference-hotspot="modal-close" data-target-route="royal-battle-collection-birthday" />;
}

export function Layout6Screen({
  route,
  Nav,
  balance,
  isLoggedIn,
  profileName,
  goTo,
  goBack,
  onClose,
}) {
  const screen = SCREENS[route];
  if (!screen) return null;

  const close = onClose || (() => goBack('royal-battle-collection-birthday'));
  const referenceFixture = isReferenceFixture({ balance, isLoggedIn, profileName });
  return <main
    className={`page l6c-page l6s-page l6s-page--${route.replace('royal-battle-', '')}`}
    style={{ '--l6s-height': `${screen.height}px` }}
    data-layout="6"
    data-figma-node={screen.figmaNode}
    data-render-mode={referenceFixture ? 'figma-reference' : 'live'}
  >
    <img className="l6s-reference" src={screen.asset} alt="" aria-hidden="true" data-figma-reference={screen.figmaNode} decoding="sync" draggable="false" />
    {referenceFixture
      ? <ReferenceChromeHits footerTop={screen.footerTop} goBack={close} goTo={goTo} isLoggedIn={isLoggedIn} />
      : <DynamicHeader {...{ Nav, balance, goTo, isLoggedIn, profileName }} goBack={close} title={screen.title} />}
    <HiddenScreenCopy route={route} />
    <ScreenHits route={route} goTo={goTo} onClose={close} />
  </main>;
}
