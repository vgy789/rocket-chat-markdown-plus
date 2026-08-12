export const CALLOUT_TYPES = ["warning", "info", "success", "error", "note"] as const;

export type CalloutType = (typeof CALLOUT_TYPES)[number];
export type Locale = "ru" | "en";

export interface MessageAttachment {
  color: string;
  title: string;
  text: string;
  thumb_url?: string;
  image_url?: string;
  collapsed?: boolean;
}

export type DiagnosticCode =
  | "unknownType"
  | "unknownMetadata"
  | "duplicateMetadata"
  | "invalidColor"
  | "invalidUrl"
  | "invalidBoolean"
  | "incompatibleMedia"
  | "sendError"
  | "unclosedBlock"
  | "unexpectedClosing"
  | "nestedBlock"
  | "encryptedRoom";

export interface Diagnostic {
  code: DiagnosticCode;
  line: number;
  value?: string;
}

export interface ParseResult {
  kind: "plain" | "enhanced" | "invalid";
  text: string;
  attachments: MessageAttachment[];
  diagnostics: Diagnostic[];
}

export interface RocketMessage {
  _id?: string;
  rid: string;
  msg: string;
  t?: string;
  e2e?: boolean;
  tmid?: string;
  attachments?: MessageAttachment[];
  [key: string]: unknown;
}
