import { parseMessage } from "./parser";
import type { Diagnostic, Locale, RocketMessage } from "./types";
import { hasRocketChatComposer } from "./ui";

type ApplyAsync = (method: unknown, args?: unknown, ...rest: unknown[]) => unknown;

const hookMarker = Symbol.for("rocket-chat-markdown-plus.message-hook");

export interface MeteorConnection {
  applyAsync: ApplyAsync;
  apply?: ApplyAsync;
  [hookMarker]?: boolean;
}

interface SessionAuth {
  token: string;
  userId: string;
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface HookDependencies {
  locale: () => Locale;
  onDiagnostics: (diagnostics: Diagnostic[]) => void;
  onReady?: () => void;
  fetch?: FetchLike;
  readAuth?: () => SessionAuth | null;
}

function validationRejection(): Promise<never> {
  const error = new Error("Rocket.Chat Markdown+ blocked an invalid callout message.");
  error.name = "RocketChatMarkdownPlusValidationError";
  return Promise.reject(error);
}

function readSessionAuth(): SessionAuth | null {
  const meteor = (
    globalThis as typeof globalThis & {
      Meteor?: { userId?: () => string | null };
    }
  ).Meteor;
  const token = globalThis.localStorage?.getItem("Meteor.loginToken");
  const userId = meteor?.userId?.() ?? null;
  if (!token || !userId) return null;
  return { token, userId };
}

async function responsePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function payloadMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "string" && payload.trim()) return payload.trim();
  if (payload && typeof payload === "object") {
    const value = payload as { error?: unknown; message?: unknown };
    if (typeof value.error === "string" && value.error.trim()) return value.error.trim();
    if (typeof value.message === "string" && value.message.trim()) return value.message.trim();
  }
  return fallback;
}

export async function sendMessageViaRest(
  message: RocketMessage,
  dependencies: Pick<HookDependencies, "fetch" | "readAuth"> = {},
): Promise<unknown> {
  const auth = (dependencies.readAuth ?? readSessionAuth)();
  if (!auth) {
    throw new Error("No active Rocket.Chat session was found.");
  }
  const fetchImpl = dependencies.fetch ?? globalThis.fetch.bind(globalThis);
  const response = await fetchImpl("/api/v1/chat.sendMessage", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-Auth-Token": auth.token,
      "X-User-Id": auth.userId,
    },
    body: JSON.stringify({ message }),
  });
  const payload = await responsePayload(response);
  const success =
    payload && typeof payload === "object" && "success" in payload
      ? (payload as { success?: unknown }).success !== false
      : true;
  if (!response.ok || !success) {
    throw new Error(payloadMessage(payload, `HTTP ${response.status}`));
  }
  return payload;
}

function sendErrorDiagnostic(error: unknown): Diagnostic[] {
  const message = error instanceof Error ? error.message : "Unknown server error.";
  return [{ code: "sendError", line: 1, value: message.slice(0, 240) }];
}

export function hookConnection(
  connection: MeteorConnection,
  dependencies: HookDependencies,
): boolean {
  if (connection[hookMarker]) return false;

  const methodNames = (["applyAsync", "apply"] as const).filter(
    (methodName) => typeof connection[methodName] === "function",
  );
  if (methodNames.length === 0) return false;
  for (const methodName of methodNames) {
    const original = connection[methodName];
    if (!original) continue;
    const wrapped = function (
      this: MeteorConnection,
      method: unknown,
      args?: unknown,
      ...rest: unknown[]
    ) {
      if (method !== "sendMessage" || !Array.isArray(args)) {
        return original.call(this, method, args, ...rest);
      }

      const message = args[0];
      if (
        !message ||
        typeof message !== "object" ||
        typeof (message as RocketMessage).msg !== "string"
      ) {
        return original.call(this, method, args, ...rest);
      }

      const rocketMessage = message as RocketMessage;
      const result = parseMessage(rocketMessage.msg, dependencies.locale());
      if (result.kind === "plain") {
        return original.call(this, method, args, ...rest);
      }

      if (rocketMessage.t === "e2e" || rocketMessage.e2e === true) {
        dependencies.onDiagnostics([{ code: "encryptedRoom", line: 1 }]);
        return validationRejection();
      }

      if (result.kind === "invalid") {
        dependencies.onDiagnostics(result.diagnostics);
        return validationRejection();
      }

      dependencies.onDiagnostics([]);
      const enhancedMessage: RocketMessage = {
        ...rocketMessage,
        msg: result.text,
        attachments: [...(rocketMessage.attachments ?? []), ...result.attachments],
      };
      return sendMessageViaRest(enhancedMessage, dependencies).catch((error: unknown) => {
        dependencies.onDiagnostics(sendErrorDiagnostic(error));
        throw error;
      });
    };
    connection[methodName] = wrapped;
  }
  connection[hookMarker] = true;
  return true;
}

export function waitForRocketChat(dependencies: HookDependencies): void {
  let ready = false;
  let interval: number | undefined;
  let observer: MutationObserver;

  const cleanup = () => {
    observer.disconnect();
    if (interval !== undefined) window.clearInterval(interval);
  };

  const attempt = () => {
    if (ready || !hasRocketChatComposer()) return ready;
    const meteor = (
      window as typeof window & {
        Meteor?: { connection?: MeteorConnection };
      }
    ).Meteor;
    if (!meteor?.connection || !hookConnection(meteor.connection, dependencies)) return false;
    ready = true;
    cleanup();
    dependencies.onReady?.();
    return true;
  };

  observer = new MutationObserver(attempt);
  if (attempt()) return;
  observer.observe(document.documentElement, { childList: true, subtree: true });
  interval = window.setInterval(attempt, 500);
}
