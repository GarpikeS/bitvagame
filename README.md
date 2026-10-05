# Битва Игры / BitvaGame

Веб-приложение для игр в компании: музыкальное лото, караоке-битва,
личный кабинет, покупки и баланс монет. Страница мафии ведёт в отдельное
приложение. Рабочий код находится в [`figma-real-layout/`](figma-real-layout/).

Production: [bitvagame.ru](https://bitvagame.ru/). Репозиторий — исходники
и документация; локальный коммит не означает выкладку на сайт.

## Быстрый старт

Проверенное локальное окружение: Node.js **24.14.1**, npm и Git.
Пакеты зафиксированы в `package-lock.json`; используйте `npm ci`.

```powershell
cd .\figma-real-layout
npm ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm run dev
```

Открыть [localhost:5173](http://127.0.0.1:5173/). API по умолчанию слушает
`127.0.0.1:8787`; Vite проксирует `/api`. Если `.env` меняет порт, нужно
согласовать `API_PROXY_TARGET` с `PORT`.

В `.env` задайте собственные `AUTH_SECRET` и `PROMO_ADMIN_TOKEN` вместо заглушек.
Не подключайте production-хранилище к локальным тестам. Без SMTP/Resend отправка
кодов не работает: API не имитирует успешное письмо. Платежи требуют серверной
конфигурации провайдера. Секреты в Git не включаются.

## Проверки

Из корня репозитория:

```powershell
node tools/repository-check.cjs
```

Из `figma-real-layout/`:

```powershell
npm run test:api
npm run build
```

Для production-сборки явно задайте `NODE_ENV=production` в среде сборки.
Локальный `.env.example` содержит `NODE_ENV=development` для разработки:
его копия может включить development-вариант React даже при `vite build`.
`VITE_ENABLE_CLOSED_GAMES=true` — отдельный preview-флаг закрытых игр;
не включать его в публичный релиз без согласования. CI собирает production
с этим флагом `false`. Значения Vite фиксируются при сборке, не при запуске API.

Браузерные проверки запускаются отдельно при работающем локальном сайте:

```powershell
npm run qa:home-header
npm run qa:layout7
npm run qa:karaoke-media
node scripts/qa-favorites-title.cjs
```

Последняя команда по умолчанию проверяет `127.0.0.1:4173`: сначала запустите
`npm run preview -- --port 4173 --strictPort`. Адреса тестов и ограничения —
[TESTING.md](docs/TESTING.md). Некоторые исторические скрипты используют
production по умолчанию: не запускать их вслепую. Видео требует внешнего хранилища.

## Структура

```text
.
├── README.md                 # Навигация и запуск
├── PROJECT_PASSPORT.md       # Паспорт проекта и границы передачи
├── CHANGELOG.md              # Новая история без задних дат
├── CONTRIBUTING.md           # Правила изменений и коммитов
├── SECURITY.md               # Секреты, данные и проверки
├── RIGHTS.md                 # Происхождение кода и материалов
├── docs/                     # Архитектура, QA, эксплуатация, Git
├── tools/                    # Проверка и SHA-256 манифест
├── .github/workflows/        # CI без production-деплоя
└── figma-real-layout/
    ├── src/                  # React UI и игровые модули
    ├── server/               # Fastify API, сервисы, тесты
    ├── public/               # Изображения, каталоги, PDF
    ├── reference/            # Figma, включая build-time imports
    ├── scripts/              # QA, импорт, ручной деплой
    ├── docs/                 # Документация доработок
    └── package-lock.json     # Зафиксированные зависимости
```

Старые реализации и серверные снимки сохранены на диске, но исключены из Git.
Приложение и необходимые ассеты не перемещались. [Подробнее](docs/STRUCTURE.md).

## Документация

- [Паспорт проекта](PROJECT_PASSPORT.md)
- [Архитектура](docs/ARCHITECTURE.md)
- [Тестирование](docs/TESTING.md)
- [Релизы и эксплуатация](docs/OPERATIONS.md)
- [Git и сохранение свидетельств разработки](docs/GIT_AND_EVIDENCE.md)
- [Проверка начального Git snapshot](docs/REPOSITORY_BASELINE.md)
- [Обновление безопасности и проверка публикации](docs/SECURITY_UPDATE_20261006.md)
- [Авторизация](figma-real-layout/AUTH_BACKEND.md)
- [Почта и оплата](figma-real-layout/REAL_EMAIL_AND_PAYMENT.md)
- [Промокоды](figma-real-layout/PROMOCODES.md)
- [Отчёт QA от 02.10.2026](figma-real-layout/docs/production-qa-20261002.md)

Старые интеграционные документы описывают момент их составления; код и свежий
health-check важнее прежних формулировок «ещё не настроено».

## Доступ и права

Публичный репозиторий: [GarpikeS/bitvagame](https://github.com/GarpikeS/bitvagame).
Пользователь разрешил публикацию кода и материалов и подтвердил право
на их публичное размещение. Секреты, аккаунты и служебные снимки рабочей среды
не публикуются. Open-source лицензия не назначена: доступность исходников
не означает разрешение на любое их использование. Git не устанавливает правообладателя.
Подробнее — [RIGHTS.md](RIGHTS.md).
