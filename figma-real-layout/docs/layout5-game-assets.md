# Layout 5: game-screen asset map

Source: Figma file `NmfaT51h6CRHORDnbvqtcA` (`Верстка 5`). The names below are the keys in `src/games/layout56/screen-assets5.json`; all paths currently resolve below `public/generated/layout5/screens/`.

## Reference frames

| State | Figma node | Natural size | Local reference |
| --- | --- | ---: | --- |
| Song playing | `1:539` | 1080×3581 | `reference/layout5/game.png` |
| Paused | `1:572` | 1080×3581 | `reference/layout5/pause.png` |
| Song ended | `1:606` | 1080×3581 | `reference/layout5/ended.png` |
| Correct answers | `1:638` | 1080×3581 | `reference/layout5/answers.png` |
| No category selected | `1:5010` | 960×958 | `reference/layout5/empty.png` |
| Hits category cover | `1:1980` | 1080×3857 | `reference/layout5/cover.png` |
| Two song-card examples | `1:3829` | 2089×2147 | `reference/layout5/songs.png` |

The four 1080-wide game states share the same main column: `left: 60px`, `top: 107px`, `width: 960px`, vertical gap `80px`. The song card is `960×960`, radius `80px`. Its background is not an image: it is the dark centered radial gradient shown in each context (`#311800` → `#24170b` → `#161616`).

## Header and category selector

| Manifest key | Intrinsic size | Content / rendering |
| --- | ---: | --- |
| `game.imgIconsOutlineChevronLeft` | 24×24 SVG | Back chevron inside the header's separate 64×64 `#e5e5e5` circle. Same physical asset is reused in all states. |
| `game.imgAdobeExpressFile103` | 2048×2048 PNG | Coin source image. Figma crops it into a roughly 70×67 box at `269.47% × 279.23%`, `top: -40.3%`. Prefer the project's existing coin component if it already matches this crop. |
| `game.imgLettersCoinsLettersVariant34` | 82×82 SVG | Orange-to-red avatar circle only. The white `Т` is semantic text over it, 48.188px Hoves Bold. Pause/answers/ended/cover variants differ only by SVG definition IDs and are visually identical. |
| `game.imgGroup2087331486` | 64×64 SVG | Category dropdown: dark circle, white downward chevron. Rendered at 64×64 at the right of the 128px-high, 5px-bordered selector. |

## Song-card geometry and controls

Shared card typography and coordinates are relative to the 960×960 card:

- Artist: `(79,124)`, TT Trailers Bold 96px/1, orange `#ff8b1e`.
- Title: `(79,222)`, TT Trailers Bold 96px/1, paper `#f3f3f3`.
- Lyrics: `(79,347)`, width 802px, TT Hoves Pro Variable DemiBold 34.079px, line-height 1.41, paper `#f3f3f3`.
- Control circle: `(761,759.31)`, 156×156 when present.
- Expand icon: 56×56 at `y:89`; exact `x` varies by Figma state (`821` playing, `811` paused, `831` answers, `839` ended).

| Manifest key | Intrinsic size | Content / rendering |
| --- | ---: | --- |
| `game.imgProperty1Pause` | 156×156 PNG | Exact export of active Pause instance `1:550`: dark `#3f3f3f` circle with two paper bars. Apply `border-radius: 50%` to clip the exported square's `#f3f3f3` corners. This key was added explicitly because design-context code expanded the control into CSS shapes. |
| `pause.imgProperty1Play` | 156×156 SVG | Orange `#ff8b1e` circle with paper play triangle. Use only in paused state. `songs.imgFrame6461` is the same visual with different internal SVG IDs. |
| `game.imgFrame2087325369` | 56×56 SVG | Gray `#b4b4b4` expand/open-in-new icon. Pause/answers/ended/songs keys are visually identical, differing only by clip-path IDs. |

State behavior from the source frames:

| State | Large control | Answer blanks | Correct-answer button |
| --- | --- | --- | --- |
| Playing (`1:539`) | Pause (`game.imgProperty1Pause`) | Peach boxes | Disabled gray, `ПОКАЗАТЬ ПРАВИЛЬНЫЕ СЛОВА` |
| Paused (`1:572`) | Play (`pause.imgProperty1Play`) | Peach boxes | Disabled gray, same label |
| Ended (`1:606`) | No control | Peach boxes | Enabled orange, `ПОКАЗАТЬ ПРАВИЛЬНЫЕ СЛОВА` |
| Answers (`1:638`) | No control | Orange words + bare orange underlines | Enabled orange, `СКРЫТЬ ПРАВИЛЬНЫЕ СЛОВА` |

The disabled answer button is `#e6e6e6` with `#929292` text. The enabled answer button is `#ff8b1e`. The always-available `НОВАЯ ПЕСНЯ` button is `#fe391f`, with a `#b01c08` counter pill.

## Missing-word assets

### “Дискотека Авария — Если хочешь остаться”

Correct words: `не слышишь`, `сны`, `просто так`.

Hidden boxes, relative to the card:

| Key | Size | Position | Visual |
| --- | ---: | ---: | --- |
| `game.imgGroup2087331500` | 216×49 SVG | `(643,387)` | `#ffdebf` rounded box, two orange baseline segments |
| `game.imgGroup2087331501` | 71.0107×49 SVG | `(441,529)` | `#ffdebf` rounded box, one orange baseline |
| `game.imgGroup2087331502` | 190×49 SVG | `(656,628)` | `#ffdebf` rounded box, two orange baseline segments |

The same hidden visuals are available as `pause.*`, `ended.*`, and `songs.imgGroup2087331500/1501/1502`.

Revealed underlines:

| Key | Size | Notes |
| --- | ---: | --- |
| `answers.imgGroup2087331500` | 216×49 SVG | Transparent box area; retains the two orange baseline segments. |
| `answers.imgGroup2087331501` | 71.0107×49 SVG | Transparent box area; retains one orange baseline. |
| `answers.imgGroup2087331502` | 190×49 SVG | Transparent box area; retains the two orange baseline segments. |

The answer words themselves are semantic orange text (`#ff8b1e`) in the lyrics, not baked into these SVGs. `songs.imgGroup2087331509/1510/1511` are byte-identical visuals to the three `answers.*` underlines.

### “Корни — Ты узнаешь её”

Correct words: `высечен`, `глазам`, `гладиолуса`.

| Hidden key | Size | Card-relative position | Revealed key | Line size |
| --- | ---: | ---: | --- | ---: |
| `songs.imgGroup2087331503` | 153×49 SVG | `(401,483)` | `songs.imgGroup2087331506` | 141×4 SVG |
| `songs.imgGroup2087331504` | 126×49 SVG | `(316,627)` | `songs.imgGroup2087331507` | 113×4 SVG |
| `songs.imgGroup2087331505` | 195×49 SVG | `(269,723)` | `songs.imgGroup2087331508` | 183×4 SVG |

All hidden variants are peach `#ffdebf` rounded boxes with 4px orange underlines; all revealed variants contain only the 4px orange underline.

## Empty-category placeholder

Wrapper: 960×958, radius 80px, white background, `overflow: hidden`.

| Manifest key | Source size | Exact placement in wrapper | Content |
| --- | ---: | ---: | --- |
| `empty.imgFef5212522D3979C5D1D89D95B14975E2D8E6142Bc9D4479822FEd621241B7D61` | 2304×1856 PNG | `left:-151; top:-58; width:1262; height:1016` | Karaoke-room group photo (rear layer). |
| `empty.imgFirefly11111` | 2319×2517 PNG | `left:-219; top:-351; width:1330; height:1443` | Orange piano/music-note render (front layer). |

Text stays semantic above both images:

- `ВЫБЕРИТЕ КАТЕГОРИЮ`: right-aligned box from `x=152` to `889`, `top=578`, width 737; TT Trailers Bold 164.765px, line-height .88, `#f3f3f3`.
- `Чтобы играть или оплатить`: right-aligned box `x=394..889`, `top=865`, width 495; TT Hoves Medium 32px, line-height 1.1, white.

## Category cover

Use `cover.artwork` (`/generated/layout5/screens/8c4c854f5842fabfb436.png`) directly. It is the exact 960×960 export of Figma mask group `1:1989`, including the rounded crop, photo composition, neon lettering, and red arcs. The other `cover.imgCb…`, `cover.imgGroup2087331427`, and `cover.imgGroup2087331422` assets are only needed if the composition must be rebuilt layer-by-layer.

The cover has no song-card controls. Immediately below it is the red start button (`НАЧАТЬ ИГРУ`) and `осталось 10 песен` pill.

## Management and tips assets

These are common across playing, pause, ended, answers, and cover pages:

| Key | Intrinsic size | Content / rendered use |
| --- | ---: | --- |
| `game.imgGroup1` | 40.9989×46.2847 SVG | Orange microphone, rendered in the first 48px management slot. |
| `game.imgProperty1Selebration` | 105.005×105.003 SVG | Orange party-popper, rendered down at 48×48 for “Объявить победителя”. |
| `game.imgIconsFillPlay` | 48×48 SVG | White play glyph inside a separately rendered 48×48 orange circle for “Новая игра”. |
| `game.imgIconsOutlineChevronRight` | 48×48 SVG | Orange right chevron at the end of each management row. |
| `game.imgVector192` | 867×3 SVG | Gray row separator. |
| `game.imgGroup2087331618` | 75.0837×98.5714 SVG | Orange music/list icon in the first tilted advice card. |
| `game.img98` | 84.4089×84.2612 SVG | White chain-link icon in the orange advice card. |
| `game.imgGroup` | 88.6454×88.6432 SVG | Orange music-note icon in the last tilted advice card. |

`cover.imgGroup`, `cover.imgVector*` are footer-logo fragments from the Figma context. They are not needed when the project-level `Footer` component is reused.

## Integrity notes

- Manifest references after adding the Pause export: 106.
- Missing local files: 0.
- Many state-specific SVGs are visually identical but have different internal IDs. The manifest intentionally namespaces them by state to avoid Figma constant-name collisions.
- No audio/media asset exists in these Layout 5 screen frames. The visual states can and should be implemented without introducing playback from the older music-loto game.
