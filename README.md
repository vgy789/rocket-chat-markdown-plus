# Rocket.Chat Markdown+

Цветные блоки для предупреждений, заметок и статусов в веб-версии Rocket.Chat.

[**Установить скрипт**](https://raw.githubusercontent.com/vgy789/rocket-chat-markdown-plus/main/dist/rocket-chat-markdown-plus.user.js)
· [Синтаксис](./docs/SYNTAX.md) · [English](./README.en.md)

![Tampermonkey](https://img.shields.io/badge/Tampermonkey-Chromium%20%7C%20Firefox-00485B?logo=tampermonkey&logoColor=white)
[![CI](https://github.com/vgy789/rocket-chat-markdown-plus/actions/workflows/ci.yml/badge.svg)](https://github.com/vgy789/rocket-chat-markdown-plus/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

## Установка

1. Установите [Tampermonkey](https://www.tampermonkey.net/).
2. Нажмите [**«Установить скрипт»**](https://raw.githubusercontent.com/vgy789/rocket-chat-markdown-plus/main/dist/rocket-chat-markdown-plus.user.js) и подтвердите установку.
3. Обновите Rocket.Chat — рядом с редактором появится кнопка `::+`.

> Для Chromium 138+ включите «Разрешить пользовательские скрипты» в настройках Tampermonkey на странице расширений.

## Использование

Нажмите `::+` или напишите блок вручную:

```markdown
:::warning
title=Технические работы

Сервис будет недоступен **15 минут**.
:::
```

Текст вне `:::` останется обычным сообщением. Доступны типы `warning`, `info`, `success`, `error` и `note`. Кнопка `::+` открывает единую форму: выберите готовый стиль, при необходимости измените заголовок, цвет и дополнительные параметры, затем нажмите «Вставить». Все параметры описаны в [справке по синтаксису](./docs/SYNTAX.md).

Скрипт работает локально: без аналитики и внешнего сервера. Для сообщений с блоками он использует текущую сессию Rocket.Chat только непосредственно перед same-origin запросом и не ранит токен.

Версия 1.x поддерживает Chromium и Firefox с Tampermonkey и стандартный веб-клиент Rocket.Chat.
Скрипт запускается на HTTPS-сайтах, а также на `localhost` и `127.0.0.1`; на обычных страницах он остаётся неактивным и не читает данные сессии. E2EE-комнаты пока не поддерживаются.

Для проверки совместимости с реальными версиями Rocket.Chat используйте локальную Docker-матрицу: `npm run test:compat`. Закреплённые версии и требования к MongoDB описаны в [руководстве по совместимости](./docs/COMPATIBILITY.md).

[Конфиденциальность](./.github/PRIVACY.md) · [Безопасность](./.github/SECURITY.md) ·
[Разработка](./CONTRIBUTING.md) · [Сообщить об ошибке](https://github.com/vgy789/rocket-chat-markdown-plus/issues)

> [!IMPORTANT]
> Независимый проект, не связанный с Rocket.Chat.

[MIT](./LICENSE)
