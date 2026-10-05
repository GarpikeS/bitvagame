# Backend авторизации и почтовых кодов

## Что реализовано

Сайт больше не создаёт аккаунты в `localStorage` и не принимает общий код `111111`. Авторизация работает через Node.js/Fastify API:

- `POST /api/auth/register` — проверяет данные, сохраняет ожидающую регистрацию и отправляет код;
- `POST /api/auth/verify-code` — подтверждает регистрацию, вход по коду или восстановление;
- `POST /api/auth/login` — вход по email и паролю;
- `POST /api/auth/login-code` — отправка кода для входа без пароля;
- `POST /api/auth/forgot-password` — отправка кода восстановления;
- `POST /api/auth/reset-password` — однократная смена пароля после подтверждения кода;
- `POST /api/auth/logout` — отзыв текущей сессии;
- `GET /api/me` — проверка текущей серверной сессии;
- `GET /api/health` — состояние API и наличие почтовой конфигурации.

Коды живут 10 минут, имеют ограничение повторной отправки и числа попыток. Пароли хешируются `scrypt`; код, сессионный токен и токен восстановления сохраняются только как HMAC-хэши. Сессионная cookie имеет `HttpOnly`, `SameSite=Lax`, а в production также `Secure`.

## Локальный запуск

1. Скопировать `.env.example` в `.env`.
2. Заполнить `AUTH_SECRET`, `EMAIL_FROM`, `SMTP_USER` и `SMTP_PASSWORD`.
3. Запустить `npm run dev`.
4. Открыть `http://127.0.0.1:5173/`.

Команда `npm run dev` запускает API на `127.0.0.1:8787` и Vite на `127.0.0.1:5173`. Vite проксирует `/api` в Fastify.

Если ни SMTP, ни резервный Resend не настроены, API возвращает `EMAIL_NOT_CONFIGURED`. Фиктивный код пользователю не показывается и не принимается.

## Подключение реальной почты через Яндекс 360

1. Создать отдельный почтовый ящик в Яндекс 360 для бизнеса.
2. Проверить MX, единую SPF-запись и DKIM домена.
3. Создать для ящика пароль приложения типа «Почта» и разрешить доступ почтовых клиентов.
4. На сервере задать:

```env
NODE_ENV=production
HOST=127.0.0.1
PORT=8787
APP_ORIGIN=https://store.ceosivaev.ru
AUTH_SECRET=<случайная строка длиной 32+ символа>
AUTH_DATA_FILE=/var/lib/bitva-games/auth.json
EMAIL_FROM=Битва Игры <support@muzlotodoma.ru>
SMTP_HOST=smtp.yandex.ru
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=support@muzlotodoma.ru
SMTP_PASSWORD=<пароль приложения Яндекс Почты>
```

5. Собрать проект: `npm ci && npm run build`.
6. Запустить `npm start` через systemd или другой process manager.
7. В Nginx проксировать `/api/` на `http://127.0.0.1:8787/api/`, а frontend можно отдавать тем же Node-процессом либо текущим статическим Nginx.

Секреты нельзя передавать во frontend, добавлять с префиксом `VITE_` или коммитить в Git.

## Проверки

```bash
npm run test:api
npm run build
npm audit
```

Перед production-запуском проверить доставку минимум на Gmail, Яндекс, Mail.ru и корпоративный домен, а также статус SPF/DKIM и попадание писем в спам.
