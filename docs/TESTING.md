# Проверки

Из корня: `node tools/repository-check.cjs`.
Из приложения: `npm ci`, `npm run test:api`, `npm run build`.
API-тесты используют временные fixtures, не production `.env`/данные.

## Браузерный QA

Playwright/Chrome проверяются при работающем сайте. Если нет бинарника,
выполнить `npx playwright install chromium`. На Windows запускать browser QA
последовательно; созданные browser/context закрывать в `finally`.

| Сценарий | Команда из папки приложения | Адрес |
| --- | --- | --- |
| Шапка | `npm run qa:home-header` | `HOME_HEADER_BASE_URL` |
| Карандаш | `npm run qa:profile-edit-icon` | `PROFILE_ICON_BASE_URL` |
| Лото | `npm run qa:music-attention` | См. скрипт |
| Караоке | `npm run qa:layout7` | `LAYOUT7_BASE_URL` |
| Видео | `npm run qa:karaoke-media` | `KARAOKE_MEDIA_BASE_URL` |
| Избранное | `node scripts/qa-favorites-title.cjs` | `QA_BASE_URL` |
| Общие страницы | `node scripts/qa-pravki2.cjs` | `BITVA_BASE_URL` |

Для проверки build в первом терминале:

```powershell
npm run preview -- --port 4173 --strictPort
```

Во втором:

```powershell
$env:QA_BASE_URL='http://127.0.0.1:4173'
node scripts/qa-favorites-title.cjs
```

Скрипт избранного мокирует API и не меняет настоящий аккаунт. Некоторые
исторические QA имеют production URL по умолчанию — сначала прочитать скрипт.
Видео требует внешнего хранилища. UI-моки не подтверждают реальную оплату/почту.

`artifacts/` и `qa/` игнорируются. В MD результатов указать дату, среду,
viewport, PASS/FAIL и ограничения. CI выполняет secret scan, repository gate,
чистую установку, dependency audit, API-тесты и build; не production-деплой.

## Подтверждённый запуск GitHub

06.10.2026 (Asia/Krasnoyarsk), исходники
`89f6b1b9c722bef084a8a4e9c6356bd6c0d458d3`:
[Source quality gate — PASS](https://github.com/GarpikeS/bitvagame/actions/runs/37360486252).
Оба задания `secrets` и `verify` завершились успешно; API — 18 тестов.
Это результат указанного коммита, не гарантия последующих изменений.
