import { defaultTitles } from "./i18n";
import {
  CALLOUT_TYPES,
  type CalloutType,
  type Diagnostic,
  type Locale,
  type MessageAttachment,
  type ParseResult,
} from "./types";

const colors: Record<CalloutType, string> = {
  warning: "#ff8800",
  info: "#3498db",
  success: "#27ae60",
  error: "#e74c3c",
  note: "#9b59b6",
};

const metadataKeys = new Set(["title", "color", "thumb", "image", "collapsed"]);
const colorPattern = /^#(?:[\da-f]{3}|[\da-f]{6})$/i;
const openingPattern = /^:::([a-z]+)\s*$/i;
const closingPattern = /^:::\s*$/;

function isCalloutType(value: string): value is CalloutType {
  return (CALLOUT_TYPES as readonly string[]).includes(value);
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function addMetadata(
  attachment: MessageAttachment,
  key: string,
  value: string,
  line: number,
  diagnostics: Diagnostic[],
): void {
  switch (key) {
    case "title":
      attachment.title = value;
      break;
    case "color":
      if (!colorPattern.test(value)) {
        diagnostics.push({ code: "invalidColor", line, value });
      } else {
        attachment.color = value;
      }
      break;
    case "thumb":
    case "image":
      if (!isHttpsUrl(value)) {
        diagnostics.push({ code: "invalidUrl", line, value });
      } else if (key === "thumb") {
        attachment.thumb_url = value;
      } else {
        attachment.image_url = value;
      }
      break;
    case "collapsed":
      if (value !== "true" && value !== "false") {
        diagnostics.push({ code: "invalidBoolean", line, value });
      } else {
        attachment.collapsed = value === "true";
      }
      break;
  }
}

export function parseMessage(input: string, locale: Locale = "ru"): ParseResult {
  const normalized = input.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const plainLines: string[] = [];
  const attachments: MessageAttachment[] = [];
  const diagnostics: Diagnostic[] = [];
  const titles = defaultTitles(locale);
  let sawDirective = false;
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const opening = openingPattern.exec(line);

    if (closingPattern.test(line)) {
      sawDirective = true;
      diagnostics.push({ code: "unexpectedClosing", line: index + 1 });
      index += 1;
      continue;
    }

    if (!opening) {
      plainLines.push(line);
      index += 1;
      continue;
    }

    sawDirective = true;
    const openingLine = index + 1;
    const rawType = (opening[1] ?? "").toLowerCase();
    if (!isCalloutType(rawType)) {
      diagnostics.push({ code: "unknownType", line: openingLine, value: rawType });
    }

    const type: CalloutType = isCalloutType(rawType) ? rawType : "note";
    const attachment: MessageAttachment = {
      color: colors[type],
      title: titles[type],
      text: "",
    };
    const body: string[] = [];
    const seenMetadata = new Set<string>();
    let imageMetadataLine: number | undefined;
    let collapsedMetadataLine: number | undefined;
    let readingMetadata = true;
    let closed = false;
    index += 1;

    while (index < lines.length) {
      const blockLine = lines[index] ?? "";
      if (closingPattern.test(blockLine)) {
        closed = true;
        index += 1;
        break;
      }

      if (openingPattern.test(blockLine)) {
        diagnostics.push({ code: "nestedBlock", line: index + 1 });
      }

      if (readingMetadata) {
        if (blockLine.trim() === "") {
          readingMetadata = false;
          index += 1;
          continue;
        }

        const metadata = /^([a-z_]+)\s*=\s*(.*)$/i.exec(blockLine.trim());
        if (metadata) {
          const key = (metadata[1] ?? "").toLowerCase();
          const value = metadata[2] ?? "";
          if (!metadataKeys.has(key)) {
            diagnostics.push({ code: "unknownMetadata", line: index + 1, value: key });
          } else {
            if (seenMetadata.has(key)) {
              diagnostics.push({ code: "duplicateMetadata", line: index + 1, value: key });
            }
            seenMetadata.add(key);
            addMetadata(attachment, key, value, index + 1, diagnostics);
            if (key === "image" && attachment.image_url) imageMetadataLine = index + 1;
            if (key === "collapsed" && attachment.collapsed) collapsedMetadataLine = index + 1;
          }
          index += 1;
          continue;
        }

        readingMetadata = false;
      }

      body.push(blockLine);
      index += 1;
    }

    if (!closed) {
      diagnostics.push({ code: "unclosedBlock", line: openingLine });
    }

    if (attachment.image_url && attachment.collapsed) {
      diagnostics.push({
        code: "incompatibleMedia",
        line: Math.max(imageMetadataLine ?? openingLine, collapsedMetadataLine ?? openingLine),
      });
    }

    attachment.text = body.join("\n").trim();
    if (isCalloutType(rawType)) {
      attachments.push(attachment);
    }

    if (plainLines.at(-1) === "" && lines[index] === "") {
      index += 1;
    }
  }

  if (!sawDirective) {
    return { kind: "plain", text: input, attachments: [], diagnostics: [] };
  }

  return {
    kind: diagnostics.length > 0 ? "invalid" : "enhanced",
    text: plainLines.join("\n").trim(),
    attachments,
    diagnostics,
  };
}
