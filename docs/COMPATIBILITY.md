# Совместимость с Rocket.Chat

Пользовательский скрипт рассчитан на стандартный веб-клиент Rocket.Chat и запускается только после того, как на странице обнаружены его composer и глобальное соединение `Meteor`. На любой другой HTTPS-странице скрипт остаётся пассивным.

## Локальная Docker-проверка

Нужны Docker Compose v2, Node.js 22 и установленные браузеры Playwright:

```bash
npm ci
npx playwright install chromium
npm run build
npm run test:compat
```

Команда последовательно проверяет изолированные стенды:

| Rocket.Chat | MongoDB  | Статус  |
| ----------- | -------- | ------- |
| `8.6.1`     | `8.0.0`  | current |
| `8.5.2`     | `8.0.0`  | LTS     |
| `7.10.14`   | `6.0.26` | LTS     |

Версии MongoDB закреплены до patch-релиза намеренно: это делает запуск воспроизводимым и избегает плавающих тегов. Rocket.Chat рекомендует фиксированные image tags, а разные major-линии требуют разные версии MongoDB; нельзя переиспользовать volume между строками матрицы.

Скрипт создаёт временный Compose-файл и случайные project names, поднимает MongoDB как replica set, создаёт локального администратора, входит через API, открывает `general` в Chromium, внедряет собранный userscript, проверяет вставку callout в composer и доставку реального attachment-сообщения через REST. После каждой строки контейнеры и volumes удаляются. Пароли и токены не печатаются.

Для одной строки можно ограничить запуск:

```bash
RCMP_COMPAT_VERSION=8.5.2 npm run test:compat
```

Если нужно оставить стенд для ручного осмотра, задайте `RCMP_COMPAT_KEEP=1`; удаление тогда выполните вручную по project name из вывода Docker.

## Границы гарантии

Проверяются только перечисленные current/LTS-версии и стандартный Rocket.Chat web client. Форки, кастомные composer-реализации и версии, где убраны оба метода `Meteor.connection.applyAsync`/`apply` или `/api/v1/chat.sendMessage`, требуют отдельного адаптера.

См. также официальные [сроки поддержки Rocket.Chat](https://docs.rocket.chat/docs/version-durability), [таблицу версий MongoDB](https://docs.rocket.chat/v1/docs/support-prerequisites) и [Docker deployment guide](https://docs.rocket.chat/docs/deploy-with-docker-docker-compose).
