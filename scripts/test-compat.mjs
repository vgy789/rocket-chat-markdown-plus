import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";

const root = path.resolve(new URL("../", import.meta.url).pathname);
const artifact = path.join(root, "dist", "rocket-chat-markdown-plus.user.js");
const matrix = [
  { version: "8.6.1", mongo: "8.0.0", port: 39081 },
  { version: "8.5.2", mongo: "8.0.0", port: 39082 },
  { version: "7.10.14", mongo: "6.0.26", port: 39083 },
];
const selectedVersion = process.env.RCMP_COMPAT_VERSION;
const cases = selectedVersion
  ? matrix.filter(({ version }) => version === selectedVersion)
  : matrix;
const keep = process.env.RCMP_COMPAT_KEEP === "1";
const adminUsername = `rcmp_compat_${process.pid}`;
const adminPassword = `rcmp-compat-${Math.random().toString(36).slice(2)}-A9!`;
const adminEmail = `${adminUsername}@localhost.invalid`;
const docker = process.platform === "win32" ? "docker.exe" : "docker";

if (cases.length === 0) {
  throw new Error(`Unknown RCMP_COMPAT_VERSION: ${selectedVersion}`);
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? root,
      env: options.env ?? process.env,
      stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with ${code}\n${stderr || stdout}`));
      }
    });
  });
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(options.timeout ?? 10_000),
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = text;
  }
  return { response, body };
}

async function waitFor(label, check, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const result = await check();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(`Timed out waiting for ${label}${lastError ? `: ${lastError.message}` : "."}`);
}

function composeFile(testCase) {
  return `services:
  mongo:
    image: mongodb/mongodb-community-server:${testCase.mongo}-ubi8
    command: ["mongod", "--replSet", "rs0", "--bind_ip_all"]
    volumes:
      - mongo-data:/data/db
      - mongo-config:/data/configdb
    healthcheck:
      test: ["CMD-SHELL", "mongosh --quiet --eval 'db.adminCommand({ ping: 1 }).ok' | grep 1"]
      interval: 2s
      timeout: 5s
      retries: 30
  rocketchat:
    image: registry.rocket.chat/rocketchat/rocket.chat:${testCase.version}
    depends_on:
      mongo:
        condition: service_healthy
    ports:
      - "${testCase.port}:3000"
    environment:
      PORT: 3000
      ROOT_URL: http://127.0.0.1:${testCase.port}
      MONGO_URL: mongodb://mongo:27017/rocketchat?replicaSet=rs0
      MONGO_OPLOG_URL: mongodb://mongo:27017/local?replicaSet=rs0
      OVERWRITE_SETTING_Show_Setup_Wizard: completed
      ADMIN_USERNAME: ${adminUsername}
      ADMIN_NAME: Rocket Chat Compatibility
      ADMIN_EMAIL: ${adminEmail}
      ADMIN_PASS: ${adminPassword}
volumes:
  mongo-data:
  mongo-config:
`;
}

async function compose(projectName, composePath, args, capture = false) {
  return run(docker, ["compose", "-p", projectName, "-f", composePath, ...args], { capture });
}

async function initializeReplicaSet(projectName, composePath) {
  await waitFor(
    "MongoDB",
    async () => {
      try {
        await compose(
          projectName,
          composePath,
          [
            "exec",
            "-T",
            "mongo",
            "mongosh",
            "--quiet",
            "--eval",
            "db.adminCommand({ ping: 1 }).ok",
          ],
          true,
        );
        return true;
      } catch {
        return false;
      }
    },
    120_000,
  );
  await compose(projectName, composePath, [
    "exec",
    "-T",
    "mongo",
    "mongosh",
    "--quiet",
    "--eval",
    'try { rs.status(); } catch (error) { rs.initiate({_id: "rs0", members: [{_id: 0, host: "mongo:27017"}]}); }',
  ]);
}

async function completeSetupWizard(projectName, composePath) {
  await compose(projectName, composePath, [
    "exec",
    "-T",
    "mongo",
    "mongosh",
    "--quiet",
    "rocketchat",
    "--eval",
    'db.rocketchat_settings.updateOne({_id: "Show_Setup_Wizard"}, {$set: {value: "completed"}})',
  ]);
}

async function login(baseUrl) {
  return waitFor(
    "Rocket.Chat admin login",
    async () => {
      const { response, body } = await jsonRequest(`${baseUrl}/api/v1/login`, {
        method: "POST",
        body: JSON.stringify({ user: adminUsername, password: adminPassword }),
      });
      if (
        !response.ok ||
        body?.status !== "success" ||
        !body?.data?.authToken ||
        !body?.data?.userId
      ) {
        return false;
      }
      return body.data;
    },
    180_000,
  );
}

function authHeaders(auth) {
  return {
    "X-Auth-Token": auth.authToken,
    "X-User-Id": auth.userId,
  };
}

async function waitForSetupWizardCompletion(baseUrl, auth) {
  await waitFor(
    "Rocket.Chat setup wizard completion",
    async () => {
      const { response, body } = await jsonRequest(`${baseUrl}/api/v1/settings/Show_Setup_Wizard`, {
        headers: authHeaders(auth),
      });
      return response.ok && body?.value === "completed";
    },
    60_000,
  );
}

async function joinGeneralChannel(baseUrl, auth) {
  const info = await jsonRequest(`${baseUrl}/api/v1/channels.info?roomName=general`, {
    headers: authHeaders(auth),
  });
  const roomId = info.body?.channel?._id ?? info.body?.room?._id;
  if (!info.response.ok || !roomId) {
    throw new Error("Could not resolve the general channel ID.");
  }
  const { response, body } = await jsonRequest(`${baseUrl}/api/v1/channels.join`, {
    method: "POST",
    headers: authHeaders(auth),
    body: JSON.stringify({ roomId }),
  });
  if (!response.ok || body?.success === false) {
    throw new Error(`Could not join the general channel: HTTP ${response.status}`);
  }
  return roomId;
}

function expectedWarningAttachment(attachment) {
  return (
    attachment?.color === "#ff8800" &&
    attachment?.title === "⚠ Warning" &&
    attachment?.text === "Block text"
  );
}

async function testBrowser(baseUrl, auth, roomId) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addInitScript(({ authToken, userId }) => {
    localStorage.setItem("Meteor.loginToken", authToken);
    localStorage.setItem("Meteor.userId", userId);
  }, auth);
  await context.addInitScript({ path: artifact });
  const page = await context.newPage();
  try {
    const paths = ["/channel/general", "/#/channel/general", "/#/room/general", "/"];
    let composer;
    for (const route of paths) {
      await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded" });
      try {
        await page.waitForSelector(
          'textarea[data-qa-id="message-composer-input"], textarea[name="msg"], [contenteditable="true"][role="textbox"]',
          { state: "visible", timeout: 15_000 },
        );
        composer = page
          .locator(
            'textarea[data-qa-id="message-composer-input"], textarea[name="msg"], [contenteditable="true"][role="textbox"]',
          )
          .first();
        break;
      } catch {
        // Try the next route shape used by older Rocket.Chat clients.
      }
    }
    if (!composer) throw new Error("Could not find a visible Rocket.Chat composer.");
    await page.getByRole("button", { name: /insert a callout block/i }).waitFor();
    await composer.fill("Before ");
    await page.getByRole("button", { name: /insert a callout block/i }).click();
    await page.getByRole("button", { name: "Warning" }).click();
    await page.getByRole("button", { name: "Insert", exact: true }).click();
    const insertedValue = await composer.evaluate((element) =>
      element instanceof HTMLTextAreaElement ? element.value : (element.textContent ?? ""),
    );
    if (!insertedValue.includes(":::warning") || !insertedValue.includes("⚠ Warning")) {
      throw new Error("The real composer did not receive the warning callout template.");
    }
    const message = {
      rid: roomId,
      msg: "Before\n\nBlock text",
      attachments: [{ color: "#ff8800", title: "⚠ Warning", text: "Block text" }],
    };
    const restResult = await page.evaluate(
      async ({ authToken, userId, message }) => {
        const response = await fetch("/api/v1/chat.sendMessage", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "X-Auth-Token": authToken,
            "X-User-Id": userId,
          },
          body: JSON.stringify({ message }),
        });
        return {
          ok: response.ok,
          status: response.status,
          body: await response.json().catch(() => undefined),
        };
      },
      { authToken: auth.authToken, userId: auth.userId, message },
    );
    if (!restResult.ok) throw new Error(`chat.sendMessage returned HTTP ${restResult.status}`);
    const requestAttachment = message.attachments.at(-1);
    if (!expectedWarningAttachment(requestAttachment)) {
      throw new Error("The compatibility payload did not contain the expected warning attachment.");
    }

    const history = await jsonRequest(
      `${baseUrl}/api/v1/channels.history?roomName=general&count=50`,
      { headers: authHeaders(auth) },
    );
    if (!history.response.ok || history.body?.success === false) {
      throw new Error("Could not read the general channel history after sending the callout.");
    }
    const storedMessage = history.body?.messages?.find((message) =>
      message?.attachments?.some((attachment) => expectedWarningAttachment(attachment)),
    );
    if (!storedMessage) {
      throw new Error("The warning attachment was not present in the stored channel history.");
    }
  } finally {
    await context.close();
    await browser.close();
  }
}

async function runCase(testCase) {
  const projectName = `rcmp-compat-${testCase.version.replaceAll(".", "-")}-${Date.now()}`;
  const directory = await mkdtemp(path.join(tmpdir(), "rocket-chat-markdown-plus-"));
  const composePath = path.join(directory, "compose.yml");
  const baseUrl = `http://127.0.0.1:${testCase.port}`;
  await writeFile(composePath, composeFile(testCase), { mode: 0o600 });
  console.log(`\n[compat] Rocket.Chat ${testCase.version} on ${baseUrl}`);
  try {
    await compose(projectName, composePath, ["up", "-d", "mongo"]);
    await initializeReplicaSet(projectName, composePath);
    await compose(projectName, composePath, ["up", "-d", "rocketchat"]);
    await waitFor(`${testCase.version} /api/info`, async () => {
      const { response, body } = await jsonRequest(`${baseUrl}/api/info`);
      const expectedApiVersion = testCase.version.split(".").slice(0, 2).join(".");
      return response.ok && String(body?.version ?? "") === expectedApiVersion;
    });
    await completeSetupWizard(projectName, composePath);
    const auth = await login(baseUrl);
    await waitForSetupWizardCompletion(baseUrl, auth);
    const roomId = await joinGeneralChannel(baseUrl, auth);
    await testBrowser(baseUrl, auth, roomId);
    console.log(`[compat] Rocket.Chat ${testCase.version}: PASS`);
  } catch (error) {
    console.error(`[compat] Rocket.Chat ${testCase.version}: FAIL`);
    try {
      const logs = await compose(
        projectName,
        composePath,
        ["logs", "--tail", "80", "rocketchat"],
        true,
      );
      console.error(logs.stdout);
      console.error(logs.stderr);
    } catch (logError) {
      console.error(`Could not collect container logs: ${logError.message}`);
    }
    throw error;
  } finally {
    if (!keep) {
      await compose(projectName, composePath, ["down", "--volumes", "--remove-orphans"]).catch(
        () => undefined,
      );
    } else {
      console.log(`[compat] Keeping Docker project ${projectName}`);
    }
    await rm(directory, { recursive: true, force: true });
  }
}

await run(docker, ["compose", "version"]);
try {
  await run(docker, ["info"], { capture: true });
} catch (error) {
  throw new Error(
    `Docker CLI is installed but the daemon is unavailable or inaccessible. Start Docker and ensure the current user can access its socket.\n${error.message}`,
  );
}
await run(process.execPath, [path.join(root, "scripts", "build.mjs")]);
await readFile(artifact);

for (const testCase of cases) {
  await runCase(testCase);
}
