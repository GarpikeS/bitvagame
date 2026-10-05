import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import layout5Answers from '../../../reference/layout5/answers.png';
import layout5Cover from '../../../reference/layout5/cover.png';
import layout5Empty from '../../../reference/layout5/empty.png';
import layout5Ended from '../../../reference/layout5/ended.png';
import layout5Game from '../../../reference/layout5/game.png';
import layout5Pause from '../../../reference/layout5/pause.png';
import layout5Songs from '../../../reference/layout5/songs.png';
import layout5Hits90Cover from '../../../reference/figma-category-covers/hits-90-figma.png';
import './Layout5ReferenceGame.css';

export const LAYOUT5_REFERENCE_GAME_NODES = Object.freeze({
  empty: '1:5010',
  cover: '1:1980',
  playing: '1:539',
  paused: '1:572',
  ended: '1:606',
  answers: '1:638',
  secondSong: '1:3829',
});

const LIVE_STATES = new Set(['playing', 'paused', 'ended', 'answers']);
const FRAME_ASSETS = Object.freeze({
  cover: layout5Cover,
  playing: layout5Game,
  paused: layout5Pause,
  ended: layout5Ended,
  answers: layout5Answers,
});

const CATEGORY_COVER_ASSETS = Object.freeze({
  '90s': {
    figmaNode: '1:1947',
    src: layout5Hits90Cover,
  },
  girls: {
    figmaNode: '1:2133',
    src: '/figma-assets/music-category-devichnik-figma.png',
  },
  '2000s': {
    figmaNode: '1:4994',
    src: '/generated/layout5/category-b3.png',
    fallback: true,
    title: 'Хиты 2000-х',
  },
});

const FRAME_HEIGHTS = Object.freeze({
  'no-category': 3699,
  cover: 3857,
  playing: 3581,
  paused: 3581,
  ended: 3581,
  answers: 3581,
});

const STATE_LABELS = Object.freeze({
  'no-category': 'Категория не выбрана',
  cover: 'Игра готова к запуску',
  playing: 'Песня играет',
  paused: 'Песня на паузе',
  ended: 'Песня закончилась',
  answers: 'Показаны правильные слова',
});

const PRIMARY_SONG = Object.freeze({
  id: 'stay',
  artist: 'Дискотека Авария',
  title: 'Если хочешь остаться',
});

const SECONDARY_SONG = Object.freeze({
  id: 'recognise',
  artist: 'Корни',
  title: 'Ты узнаешь её',
});

function normalizeState(stage, category) {
  if (!category || stage === 'empty' || stage === 'no-category') return 'no-category';
  if (stage === 'game') return 'playing';
  if (stage === 'pause') return 'paused';
  if (stage === 'finished') return 'ended';
  return Object.hasOwn(FRAME_ASSETS, stage) ? stage : 'cover';
}

function getSongVariant(songVariant, song, songIndex) {
  if (songVariant === 'secondary' || songVariant === 'second') return 'secondary';
  if (songVariant === 'primary' || songVariant === 'first') return 'primary';
  if (song?.id === SECONDARY_SONG.id) return 'secondary';
  return Number(songIndex) % 2 === 1 ? 'secondary' : 'primary';
}

function ReferenceImage({ className = '', onError, onReady, part, ...props }) {
  const handleReady = useCallback(() => onReady(part), [onReady, part]);
  const setNode = useCallback((node) => {
    if (node?.complete && node.naturalWidth > 0) handleReady();
  }, [handleReady]);

  return (
    <img
      {...props}
      ref={setNode}
      className={className}
      alt=""
      aria-hidden="true"
      decoding="sync"
      draggable="false"
      loading="eager"
      onLoad={handleReady}
      onError={(event) => onError?.(part, event)}
    />
  );
}

function Hit({ action, className = '', disabled = false, label, onClick, rect }) {
  return (
    <button
      className={`l5rg-hit${className ? ` ${className}` : ''}`}
      data-action={action}
      type="button"
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
      disabled={disabled || !onClick}
      onClick={onClick}
      aria-label={label}
    />
  );
}

function EmptyFrame({ onError, onReady, partPrefix }) {
  return (
    <>
      <div className="l5rg-empty-slice l5rg-empty-slice--top" aria-hidden="true">
        <ReferenceImage
          className="l5rg-empty-cover"
          data-reference-frame="top"
          src={layout5Cover}
          part={`${partPrefix}:top`}
          onReady={onReady}
          onError={onError}
        />
      </div>
      <ReferenceImage
        className="l5rg-empty-art"
        data-reference-frame="empty"
        src={layout5Empty}
        part={`${partPrefix}:empty`}
        onReady={onReady}
        onError={onError}
      />
      <div className="l5rg-empty-slice l5rg-empty-slice--bottom" aria-hidden="true">
        <ReferenceImage
          className="l5rg-empty-cover"
          data-reference-frame="bottom"
          src={layout5Cover}
          part={`${partPrefix}:bottom`}
          onReady={onReady}
          onError={onError}
        />
      </div>
    </>
  );
}

function SecondSongCard({ state, onError, onReady, partPrefix }) {
  const revealed = state === 'answers';
  const patchAsset = state === 'playing'
    ? layout5Game
    : state === 'ended'
      ? layout5Ended
      : state === 'answers'
        ? layout5Answers
        : null;

  return (
    <>
      <div className="l5rg-second-song" aria-hidden="true">
        <ReferenceImage
          className={`l5rg-second-song-sheet ${revealed ? 'is-revealed' : 'is-hidden'}`}
          src={layout5Songs}
          part={`${partPrefix}:second-song`}
          onReady={onReady}
          onError={onError}
        />
      </div>
      {patchAsset ? (
        <div className="l5rg-control-patch" aria-hidden="true">
          <ReferenceImage
            className="l5rg-control-patch-frame"
            src={patchAsset}
            part={`${partPrefix}:control-patch`}
            onReady={onReady}
            onError={onError}
          />
        </div>
      ) : null}
    </>
  );
}

function ScreenSemantics({ balance, category, isLoggedIn, playedCount, profileName, remaining, song, state, titleId }) {
  return (
    <div className="l5rg-visually-hidden">
      <h1 id={titleId}>Караоке-битва</h1>
      <p aria-live="polite">{STATE_LABELS[state]}.</p>
      <p>{isLoggedIn ? `Профиль: ${profileName || 'пользователь'}.` : 'Пользователь не авторизован.'} Баланс: {balance} монет.</p>
      <p>{category ? `Выбранная категория: ${category.title || category.name || category.id || 'категория'}.` : 'Выберите категорию, чтобы играть или оплатить.'}</p>
      {LIVE_STATES.has(state) ? (
        <>
          <h2>{song.artist} — {song.title}</h2>
          <p>{state === 'answers' ? 'Правильные слова показаны.' : 'Правильные слова скрыты.'}</p>
          <p>Осталось песен: {remaining}. Выпавшие песни: {playedCount}.</p>
        </>
      ) : null}
      <p>Звук не воспроизводится автоматически.</p>
    </div>
  );
}

/**
 * Pixel-exact Layout 5 game states. Figma PNG exports are the visual layer;
 * accessible transparent buttons above them own all behaviour. This component
 * intentionally creates no audio element and never starts media playback.
 */
export function Layout5ReferenceGame({
  Nav,
  balance = 0,
  category = null,
  className = '',
  goBack,
  goTo,
  isLoggedIn = true,
  onAnnounceWinner,
  onBack,
  onExpand,
  onHome,
  onImageError,
  onImageReady,
  onNewGame,
  onNewSong,
  onOpenBalance,
  onOpenProfile,
  onPlayedSongs,
  onPrivacy,
  onSelectCategory,
  onStart,
  onToggleAnswers,
  onTogglePause,
  playedCount = 0,
  profileName = '',
  remaining = 10,
  setStage,
  song,
  songIndex = 0,
  songVariant = 'auto',
  stage = 'cover',
}) {
  const state = normalizeState(stage, category);
  const categoryId = String(category?.id || '');
  const categoryTitle = String(category?.title || category?.name || '').trim();
  const categoryCover = state === 'cover' ? CATEGORY_COVER_ASSETS[categoryId] : null;
  const resolvedVariant = getSongVariant(songVariant, song, songIndex);
  const resolvedSong = song || (resolvedVariant === 'secondary' ? SECONDARY_SONG : PRIMARY_SONG);
  const normalizedProfileName = String(profileName || 'Пользователь').trim() || 'Пользователь';
  const usesReferenceHeader = Boolean(isLoggedIn)
    && normalizedProfileName === 'Тимур'
    && Number(balance) === 11240;
  const usesDynamicHeader = Boolean(Nav) && !usesReferenceHeader;
  const renderKey = `${state}:${categoryId || 'none'}:${resolvedVariant}`;
  const titleId = useId();
  const [readyParts, setReadyParts] = useState(() => new Set());
  const readyNotification = useRef('');

  const partPrefix = `layout5:${renderKey}`;
  const expectedParts = useMemo(() => {
    if (state === 'no-category') {
      return [`${partPrefix}:top`, `${partPrefix}:empty`, `${partPrefix}:bottom`];
    }
    const parts = [`${partPrefix}:base`];
    if (categoryCover) parts.push(`${partPrefix}:category-cover`);
    if (resolvedVariant === 'secondary' && LIVE_STATES.has(state)) {
      parts.push(`${partPrefix}:second-song`);
      if (state !== 'paused') parts.push(`${partPrefix}:control-patch`);
    }
    return parts;
  }, [categoryCover, partPrefix, resolvedVariant, state]);

  const markReady = useCallback((part) => {
    setReadyParts((current) => {
      if (current.has(part)) return current;
      const next = new Set(current);
      next.add(part);
      return next;
    });
  }, []);

  const imageComplete = expectedParts.every((part) => readyParts.has(part));
  useEffect(() => {
    if (!imageComplete || readyNotification.current === renderKey) return;
    readyNotification.current = renderKey;
    onImageReady?.({ state, songVariant: resolvedVariant });
  }, [imageComplete, onImageReady, renderKey, resolvedVariant, state]);

  const selectCategory = onSelectCategory || (goTo ? () => goTo('karaoke-battle-categories') : null);
  const back = onBack || (goBack ? () => goBack('karaoke-battle-categories') : null);
  const home = onHome || (goTo ? () => goTo('home') : null);
  const openBalance = onOpenBalance || (goTo ? () => goTo('balance-top-up') : null);
  const openProfile = onOpenProfile || (goTo ? () => goTo(isLoggedIn ? 'profile' : 'login') : null);
  const start = onStart || (setStage ? () => setStage('playing') : null);
  const togglePause = onTogglePause || (setStage ? () => setStage((value) => value === 'playing' ? 'paused' : 'playing') : null);
  const toggleAnswers = onToggleAnswers || (setStage ? () => setStage((value) => value === 'answers' ? 'ended' : 'answers') : null);
  const announceWinner = onAnnounceWinner || (setStage ? () => setStage('ended') : null);
  const newSong = onNewSong || (setStage ? () => setStage('playing') : null);
  const newGame = onNewGame || (setStage ? () => setStage(category ? 'cover' : 'empty') : null);
  const isLive = LIVE_STATES.has(state);
  const managementTop = state === 'cover' ? 1714.4309 : state === 'no-category' ? 1556.4309 : 1856.4309;
  const managementCardTop = managementTop + 115;
  const footerShift = state === 'no-category' ? -158 : 0;

  const hits = [
    ...(!usesDynamicHeader ? [
      { action: 'back', label: 'Назад', onClick: back, rect: { x: 80, y: 127, width: 64, height: 64 } },
      { action: 'balance', label: `Баланс: ${balance} монет`, onClick: openBalance, rect: { x: 742, y: 119, width: 174, height: 98 } },
      { action: 'profile', label: isLoggedIn ? 'Открыть профиль' : 'Войти', onClick: openProfile, rect: { x: 918, y: 117, width: 90, height: 100 } },
    ] : []),
    {
      action: 'select-category',
      label: categoryTitle ? `Категория: ${categoryTitle}. Сменить категорию` : 'Выбрать категорию',
      onClick: selectCategory,
      rect: { x: 60, y: 310.4309, width: 960, height: 128 },
    },
    ...(state === 'cover' ? [{ action: 'start', label: 'Начать игру', onClick: start, rect: { x: 60, y: 1498.4309, width: 960, height: 136 } }] : []),
    ...(isLive ? [
      { action: 'expand', label: 'Развернуть песню', onClick: onExpand ? () => onExpand(state === 'answers') : null, rect: { x: 850, y: 585, width: 116, height: 116 } },
      ...(state === 'playing' || state === 'paused' ? [{ action: 'toggle-pause', label: state === 'playing' ? 'Пауза' : 'Продолжить', onClick: togglePause, rect: { x: 805, y: 1261, width: 188, height: 188 } }] : []),
      { action: 'toggle-answers', label: state === 'answers' ? 'Скрыть правильные слова' : 'Показать правильные слова', onClick: toggleAnswers, disabled: state === 'playing' || state === 'paused', rect: { x: 60, y: 1498.4309, width: 960, height: 122 } },
      { action: 'new-song', label: `Новая песня. Осталось ${remaining} песен`, onClick: newSong, disabled: remaining <= 0, rect: { x: 60, y: 1640.4309, width: 960, height: 136 } },
    ] : []),
    { action: 'manage-category', label: 'Выбрать или купить другую категорию', onClick: selectCategory, rect: { x: 60, y: managementCardTop, width: 960, height: 144 } },
    { action: 'played-songs', label: `Выпавшие песни: ${playedCount}`, onClick: onPlayedSongs, rect: { x: 60, y: managementCardTop + 144, width: 960, height: 144 } },
    { action: 'announce-winner', label: 'Объявить победителя', onClick: announceWinner, rect: { x: 60, y: managementCardTop + 288, width: 960, height: 144 } },
    { action: 'new-game', label: 'Новая игра', onClick: newGame, rect: { x: 60, y: managementCardTop + 432, width: 960, height: 144 } },
    ...(!isLive ? [
      { action: 'home', label: 'На главную', onClick: home, rect: { x: 40, y: 3440 + footerShift, width: 490, height: 190 } },
      { action: 'privacy', label: 'Политика конфиденциальности', onClick: onPrivacy || (goTo ? () => goTo('privacy') : null), rect: { x: 535, y: 3620 + footerShift, width: 410, height: 62 } },
    ] : []),
  ];

  return (
    <main
      className={`page l5rg-page l5rg-page--${state}${className ? ` ${className}` : ''}`}
      data-layout="5"
      data-category-id={categoryId || undefined}
      data-category-title={categoryTitle || undefined}
      data-category-figma-node={categoryCover?.figmaNode}
      data-category-cover-fallback={categoryCover?.fallback ? 'true' : undefined}
      data-category-cover-source={categoryCover?.src}
      data-figma-node={state === 'no-category' ? LAYOUT5_REFERENCE_GAME_NODES.empty : LAYOUT5_REFERENCE_GAME_NODES[state]}
      data-figma-composite-source={state === 'no-category'
        ? `${LAYOUT5_REFERENCE_GAME_NODES.cover},${LAYOUT5_REFERENCE_GAME_NODES.empty}`
        : categoryCover
          ? `${LAYOUT5_REFERENCE_GAME_NODES[state]},${categoryCover.figmaNode}`
          : undefined}
      data-figma-song-node={resolvedVariant === 'secondary' && isLive ? LAYOUT5_REFERENCE_GAME_NODES.secondSong : undefined}
      data-image-complete={imageComplete ? 'true' : 'false'}
      data-render-mode="figma-raster"
      data-song-variant={resolvedVariant}
      data-state={state}
      style={{ '--l5rg-frame-height': `${FRAME_HEIGHTS[state]}px` }}
      aria-labelledby={titleId}
    >
      {state === 'no-category' ? (
        <EmptyFrame partPrefix={partPrefix} onReady={markReady} onError={onImageError} />
      ) : (
        <ReferenceImage
          className="l5rg-frame"
          data-reference-frame="full"
          src={FRAME_ASSETS[state]}
          part={`${partPrefix}:base`}
          onReady={markReady}
          onError={onImageError}
        />
      )}

      {categoryCover ? (
        <>
          <ReferenceImage
            className={`l5rg-category-cover l5rg-category-cover--${categoryId}`}
            data-reference-frame="category-cover"
            src={categoryCover.src}
            part={`${partPrefix}:category-cover`}
            onReady={markReady}
            onError={onImageError}
          />
          {categoryCover.title ? (
            <span className="l5rg-category-cover-title" aria-hidden="true">{categoryCover.title}</span>
          ) : null}
        </>
      ) : null}

      {categoryTitle && state !== 'no-category' ? (
        <div
          className="l5rg-selected-category"
          data-selected-category-id={categoryId}
          data-selected-category-title={categoryTitle}
          aria-hidden="true"
        >
          <span>{categoryTitle}</span>
        </div>
      ) : null}

      {resolvedVariant === 'secondary' && isLive ? (
        <SecondSongCard state={state} partPrefix={partPrefix} onReady={markReady} onError={onImageError} />
      ) : null}

      {usesDynamicHeader ? (
        <div className="l5rg-dynamic-nav">
          <Nav
            backRoute="karaoke-battle-categories"
            balance={Number(balance) || 0}
            goBack={back}
            goTo={goTo || (() => {})}
            isLoggedIn={isLoggedIn}
            profileName={normalizedProfileName}
            title="Караоке-битва"
          />
        </div>
      ) : null}

      <Hit
        action="home-title"
        className="l5rg-title-home-hit"
        label="На главную: Караоке-битва"
        onClick={home}
        rect={{ x: 144, y: 107, width: 598, height: 123.431 }}
      />

      <span
        className="l5rg-played-count"
        style={{ top: managementCardTop + 188 }}
        aria-hidden="true"
        data-played-count={playedCount}
      >{playedCount}</span>
      {isLive ? <span className="l5rg-remaining-count" aria-hidden="true">осталось {remaining} песен</span> : null}

      <ScreenSemantics
        {...{ balance, category, isLoggedIn, playedCount, profileName, remaining, state, titleId }}
        song={resolvedSong}
      />
      <div className="l5rg-hits" aria-label="Управление караоке-битвой">
        {hits.map((hit) => <Hit key={hit.action} {...hit} />)}
      </div>
    </main>
  );
}
