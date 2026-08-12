import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1200, height: 760 },
  colorScheme: "dark",
  deviceScaleFactor: 1,
});

await page.setContent(`
  <!doctype html>
  <html lang="ru">
    <head>
      <style>
        * { box-sizing: border-box; }
        body { margin: 0; background: #11151c; color: #edf1f7; font: 15px/1.45 Inter, system-ui, sans-serif; }
        .app { width: 1120px; height: 680px; margin: 40px auto; display: grid; grid-template-columns: 240px 1fr; overflow: hidden; border: 1px solid #303846; border-radius: 18px; background: #171c24; box-shadow: 0 28px 70px #0008; }
        aside { padding: 28px 20px; border-right: 1px solid #303846; background: #131820; }
        .brand { display: flex; align-items: center; gap: 12px; margin-bottom: 34px; font-size: 17px; font-weight: 700; }
        .logo { display: grid; width: 34px; height: 34px; place-items: center; border-radius: 10px; background: #f5455c; color: white; }
        .section { margin: 24px 8px 8px; color: #778397; font-size: 11px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
        .room { padding: 9px 10px; border-radius: 8px; color: #aab4c3; }
        .room.active { background: #252c38; color: #fff; font-weight: 600; }
        main { display: grid; grid-template-rows: 76px 1fr auto; min-width: 0; }
        header { display: flex; align-items: center; justify-content: space-between; padding: 0 28px; border-bottom: 1px solid #303846; }
        header h1 { margin: 0; font-size: 18px; }
        header span { color: #7f8b9d; font-size: 13px; }
        .messages { padding: 30px 36px; }
        .message { display: grid; grid-template-columns: 38px 1fr; gap: 13px; margin-bottom: 26px; }
        .avatar { display: grid; width: 38px; height: 38px; place-items: center; border-radius: 50%; background: #5367d8; font-weight: 700; }
        .meta { margin-bottom: 7px; font-weight: 650; }
        .meta time { margin-left: 8px; color: #707c8e; font-size: 12px; font-weight: 400; }
        .text { color: #c7cfda; }
        .callout { max-width: 600px; margin-top: 12px; padding: 14px 17px; border-left: 5px solid #ff8800; border-radius: 4px 10px 10px 4px; background: #222936; }
        .callout strong { display: block; margin-bottom: 5px; color: #fff; }
        .callout footer { margin-top: 10px; color: #8793a6; font-size: 12px; }
        form { display: flex; align-items: flex-end; gap: 7px; margin: 0 28px 24px; padding: 9px; border: 1px solid #3b4657; border-radius: 12px; background: #1d232d; }
        textarea { min-height: 84px; flex: 1; resize: none; border: 0; outline: 0; background: transparent; color: #dce3ed; font: 14px/1.4 ui-monospace, SFMono-Regular, Consolas, monospace; }
        #send { height: 34px; padding: 0 16px; border: 0; border-radius: 8px; background: #5367d8; color: white; font-weight: 700; }
        .caption { position: fixed; top: 18px; left: 50%; transform: translateX(-50%); padding: 7px 14px; border: 1px solid #39465a; border-radius: 999px; background: #171c24; color: #cbd5e1; font-size: 12px; letter-spacing: .04em; }
      </style>
    </head>
    <body>
      <div class="caption">Rocket.Chat Markdown+ · Tampermonkey</div>
      <div class="app">
        <aside>
          <div class="brand"><div class="logo">R</div>Rocket.Chat</div>
          <div class="section">Каналы</div>
          <div class="room active"># объявления</div>
          <div class="room"># разработка</div>
          <div class="room"># помощь</div>
          <div class="section">Личные сообщения</div>
          <div class="room">Мария</div>
        </aside>
        <main>
          <header><h1># объявления</h1><span>12 участников</span></header>
          <section class="messages">
            <article class="message">
              <div class="avatar">А</div>
              <div>
                <div class="meta">Алекс <time>10:42</time></div>
                <div class="text">Перед обновлением сохраните свою работу.</div>
                <div class="callout">
                  <strong>⚠ Технические работы</strong>
                  Сервис будет недоступен <b>15 минут</b>.
                  <footer>Команда инфраструктуры</footer>
                </div>
              </div>
            </article>
          </section>
          <form>
            <textarea data-qa-id="message-composer-input" aria-label="Сообщение">:::warning
title=Технические работы

Сервис будет недоступен **15 минут**.
:::</textarea>
            <button id="send" type="submit">Отправить</button>
          </form>
        </main>
      </div>
    </body>
  </html>
`);

await page.evaluate(() => {
  Object.assign(window, {
    Meteor: { connection: { applyAsync: () => Promise.resolve({ ok: true }) } },
  });
});
await page.addScriptTag({ path: path.resolve("dist/rocket-chat-markdown-plus.user.js") });
await page.getByRole("button", { name: "Вставить callout-блок" }).click();

const output = path.resolve("docs/images/showcase.png");
await mkdir(path.dirname(output), { recursive: true });
await page.screenshot({ path: output });
await browser.close();

console.log(`Saved ${output}`);
