import { describe, expect, it, vi } from "vitest";
import { hookConnection, type MeteorConnection } from "../../src/rocket-chat";
import type { Diagnostic } from "../../src/types";

function setup() {
  const applyAsync = vi.fn<
    (method: unknown, args?: unknown, ...rest: unknown[]) => Promise<{ ok: boolean }>
  >(() => Promise.resolve({ ok: true }));
  const fetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve('{"success":true}'),
    } as Response),
  );
  const diagnostics: Diagnostic[][] = [];
  const connection = { applyAsync } as MeteorConnection;
  hookConnection(connection, {
    locale: () => "en",
    onDiagnostics: (items) => diagnostics.push(items),
    fetch,
    readAuth: () => ({ token: "session-token", userId: "user-1" }),
  });
  return { applyAsync, connection, diagnostics, fetch };
}

describe("hookConnection", () => {
  it("delegates unrelated methods with the original arguments and context", async () => {
    const { applyAsync, connection } = setup();
    const args = [{ value: 1 }];
    await connection.applyAsync("typing", args, { wait: true });
    expect(applyAsync).toHaveBeenCalledWith("typing", args, { wait: true });
    expect(applyAsync.mock.contexts[0]).toBe(connection);
  });

  it("does not clone or parse ordinary messages", async () => {
    const { applyAsync, connection } = setup();
    const args = [{ _id: "m1", rid: "r1", msg: "Hello" }];
    await connection.applyAsync("sendMessage", args);
    expect(applyAsync.mock.calls[0]?.[1]).toBe(args);
  });

  it("sends enhanced messages through REST with preserved message fields", async () => {
    const { applyAsync, connection, fetch } = setup();
    await connection.applyAsync("sendMessage", [
      {
        _id: "m1",
        rid: "r1",
        tmid: "thread1",
        msg: "Intro\n\n:::success\nDone\n:::",
        attachments: [{ color: "#000", title: "Old", text: "Old" }],
        custom: "kept",
      },
    ]);

    expect(applyAsync).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledOnce();
    const request = fetch.mock.calls[0]?.[1];
    expect(request?.headers).toMatchObject({
      "X-Auth-Token": "session-token",
      "X-User-Id": "user-1",
    });
    expect(JSON.parse(String(request?.body))).toMatchObject({
      message: {
        _id: "m1",
        rid: "r1",
        tmid: "thread1",
        msg: "Intro",
        custom: "kept",
        attachments: [
          { color: "#000", title: "Old", text: "Old" },
          { color: "#27ae60", title: "✅ Success", text: "Done" },
        ],
      },
    });
  });

  it("reports a REST error without retrying through Meteor", async () => {
    const { applyAsync, connection, diagnostics, fetch } = setup();
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: () => Promise.resolve('{"error":"attachments are not allowed"}'),
    } as Response);

    await expect(
      connection.applyAsync("sendMessage", [{ rid: "r1", msg: ":::info\nBody\n:::" }]),
    ).rejects.toThrow("attachments are not allowed");
    expect(fetch).toHaveBeenCalledOnce();
    expect(applyAsync).not.toHaveBeenCalled();
    expect(diagnostics.at(-1)).toEqual([
      { code: "sendError", line: 1, value: "attachments are not allowed" },
    ]);
  });

  it("blocks invalid markup without calling Rocket.Chat", async () => {
    const { applyAsync, connection, diagnostics } = setup();
    await expect(
      connection.applyAsync("sendMessage", [{ rid: "r1", msg: ":::wat\nBody\n:::" }]),
    ).rejects.toHaveProperty("name", "RocketChatMarkdownPlusValidationError");
    expect(applyAsync).not.toHaveBeenCalled();
    expect(diagnostics.at(-1)?.[0]).toMatchObject({ code: "unknownType", line: 1 });
  });

  it("blocks callouts in encrypted messages", async () => {
    const { applyAsync, connection, diagnostics } = setup();
    await expect(
      connection.applyAsync("sendMessage", [{ rid: "r1", msg: ":::note\nSecret\n:::", t: "e2e" }]),
    ).rejects.toHaveProperty("name", "RocketChatMarkdownPlusValidationError");
    expect(applyAsync).not.toHaveBeenCalled();
    expect(diagnostics.at(-1)).toEqual([{ code: "encryptedRoom", line: 1 }]);
  });

  it("is idempotent", () => {
    const { connection } = setup();
    expect(hookConnection(connection, { locale: () => "en", onDiagnostics: () => undefined })).toBe(
      false,
    );
  });
});
