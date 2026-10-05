# Обновление зависимостей и публичная публикация

Дата: 06.10.2026. Область: локальный код и GitHub, без production-деплоя.
Проверены серверная часть, зависимости и локальная production-сборка,
включая браузерные сценарии. Глобальная гарантия «ошибок/уязвимостей нет» не заявляется.

## Зависимости

| Пакет | До | После |
| --- | --- | --- |
| fastify | 5.11.2 | 5.12.5 |
| nodemailer | 9.0.5 | 10.0.15 |
| fast-uri | 3.1.5 / 4.1.2 | 3.1.8 / 4.2.1 |
| ip-address | 10.4.0 | 10.7.3 |
| brace-expansion | 5.0.9 | 5.0.12 |
| nanoid | 3.3.17 | 3.3.20 |

Нужные runtime-пакеты сохранены. Vite/React plugin используются при сборке,
поэтому перенесены в devDependencies, не удалены. React, React DOM,
Vite и plugin больше не используют `latest`; lockfile обновлён без `--force`.
При сборке нельзя устанавливать только production-зависимости:
`npm ci` → build → runtime install/prune при необходимости, не наоборот.

Обновление Nodemailer пересекает major-version: API-тесты и дополнительный
тест реального stream transport проверяют получателя, кириллицу в From/Subject,
challenge header и содержимое письма без настоящего SMTP или учётных данных.

Источники изменений: [Fastify releases](https://github.com/fastify/fastify/releases),
[Nodemailer releases](https://github.com/nodemailer/nodemailer/releases),
registry advisory response через [npm audit](https://docs.npmjs.com/cli/v11/commands/npm-audit/).

## Локальная проверка

| Проверка | Результат |
| --- | --- |
| Чистый `npm ci` по обновлённому lockfile | PASS |
| Полный `npm audit --audit-level=low` | 0 findings |
| `npm audit --omit=dev --audit-level=low` | 0 findings |
| `npm run test:api` | 18 PASS, 0 FAIL |
| TypeScript API / Vite production build | PASS |
| Шапка главной, 540px | PASS, отступ справа 10px, ошибок консоли нет |
| Избранное, 320/375/390/540/768/1280px | 12 PASS, текст/иконка/клики/overflow |
| Gitleaks 8.30.1, история до исходного security commit `74369a3` | 4 коммита, секреты не найдены |

Build: `NODE_ENV=production`, `VITE_ENABLE_CLOSED_GAMES=false`.
JS `index-zlhiN6sF.js` и CSS `index-BVEH4TdW.css` совпадают с ранее проверенной
чистой production-сборкой. Сохраняется предупреждение о JS chunk >500 kB.
Это задача оптимизации размера, не обнаруженная dependency vulnerability.

Preview-процесс на выделенном порту 5188 остановлен; созданные QA browser/context
закрыты. Пользовательские браузеры и другие серверы не останавливались.

## Публикация

Пользователь подтвердил права на публичное размещение материалов.
Репозиторий — [GarpikeS/bitvagame](https://github.com/GarpikeS/bitvagame).
Публикуются согласованная ветка и метки. `.env`, реальные аккаунты, секреты,
runtime store, QA-выгрузки и служебные снимки рабочей среды исключены.
Лицензия на свободное переиспользование не назначена: см. [RIGHTS.md](../RIGHTS.md).

CI проверяет историю на секреты, состав репозитория, установку, audit,
API-тесты и production build. Dependabot предлагает weekly-обновления
npm/Actions через PR, без автоматического merge или выкладки на сайт.
React и React DOM обновляются одной группой: CI отклонил отдельный React DOM
19.3.0 с React 19.2.7 из-за peer dependency conflict. Это предложение бота
не включено в `main`. Группировка применяется к version/security updates
по [правилам GitHub](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference#groups).
Исходники `74369a3780b69977ed2b80bb32f4131f7cc23110` и метка
`baseline-2026-10-06` опубликованы. Видимость GitHub проверена: PUBLIC.
[Первый Source quality gate](https://github.com/GarpikeS/bitvagame/actions/runs/37357576065)
завершился PASS: задания `secrets` и `verify`, включая audit, 18 API-тестов
и build. Этот результат относится к указанному коммиту; новые изменения
проверяются отдельными запусками CI.

Сайт в этой задаче не выкладывался. Реальный SMTP, платёжный провайдер,
TLS/DNS production, внешние медиапотоки и полный penetration/accessibility
audit в эти проверки не входят. Нулевой npm audit относится к известным
advisories registry на дату проверки, а не ко всем потенциальным дефектам.
