import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  LAYOUT7_ALL_PACKS,
  LAYOUT7_PACKS,
  LAYOUT7_PACK_BY_ID,
  LAYOUT7_SAMPLE_SONG,
  getLayout7SongMedia,
  ownsLayout7Pack,
  splitSongLabel,
} from './data.js';
import {
  LAYOUT7_ROUTE,
  isLayout7FullscreenRoute,
} from './routes.js';
import { useYandexAsset } from '../../yandex-public-assets.js';
import './layout7.css';

const PACK_STORAGE_KEY = 'bitva:layout7:karaoke-pack';
const SONG_INDEX_STORAGE_KEY = 'bitva:layout7:karaoke-song-index';
const REMAINING_STORAGE_KEY = 'bitva:layout7:karaoke-remaining';
const ICON_ROOT = '/figma-assets/layout7/icons/';

function readStoredPack() {
  try {
    const id = window.localStorage.getItem(PACK_STORAGE_KEY) || '';
    return LAYOUT7_PACK_BY_ID[id] ? id : 'hits-free';
  } catch {
    return 'hits-free';
  }
}

function readStoredNumber(key, fallback, maximum) {
  try {
    const stored = window.localStorage.getItem(key);
    if (stored === null || stored === '') return fallback;
    const value = Number(stored);
    return Number.isSafeInteger(value) && value >= 0 && value <= maximum ? value : fallback;
  } catch {
    return fallback;
  }
}

function PauseIcon() {
  return <span className="l7-pause-icon" aria-hidden="true"><i /><i /></span>;
}

function FigmaIcon({ className = '', file }) {
  return <img className={className} src={ICON_ROOT + file} alt="" aria-hidden="true" />;
}

function CloseIcon({ light = false }) {
  return <FigmaIcon file={light ? 'modal-close-light.svg' : 'modal-close.svg'} />;
}

function KaraokeVideo({
  landscape = false,
  media,
  onPlaybackStateChange,
  paused,
  playbackTimeRef,
  song,
}) {
  const videoRef = useRef(null);
  const [failed, setFailed] = useState(false);
  const source = landscape ? media.landscapeVideo : media.squareVideo;

  useEffect(() => {
    setFailed(false);
  }, [source]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !source || failed) return;
    if (paused) {
      video.pause();
      return;
    }
    const playRequest = video.play();
    if (playRequest && typeof playRequest.catch === 'function') {
      playRequest.catch(() => onPlaybackStateChange(true));
    }
  }, [failed, onPlaybackStateChange, paused, source]);

  const restorePlaybackPosition = event => {
    const video = event.currentTarget;
    const savedTime = Number(playbackTimeRef.current) || 0;
    if (savedTime > 0 && Number.isFinite(video.duration)) {
      video.currentTime = Math.min(savedTime, Math.max(0, video.duration - 0.25));
    }
    if (!paused) {
      const playRequest = video.play();
      if (playRequest && typeof playRequest.catch === 'function') {
        playRequest.catch(() => onPlaybackStateChange(true));
      }
    }
  };

  return (
    <div className={'l7-song-video' + (landscape ? ' is-landscape' : ' is-square')}>
      {!source ? (
        <p aria-live="polite">Загружаем песню…</p>
      ) : failed ? (
        <p role="alert">Не удалось загрузить видео песни. Попробуйте обновить страницу.</p>
      ) : (
        <video
          ref={videoRef}
          aria-label={'Караоке: ' + song}
          disablePictureInPicture
          playsInline
          preload="metadata"
          referrerPolicy="no-referrer"
          src={source}
          onEnded={() => {
            playbackTimeRef.current = 0;
            onPlaybackStateChange(true);
          }}
          onError={() => {
            setFailed(true);
            onPlaybackStateChange(true);
          }}
          onLoadedMetadata={restorePlaybackPosition}
          onTimeUpdate={event => {
            playbackTimeRef.current = event.currentTarget.currentTime;
          }}
        />
      )}
    </div>
  );
}

function AnswerSheet({ className = '', media, song }) {
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    setStatus('loading');
  }, [media.answers]);

  return (
    <div className={'l7-answer-sheet ' + className} tabIndex="0">
      {status !== 'ready' ? (
        <p aria-live="polite" role={status === 'error' ? 'alert' : undefined}>
          {status === 'error' ? 'Не удалось загрузить правильные слова.' : 'Загружаем правильные слова…'}
        </p>
      ) : null}
      {media.answers ? (
        <img
          className={status === 'ready' ? 'is-ready' : ''}
          src={media.answers}
          alt={'Правильные слова: ' + song}
          referrerPolicy="no-referrer"
          onError={() => setStatus('error')}
          onLoad={() => setStatus('ready')}
        />
      ) : null}
    </div>
  );
}

function useResolvedSongMedia(source) {
  const publicKey = source?.publicKey || '';
  const answers = useYandexAsset(publicKey, source?.answersPath || '');
  const landscapeVideo = useYandexAsset(publicKey, source?.landscapeVideoPath || '');
  const squareVideo = useYandexAsset(publicKey, source?.squareVideoPath || '');
  return source ? { answers, landscapeVideo, squareVideo } : null;
}

function Layout7Nav({ Nav, balance, goTo, isLoggedIn, profileName, backRoute }) {
  return (
    <div className="l7-nav">
      <Nav
        backRoute={backRoute}
        balance={balance}
        goBack={() => goTo(backRoute)}
        goTo={goTo}
        isLoggedIn={isLoggedIn}
        profileName={profileName}
        title="Караоке-битва"
      />
    </div>
  );
}

function PackArtwork({ pack }) {
  return (
    <span className={'l7-pack-artwork is-' + pack.catalogTone} aria-hidden="true">
      {pack.catalogLayers.map((src, index) => (
        <img key={src} src={src} alt="" data-layer={index + 1} />
      ))}
    </span>
  );
}

function PackCard({ Coin, onInfo, onSelect, owned, pack }) {
  return (
    <article
      className={'l7-pack-card' + (owned ? ' is-owned' : '') + (pack.free ? ' is-free' : '')}
      data-pack-id={pack.id}
    >
      <PackArtwork pack={pack} />
      <h3>{pack.catalogTitle}</h3>
      <button
        className="l7-pack-open"
        type="button"
        onClick={() => onSelect(pack)}
        aria-label={(owned ? 'Играть: ' : 'Купить: ') + pack.shortTitle}
      />
      <button
        className="l7-pack-info-button"
        type="button"
        onClick={() => onInfo(pack)}
        aria-label={'Список песен: ' + pack.shortTitle}
      >?</button>
      <span
        className={'l7-pack-action-pill' + (!pack.free && !owned ? ' is-price' : '')}
        aria-hidden="true"
      >
        {pack.free ? 'Бесплатно' : owned ? 'Играть' : <><Coin /><span>{pack.price} монет</span></>}
      </span>
      <span className="l7-visually-hidden">
        {pack.shortTitle}. {pack.free ? 'Бесплатный сборник' : owned ? 'Сборник куплен' : pack.price + ' монет'}.
        <Coin />
      </span>
    </article>
  );
}

function PackGrid({ Coin, onInfo, onSelect, packs, purchasedCategories }) {
  return (
    <div className="l7-pack-grid">
      {packs.map(pack => (
        <PackCard
          key={pack.id}
          Coin={Coin}
          onInfo={onInfo}
          onSelect={onSelect}
          owned={ownsLayout7Pack(pack, purchasedCategories)}
          pack={pack}
        />
      ))}
    </div>
  );
}

function ModalLayer({ children, onClose, variant = '' }) {
  useEffect(() => {
    const closeOnEscape = event => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    <div className={'l7-modal-layer ' + variant} role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      {children}
    </div>
  );
}

function PackInfoModal({ pack, onClose }) {
  return (
    <ModalLayer onClose={onClose} variant="l7-pack-modal-layer">
      <section className="l7-pack-modal" role="dialog" aria-modal="true" aria-labelledby="l7-pack-modal-title">
        <button className="l7-modal-close" type="button" onClick={onClose} aria-label="Закрыть">
          <CloseIcon light />
        </button>
        <span className="l7-modal-chip">Список песен</span>
        <h2 id="l7-pack-modal-title">{pack.title}</h2>
        <div className="l7-pack-badge">
          <img
            className="l7-pack-badge-icon"
            src={pack.badgeImage || ICON_ROOT + 'badge-' + pack.decade + '.png'}
            alt=""
            width="84"
            height="84"
            aria-hidden="true"
          />
          <span><strong>{pack.badgeTitle || 'Набор № ' + pack.setNumber}</strong><small>{pack.songs.length} песен</small></span>
        </div>
        <ol className="l7-pack-song-preview">
          {pack.songs.map(song => <li key={song}>{song.replace(' — ', ' - ')}</li>)}
        </ol>
      </section>
    </ModalLayer>
  );
}

function PurchaseModal({ Coin, busy, error, onCancel, onConfirm, pack }) {
  return (
    <ModalLayer onClose={busy ? () => {} : onCancel} variant="l7-purchase-modal-layer">
      <section className="l7-purchase-modal" role="dialog" aria-modal="true" aria-labelledby="l7-purchase-title">
        <button className="l7-modal-close" type="button" disabled={busy} onClick={onCancel} aria-label="Закрыть">
          <CloseIcon />
        </button>
        <img src={pack.coverImage || pack.image} alt="" width="300" height="300" />
        <h2 id="l7-purchase-title">КУПИТЬ СБОРНИК?</h2>
        <p>{pack.shortTitle}</p>
        {error ? <p className="l7-purchase-error" role="alert">{error}</p> : null}
        <div className="l7-purchase-actions">
          <button type="button" className="l7-button l7-button--red" disabled={busy} onClick={onConfirm}>
            {busy ? 'Покупаем…' : <><span>Купить</span><span className="l7-inline-price"><Coin /> {pack.price}</span></>}
          </button>
          <button type="button" className="l7-button l7-button--quiet" disabled={busy} onClick={onCancel}>Отмена</button>
        </div>
      </section>
    </ModalLayer>
  );
}

function CatalogPage({
  Coin,
  balance,
  isLoggedIn,
  onInfo,
  onSelect,
  purchasedCategories,
}) {
  const shared = { Coin, onInfo, onSelect, purchasedCategories };

  return (
    <div className="l7-catalog">
      <h1 className="l7-catalog-title">ВЫБРАТЬ КАТЕГОРИЮ</h1>
      <section className="l7-catalog-group" aria-label="Категории караоке">
        <PackGrid {...shared} packs={LAYOUT7_PACKS} />
        {!isLoggedIn ? <p className="l7-catalog-note">Войдите, чтобы купить сборник. Ваш баланс: {balance} монет.</p> : null}
      </section>
    </div>
  );
}

function Lyrics({ revealAnswers = false, compact = false }) {
  return (
    <div className={'l7-lyrics' + (compact ? ' is-compact' : '')}>
      {LAYOUT7_SAMPLE_SONG.stanzas.map((stanza, stanzaIndex) => (
        <p key={stanzaIndex}>
          {stanza.map((line, lineIndex) => (
            <span className="l7-lyric-line" key={lineIndex}>
              {line.map((part, partIndex) => part.answer ? (
                <span
                  className={'l7-answer ' + (revealAnswers ? 'is-revealed' : 'is-source')}
                  key={partIndex}
                  style={{ '--answer-length': Math.max(2, part.answer.length) }}
                >
                  {part.answer}
                </span>
              ) : <React.Fragment key={partIndex}>{part.text}</React.Fragment>)}
            </span>
          ))}
        </p>
      ))}
    </div>
  );
}

function SongStage({
  ended,
  media,
  onExpand,
  onPlaybackStateChange,
  onTogglePause,
  paused,
  playbackTimeRef,
  revealAnswers,
  song,
}) {
  const parsed = splitSongLabel(song);
  return (
    <section className={'l7-song-stage' + (media ? ' has-video' : '')} aria-label="Текущая песня">
      <button className="l7-expand" type="button" onClick={onExpand} aria-label="Развернуть на весь экран">
        <FigmaIcon file="expand.svg" />
      </button>
      {media ? (
        revealAnswers ? (
          <AnswerSheet media={media} song={song} />
        ) : (
          <KaraokeVideo
            media={media}
            onPlaybackStateChange={onPlaybackStateChange}
            paused={paused}
            playbackTimeRef={playbackTimeRef}
            song={song}
          />
        )
      ) : (
        <>
          <h2><span>{parsed.artist || LAYOUT7_SAMPLE_SONG.artist}</span><b>{parsed.title || LAYOUT7_SAMPLE_SONG.title}</b></h2>
          <Lyrics revealAnswers={revealAnswers} />
          {!revealAnswers ? (
            <div className="l7-answer-blanks" aria-hidden="true">
              <FigmaIcon file="blank-1.svg" />
              <FigmaIcon file="blank-2.svg" />
              <FigmaIcon file="blank-3.svg" />
            </div>
          ) : null}
        </>
      )}
      {!ended && (!media || !revealAnswers) ? (
        <button
          className="l7-media-toggle"
          type="button"
          onClick={onTogglePause}
          aria-label={paused ? 'Продолжить' : 'Пауза'}
        >
          {paused ? <FigmaIcon className="l7-stage-play" file="stage-play.svg" /> : <PauseIcon />}
        </button>
      ) : null}
    </section>
  );
}

function PackReadyStage({ pack }) {
  return (
    <section className="l7-pack-ready" aria-label={'Категория: ' + pack.shortTitle}>
      <img src={pack.coverImage || pack.image} alt="" width="960" height="960" />
      {!pack.coverHasTitle ? <h2>{pack.catalogTitle}</h2> : null}
      <span className="l7-visually-hidden">{pack.catalogTitle}</span>
    </section>
  );
}

function PrimaryGameActions({ onNewSong, onReveal, onStart, remaining, revealAnswers, started }) {
  if (!started) {
    return (
      <div className="l7-game-actions">
        <button className="l7-button l7-button--new-song" type="button" onClick={onStart}>
          <span>НАЧАТЬ ИГРУ</span>
          <small>осталось {remaining} {remaining === 1 ? 'песня' : remaining > 1 && remaining < 5 ? 'песни' : 'песен'}</small>
        </button>
      </div>
    );
  }

  return (
    <div className="l7-game-actions">
      <button className="l7-button l7-button--new-song" type="button" onClick={onNewSong}>
        <span>НОВАЯ ПЕСНЯ</span>
        <small>осталось {remaining} {remaining === 1 ? 'песня' : remaining > 1 && remaining < 5 ? 'песни' : 'песен'}</small>
      </button>
      <button
        className={'l7-button l7-button--answers' + (revealAnswers ? ' is-active' : '')}
        type="button"
        onClick={onReveal}
      >
        <span>{revealAnswers ? 'СКРЫТЬ ПРАВИЛЬНЫЕ СЛОВА' : 'ПОКАЗАТЬ ПРАВИЛЬНЫЕ СЛОВА'}</span>
      </button>
    </div>
  );
}

function GameControls({ onChoosePack, onNewGame, onSongList, songCount }) {
  return (
    <section className="l7-controls" aria-labelledby="l7-controls-title">
      <h2 id="l7-controls-title">УПРАВЛЕНИЕ <em>ИГРОЙ</em></h2>
      <div className="l7-control-card">
        <button type="button" onClick={onChoosePack}>
          <span className="l7-control-symbol" aria-hidden="true"><FigmaIcon file="control-category.svg" /></span>
          <span>Выбрать или купить другую категорию</span>
          <FigmaIcon className="l7-row-chevron" file="chevron-right.svg" />
        </button>
        <FigmaIcon className="l7-row-divider" file="divider.svg" />
        <button type="button" onClick={onSongList}>
          <strong>{songCount}</strong>
          <span>Список песен</span>
          <FigmaIcon className="l7-row-chevron" file="chevron-right.svg" />
        </button>
        <FigmaIcon className="l7-row-divider" file="divider.svg" />
        <button type="button" onClick={onNewGame}>
          <span className="l7-control-play" aria-hidden="true"><FigmaIcon file="play.svg" /></span>
          <span>Новая игра</span>
          <FigmaIcon className="l7-row-chevron" file="chevron-right.svg" />
        </button>
      </div>
    </section>
  );
}

function GameTips() {
  return (
    <section className="l7-tips" aria-labelledby="l7-tips-title">
      <h2 id="l7-tips-title">СОВЕТЫ</h2>
      <div className="l7-tip-cards">
      <article>
        <span className="l7-tip-icon" aria-hidden="true"><FigmaIcon file="tip-open.svg" /></span>
        <div><h3>ОТКРОЙТЕ ИГРУ</h3><p>Откройте окно с игрой, в которой рандомно будут приходить песни.</p></div>
      </article>
      <article className="is-orange">
        <span className="l7-tip-icon" aria-hidden="true"><FigmaIcon file="tip-connect.svg" /></span>
        <div><h3>ПОДКЛЮЧИТЕ УСТРОЙСТВО</h3><p>Не забудьте подключить телефон или ноутбук к колонке.</p></div>
      </article>
      <article>
        <span className="l7-tip-icon" aria-hidden="true"><FigmaIcon file="tip-sing.svg" /></span>
        <div><h3>ПОЙТЕ ВМЕСТЕ</h3><p>Включайте песни, зачеркивайте поля и подпевайте!</p></div>
      </article>
      </div>
    </section>
  );
}

function CollectionSelector({ onClick }) {
  return (
    <button className="l7-selector" type="button" onClick={onClick}>
      <span>ВЫБРАТЬ КАТЕГОРИЮ</span>
      <span className="l7-selector-icon"><FigmaIcon file="selector.svg" /></span>
    </button>
  );
}

function GamePage({
  gameStarted,
  media,
  onChoosePack,
  onExpand,
  onNewGame,
  onNewSong,
  onPlaybackStateChange,
  onSongList,
  onStart,
  onToggleAnswers,
  onTogglePause,
  pack,
  paused,
  playbackTimeRef,
  remaining,
  revealAnswers,
  song,
}) {
  return (
    <div className="l7-game">
      <CollectionSelector onClick={onChoosePack} />
      <div className="l7-game-core">
      {gameStarted ? (
        <SongStage
          ended={remaining === 0}
          media={media}
          onExpand={onExpand}
          onPlaybackStateChange={onPlaybackStateChange}
          onTogglePause={onTogglePause}
          paused={paused}
          playbackTimeRef={playbackTimeRef}
          revealAnswers={revealAnswers}
          song={song}
        />
      ) : <PackReadyStage pack={pack} />}
      <PrimaryGameActions
        onNewSong={onNewSong}
        onReveal={onToggleAnswers}
        onStart={onStart}
        remaining={remaining}
        revealAnswers={revealAnswers}
        started={gameStarted}
      />
      </div>
      <GameControls
        onChoosePack={onChoosePack}
        onNewGame={onNewGame}
        onSongList={onSongList}
        songCount={pack.songs.length}
      />
      <GameTips />
    </div>
  );
}

function CorrectWordsModal({ media, onClose, song }) {
  const parsed = song
    ? splitSongLabel(song)
    : { artist: LAYOUT7_SAMPLE_SONG.artist, title: LAYOUT7_SAMPLE_SONG.title };
  return (
    <ModalLayer onClose={onClose} variant="l7-words-modal-layer">
      <section className={'l7-words-modal' + (media ? ' has-poster' : '')} role="dialog" aria-modal="true" aria-labelledby="l7-words-title">
        <button className="l7-modal-close" type="button" onClick={onClose} aria-label="Закрыть">
          <CloseIcon />
        </button>
        {media ? (
          <AnswerSheet className="is-modal" media={media} song={song} />
        ) : (
          <>
            <h2 id="l7-words-title"><span>{parsed.artist}</span><b>{parsed.title}</b></h2>
            <Lyrics compact />
            <div className="l7-modal-underlines" aria-hidden="true">
              <FigmaIcon file="underline-1.svg" />
              <FigmaIcon file="underline-2.svg" />
              <FigmaIcon file="underline-3.svg" />
            </div>
          </>
        )}
        {media ? <span id="l7-words-title" className="l7-visually-hidden">{song}</span> : null}
      </section>
    </ModalLayer>
  );
}

function SongListPage({ onOpenSong, onReturn, pack }) {
  return (
    <div className="l7-song-list">
      <h1>СПИСОК ПЕСЕН</h1>
      <ol>
        {pack.songs.map((song, index) => (
          <li key={song}>
            <button type="button" onClick={() => onOpenSong({ index, song })}>
              <strong>{index + 1}</strong>
              <span>{song.replace(' — ', ' - ')}</span>
              <FigmaIcon className="l7-row-chevron" file="chevron-right.svg" />
            </button>
          </li>
        ))}
      </ol>
      <button className="l7-button l7-button--return" type="button" onClick={onReturn}><span>ВЕРНУТЬСЯ В ИГРУ</span></button>
    </div>
  );
}

function FullscreenGame({
  answers,
  ended,
  landscape,
  media,
  onExit,
  onNewSong,
  onPlaybackStateChange,
  onTogglePause,
  paused,
  playbackTimeRef,
  remaining,
  song,
}) {
  const parsed = splitSongLabel(song);
  return (
    <div className={'l7-fullscreen ' + (landscape ? 'is-landscape' : 'is-portrait')}>
      <button className="l7-fullscreen-exit" type="button" onClick={onExit} aria-label="Выйти из полноэкранного режима">
        <FigmaIcon file="fullscreen-exit.svg" />
      </button>
      {media ? (
        answers ? (
          <AnswerSheet className="is-fullscreen" media={media} song={song} />
        ) : (
          <KaraokeVideo
            landscape={landscape}
            media={media}
            onPlaybackStateChange={onPlaybackStateChange}
            paused={paused}
            playbackTimeRef={playbackTimeRef}
            song={song}
          />
        )
      ) : (
        <div className="l7-fullscreen-copy">
          <h1><span>{parsed.artist || LAYOUT7_SAMPLE_SONG.artist}</span><b>{parsed.title || LAYOUT7_SAMPLE_SONG.title}</b></h1>
          <Lyrics compact={landscape} />
          {!answers ? (
            <div className="l7-fullscreen-blanks" aria-hidden="true">
              <FigmaIcon file="fullscreen-blank-1.svg" />
              <FigmaIcon file="fullscreen-blank-2.svg" />
              <FigmaIcon file="fullscreen-blank-3.svg" />
            </div>
          ) : (
            <div className="l7-fullscreen-underlines" aria-hidden="true">
              <FigmaIcon file="underline-1.svg" />
              <FigmaIcon file="underline-2.svg" />
              <FigmaIcon file="underline-3.svg" />
            </div>
          )}
        </div>
      )}
      {!ended && (!media || !answers) ? (
        <button
          className="l7-media-toggle"
          type="button"
          onClick={onTogglePause}
          aria-label={paused ? 'Продолжить' : 'Пауза'}
        >
          {paused ? <FigmaIcon className="l7-stage-play" file="stage-play.svg" /> : <PauseIcon />}
        </button>
      ) : null}
      <button className="l7-fullscreen-new" type="button" onClick={onNewSong}>
        <span>НОВАЯ ПЕСНЯ</span>
        <small>осталось {remaining} песен</small>
      </button>
    </div>
  );
}

function requestBrowserFullscreen() {
  const root = document.documentElement;
  if (document.fullscreenElement || typeof root.requestFullscreen !== 'function') return;
  root.requestFullscreen().catch(() => {});
}

function exitBrowserFullscreen() {
  if (!document.fullscreenElement || typeof document.exitFullscreen !== 'function') return;
  document.exitFullscreen().catch(() => {});
}

export function Layout7Routes({
  route,
  goTo,
  Nav,
  Footer,
  Coin,
  balance,
  isLoggedIn,
  profileName,
  purchasedCategories = [],
  purchaseBusy = false,
  purchaseError = '',
  onPurchaseGameEntitlement,
  onOpenGameEntitlementTopUp,
}) {
  const [packId, setPackId] = useState(readStoredPack);
  const [songIndex, setSongIndex] = useState(() => readStoredNumber(SONG_INDEX_STORAGE_KEY, 0, 11));
  const [remaining, setRemaining] = useState(() => readStoredNumber(REMAINING_STORAGE_KEY, 12, 12));
  const [startedPackId, setStartedPackId] = useState('');
  const [paused, setPaused] = useState(false);
  const [revealAnswers, setRevealAnswers] = useState(false);
  const [infoPack, setInfoPack] = useState(null);
  const [purchasePack, setPurchasePack] = useState(null);
  const [openedSong, setOpenedSong] = useState(null);
  const playbackTimeRef = useRef(0);
  const requestedPack = LAYOUT7_PACK_BY_ID[packId] || LAYOUT7_PACKS[0];
  const firstOwnedPack = useMemo(
    () => LAYOUT7_ALL_PACKS.find(item => ownsLayout7Pack(item, purchasedCategories)) || null,
    [purchasedCategories],
  );
  const routeNeedsOwnedPack = route !== LAYOUT7_ROUTE.catalog;
  const pack = routeNeedsOwnedPack
    && !ownsLayout7Pack(requestedPack, purchasedCategories)
    && firstOwnedPack
    ? firstOwnedPack
    : requestedPack;
  const accessBlocked = routeNeedsOwnedPack && !ownsLayout7Pack(pack, purchasedCategories);
  const activeRoute = accessBlocked ? LAYOUT7_ROUTE.catalog : route;
  const gameStarted = startedPackId === pack.id;
  const requestedFullscreen = isLayout7FullscreenRoute(activeRoute);
  const renderRoute = requestedFullscreen && !gameStarted ? LAYOUT7_ROUTE.game : activeRoute;
  const isFullscreen = isLayout7FullscreenRoute(renderRoute);
  const landscape = isFullscreen && activeRoute.includes('-landscape-');
  const fullscreenAnswers = isFullscreen && activeRoute.endsWith('-answers');

  useEffect(() => {
    if (routeNeedsOwnedPack && firstOwnedPack && packId !== pack.id) setPackId(pack.id);
  }, [firstOwnedPack, pack.id, packId, routeNeedsOwnedPack]);

  useEffect(() => {
    if (!accessBlocked) return;
    goTo(LAYOUT7_ROUTE.catalog, { replace: true });
  }, [accessBlocked, goTo]);

  useEffect(() => {
    if (!requestedFullscreen || gameStarted) return;
    exitBrowserFullscreen();
    goTo(LAYOUT7_ROUTE.game, { replace: true });
  }, [gameStarted, goTo, requestedFullscreen]);

  useEffect(() => {
    window.localStorage.setItem(PACK_STORAGE_KEY, pack.id);
  }, [pack.id]);

  useEffect(() => {
    window.localStorage.setItem(SONG_INDEX_STORAGE_KEY, String(songIndex));
    window.localStorage.setItem(REMAINING_STORAGE_KEY, String(remaining));
  }, [remaining, songIndex]);

  useEffect(() => {
    setInfoPack(null);
    setPurchasePack(null);
    setOpenedSong(null);
  }, [route]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    return () => window.cancelAnimationFrame(frame);
  }, [infoPack, openedSong, purchasePack]);

  const openModalAtTop = setter => value => {
    setter(value);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const resetGame = (nextPack = pack) => {
    playbackTimeRef.current = 0;
    setPackId(nextPack.id);
    setSongIndex(0);
    setRemaining(nextPack.songs.length);
    setStartedPackId('');
    setPaused(false);
    setRevealAnswers(false);
  };

  const startPack = nextPack => {
    resetGame(nextPack);
    goTo(LAYOUT7_ROUTE.game);
  };

  const selectPack = nextPack => {
    if (ownsLayout7Pack(nextPack, purchasedCategories)) {
      startPack(nextPack);
      return;
    }
    openModalAtTop(setPurchasePack)(nextPack);
  };

  const confirmPurchase = async () => {
    if (!purchasePack || purchaseBusy) return;
    if (!isLoggedIn) {
      await onPurchaseGameEntitlement?.(purchasePack.entitlementId);
      return;
    }
    if (balance < purchasePack.price) {
      onOpenGameEntitlementTopUp?.(purchasePack.entitlementId);
      return;
    }
    const boughtPack = purchasePack;
    const result = await onPurchaseGameEntitlement?.(boughtPack.entitlementId);
    if (result) {
      setPurchasePack(null);
      startPack(boughtPack);
    }
  };

  const nextSong = () => {
    playbackTimeRef.current = 0;
    setSongIndex(current => (current + 1) % pack.songs.length);
    setRemaining(current => Math.max(0, current - 1));
    setRevealAnswers(false);
    setPaused(false);
  };

  const beginGame = () => {
    playbackTimeRef.current = 0;
    setRevealAnswers(false);
    setPaused(false);
    setStartedPackId(pack.id);
  };

  const openFullscreen = () => {
    const orientation = window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
    requestBrowserFullscreen();
    goTo(orientation === 'landscape'
      ? revealAnswers ? LAYOUT7_ROUTE.fullscreenLandscapeAnswers : LAYOUT7_ROUTE.fullscreenLandscapeHidden
      : revealAnswers ? LAYOUT7_ROUTE.fullscreenPortraitAnswers : LAYOUT7_ROUTE.fullscreenPortraitHidden);
  };

  const closeFullscreen = () => {
    exitBrowserFullscreen();
    setRevealAnswers(fullscreenAnswers);
    goTo(LAYOUT7_ROUTE.game, { replace: true });
  };

  const showSongList = renderRoute === LAYOUT7_ROUTE.songList || renderRoute === LAYOUT7_ROUTE.legacySongList;
  const activeSong = pack.songs[songIndex % pack.songs.length];
  const activeMedia = useResolvedSongMedia(gameStarted ? getLayout7SongMedia(pack, songIndex) : null);
  const openedMedia = useResolvedSongMedia(openedSong
    ? getLayout7SongMedia(pack, openedSong.index)
    : null);
  const pageClass = 'page l7-page'
    + (renderRoute === LAYOUT7_ROUTE.catalog ? ' l7-page--catalog' : '')
    + (renderRoute === LAYOUT7_ROUTE.game ? ' l7-page--game' : '')
    + (showSongList ? ' l7-page--song-list' : '')
    + (isFullscreen ? ' l7-page--fullscreen ' + (landscape ? 'is-landscape' : 'is-portrait') : '')
    + (infoPack || openedSong ? ' l7-page--modal' : '');

  if (isFullscreen) {
    return (
      <main className={pageClass} data-layout="7">
        <FullscreenGame
          answers={fullscreenAnswers}
          ended={remaining === 0}
          landscape={landscape}
          media={activeMedia}
          onExit={closeFullscreen}
          onNewSong={() => {
            nextSong();
            goTo(landscape
              ? LAYOUT7_ROUTE.fullscreenLandscapeHidden
              : LAYOUT7_ROUTE.fullscreenPortraitHidden,
            { replace: true });
          }}
          onPlaybackStateChange={setPaused}
          onTogglePause={() => setPaused(value => !value)}
          paused={paused}
          playbackTimeRef={playbackTimeRef}
          remaining={remaining}
          song={activeSong}
        />
      </main>
    );
  }

  return (
    <main className={pageClass} data-layout="7">
      <Layout7Nav
        Nav={Nav}
        backRoute={renderRoute === LAYOUT7_ROUTE.catalog ? 'karaoke-battle' : LAYOUT7_ROUTE.catalog}
        balance={balance}
        goTo={goTo}
        isLoggedIn={isLoggedIn}
        profileName={profileName}
      />
      {renderRoute === LAYOUT7_ROUTE.catalog ? (
        <CatalogPage
          Coin={Coin}
          balance={balance}
          isLoggedIn={isLoggedIn}
          onInfo={openModalAtTop(setInfoPack)}
          onSelect={selectPack}
          purchasedCategories={purchasedCategories}
        />
      ) : showSongList ? (
        <SongListPage
          onOpenSong={openModalAtTop(setOpenedSong)}
          onReturn={() => goTo(LAYOUT7_ROUTE.game)}
          pack={pack}
        />
      ) : (
        <GamePage
          gameStarted={gameStarted}
          media={activeMedia}
          onChoosePack={() => goTo(LAYOUT7_ROUTE.catalog)}
          onExpand={openFullscreen}
          onNewGame={() => resetGame()}
          onNewSong={nextSong}
          onPlaybackStateChange={setPaused}
          onSongList={() => goTo(LAYOUT7_ROUTE.songList)}
          onStart={beginGame}
          onToggleAnswers={() => {
            if (!revealAnswers) setPaused(true);
            setRevealAnswers(value => !value);
          }}
          onTogglePause={() => setPaused(value => !value)}
          pack={pack}
          paused={paused}
          playbackTimeRef={playbackTimeRef}
          remaining={remaining}
          revealAnswers={revealAnswers}
          song={activeSong}
        />
      )}
      {renderRoute !== LAYOUT7_ROUTE.game ? <Footer dark /> : null}
      {infoPack ? <PackInfoModal pack={infoPack} onClose={() => setInfoPack(null)} /> : null}
      {purchasePack ? (
        <PurchaseModal
          Coin={Coin}
          busy={purchaseBusy}
          error={purchaseError}
          onCancel={() => setPurchasePack(null)}
          onConfirm={confirmPurchase}
          pack={purchasePack}
        />
      ) : null}
      {openedSong ? (
        <CorrectWordsModal
          media={openedMedia}
          song={openedSong.song}
          onClose={() => setOpenedSong(null)}
        />
      ) : null}
    </main>
  );
}
