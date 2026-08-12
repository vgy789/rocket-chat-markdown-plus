import { describe, expect, it } from "vitest";
import { parseMessage } from "../../src/parser";
import { buildCustomTemplate } from "../../src/ui";

describe("parseMessage", () => {
  it("leaves ordinary messages byte-for-byte unchanged", () => {
    const input = "  ordinary\r\nmessage  ";
    expect(parseMessage(input)).toEqual({
      kind: "plain",
      text: input,
      attachments: [],
      diagnostics: [],
    });
  });

  it("keeps plain text around a callout", () => {
    const result = parseMessage("До\n\n:::warning\n\n**Осторожно**\n:::\n\nПосле");
    expect(result.kind).toBe("enhanced");
    expect(result.text).toBe("До\n\nПосле");
    expect(result.attachments).toEqual([
      {
        color: "#ff8800",
        title: "⚠ Внимание",
        text: "**Осторожно**",
      },
    ]);
  });

  it.each([
    ["warning", "#ff8800", "⚠ Warning"],
    ["info", "#3498db", "ℹ Information"],
    ["success", "#27ae60", "✅ Success"],
    ["error", "#e74c3c", "❌ Error"],
    ["note", "#9b59b6", "📝 Note"],
  ])("creates the %s preset", (type, color, title) => {
    const result = parseMessage(`:::${type}\nBody\n:::`, "en");
    expect(result.attachments[0]).toEqual({ color, title, text: "Body" });
  });

  it("parses supported image metadata", () => {
    const result = parseMessage(
      [
        ":::info",
        "title=Deploy",
        "color=#0af",
        "thumb=https://example.com/thumb.png",
        "image=https://example.com/image.png",
        "",
        "Ready",
        ":::",
      ].join("\n"),
    );
    expect(result).toMatchObject({
      kind: "enhanced",
      text: "",
      attachments: [
        {
          title: "Deploy",
          color: "#0af",
          thumb_url: "https://example.com/thumb.png",
          image_url: "https://example.com/image.png",
          text: "Ready",
        },
      ],
    });
  });

  it("parses collapsed media without a large image", () => {
    const result = parseMessage(
      [":::info", "thumb=https://example.com/thumb.png", "collapsed=true", "", "Ready", ":::"].join(
        "\n",
      ),
    );
    expect(result).toMatchObject({
      kind: "enhanced",
      attachments: [
        {
          thumb_url: "https://example.com/thumb.png",
          collapsed: true,
          text: "Ready",
        },
      ],
    });
  });

  it("parses multiple blocks and CRLF", () => {
    const result = parseMessage(":::info\r\nOne\r\n:::\r\n:::note\r\nTwo\r\n:::");
    expect(result.kind).toBe("enhanced");
    expect(result.attachments.map(({ text }) => text)).toEqual(["One", "Two"]);
  });

  it("allows a title-only block", () => {
    const result = parseMessage(":::success\ntitle=Done\n:::");
    expect(result.kind).toBe("enhanced");
    expect(result.attachments[0]).toMatchObject({ title: "Done", text: "" });
  });

  it("treats an empty message as an ordinary message", () => {
    expect(parseMessage("").kind).toBe("plain");
  });

  it.each([
    [":::unknown\nBody\n:::", "unknownType", 1],
    [":::info\nwat=value\nBody\n:::", "unknownMetadata", 2],
    [":::info\nfooter=CI\nBody\n:::", "unknownMetadata", 2],
    [":::info\ntitle=One\ntitle=Two\n:::", "duplicateMetadata", 3],
    [":::info\ncolor=red\n:::", "invalidColor", 2],
    [":::info\nimage=http://example.com/a.png\n:::", "invalidUrl", 2],
    [":::info\ncollapsed=yes\n:::", "invalidBoolean", 2],
    [":::info\nimage=https://example.com/a.png\ncollapsed=true\n:::", "incompatibleMedia", 3],
    [":::info\nBody", "unclosedBlock", 1],
    ["Body\n:::", "unexpectedClosing", 2],
    [":::info\n:::note\n:::\n:::", "nestedBlock", 2],
  ])("reports invalid input %#", (input, code, line) => {
    const result = parseMessage(input);
    expect(result.kind).toBe("invalid");
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code, line }));
  });
});

describe("buildCustomTemplate", () => {
  it.each(["warning", "info", "success", "error", "note"] as const)(
    "uses the selected %s directive",
    (type) => {
      expect(buildCustomTemplate({ type, title: "Title", color: "#123456" }, "Block text")).toMatch(
        new RegExp(`^:::${type}\\n`),
      );
    },
  );

  it("includes only the custom fields that were filled", () => {
    const template = buildCustomTemplate(
      {
        type: "note",
        title: "Deploy",
        color: "#0af",
        image: "https://example.com/image.png",
      },
      "Block text",
    );

    expect(template).toBe(
      [
        ":::note",
        "title=Deploy",
        "color=#0af",
        "image=https://example.com/image.png",
        "",
        "Block text",
        ":::",
      ].join("\n"),
    );
    expect(parseMessage(template, "en")).toMatchObject({
      kind: "enhanced",
      attachments: [
        {
          title: "Deploy",
          color: "#0af",
          image_url: "https://example.com/image.png",
          text: "Block text",
        },
      ],
    });
  });
});
