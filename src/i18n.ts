import type { CalloutType, Diagnostic, Locale } from "./types";

const copy = {
  ru: {
    insert: "Вставить callout-блок",
    customTitle: "Оформление сообщения",
    customHeading: "Оформление сообщения",
    formLabel: "Форма стиля callout",
    presetGroup: "Готовые стили",
    modified: "изменено",
    customAdditional: "Дополнительно",
    titleField: "Заголовок",
    colorField: "Цвет",
    thumbField: "Миниатюра (HTTPS URL)",
    imageField: "Изображение (HTTPS URL)",
    collapsedField: "Сворачивать медиа",
    insertCustom: "Вставить",
    requiredTitle: "Укажите заголовок.",
    invalidCustomColor: "Цвет должен быть в формате #RGB или #RRGGBB.",
    invalidCustomUrl: "Укажите абсолютный HTTPS-адрес.",
    incompatibleMedia: "Изображение нельзя использовать вместе со сворачиванием медиа.",
    customFormError: "Исправьте ошибки в форме.",
    mediaCompatibilityHint: "Изображение и сворачивание медиа взаимоисключающие.",
    placeholder: "Текст блока",
    typeLabels: {
      warning: "Внимание",
      info: "Информация",
      success: "Успех",
      error: "Ошибка",
      note: "Заметка",
    },
    presetLabels: {
      warning: "Внимание",
      info: "Инфо",
      success: "Успех",
      error: "Ошибка",
      note: "Заметка",
    },
    diagnostics: {
      unknownType: "Неизвестный тип блока: {value}.",
      unknownMetadata: "Неизвестный параметр: {value}.",
      duplicateMetadata: "Параметр указан повторно: {value}.",
      invalidColor: "Цвет должен быть в формате #RGB или #RRGGBB.",
      invalidUrl: "Для image и thumb нужен абсолютный HTTPS-адрес.",
      invalidBoolean: "collapsed принимает только true или false.",
      incompatibleMedia: "Параметры image и collapsed несовместимы: используйте только один.",
      sendError: "Сервер не принял сообщение: {value}",
      unclosedBlock: "У блока нет закрывающей строки :::.",
      unexpectedClosing: "Закрывающая строка ::: не относится к блоку.",
      nestedBlock: "Вложенные callout-блоки не поддерживаются.",
      encryptedRoom: "Callout-блоки пока нельзя отправлять в зашифрованные комнаты.",
    },
    line: "Строка {line}: {message}",
  },
  en: {
    insert: "Insert a callout block",
    customTitle: "Message style",
    customHeading: "Message style",
    formLabel: "Callout style form",
    presetGroup: "Preset styles",
    modified: "modified",
    customAdditional: "Additional options",
    titleField: "Title",
    colorField: "Color",
    thumbField: "Thumbnail (HTTPS URL)",
    imageField: "Image (HTTPS URL)",
    collapsedField: "Collapse media",
    insertCustom: "Insert",
    requiredTitle: "Enter a title.",
    invalidCustomColor: "Color must use #RGB or #RRGGBB.",
    invalidCustomUrl: "Enter an absolute HTTPS URL.",
    incompatibleMedia: "Image cannot be used together with collapsed media.",
    customFormError: "Fix the errors in the form.",
    mediaCompatibilityHint: "Image and collapsed media are mutually exclusive.",
    placeholder: "Block text",
    typeLabels: {
      warning: "Warning",
      info: "Information",
      success: "Success",
      error: "Error",
      note: "Note",
    },
    presetLabels: {
      warning: "Warning",
      info: "Info",
      success: "Success",
      error: "Error",
      note: "Note",
    },
    diagnostics: {
      unknownType: "Unknown block type: {value}.",
      unknownMetadata: "Unknown parameter: {value}.",
      duplicateMetadata: "Parameter is repeated: {value}.",
      invalidColor: "Color must use #RGB or #RRGGBB.",
      invalidUrl: "image and thumb require an absolute HTTPS URL.",
      invalidBoolean: "collapsed only accepts true or false.",
      incompatibleMedia: "image and collapsed cannot be used together; choose one.",
      sendError: "The server rejected the message: {value}",
      unclosedBlock: "The block has no closing ::: line.",
      unexpectedClosing: "The closing ::: line does not belong to a block.",
      nestedBlock: "Nested callout blocks are not supported.",
      encryptedRoom: "Callout blocks cannot be sent to encrypted rooms yet.",
    },
    line: "Line {line}: {message}",
  },
} as const;

export function detectLocale(language = document.documentElement.lang): Locale {
  return language.toLowerCase().startsWith("ru") ? "ru" : "en";
}

export function defaultTitles(locale: Locale): Record<CalloutType, string> {
  const labels = copy[locale].typeLabels;
  return {
    warning: `⚠ ${labels.warning}`,
    info: `ℹ ${labels.info}`,
    success: `✅ ${labels.success}`,
    error: `❌ ${labels.error}`,
    note: `📝 ${labels.note}`,
  };
}

export function uiCopy(locale: Locale) {
  return copy[locale];
}

export function formatDiagnostic(locale: Locale, diagnostic: Diagnostic): string {
  const template = copy[locale].diagnostics[diagnostic.code];
  const message = template.replace("{value}", diagnostic.value ?? "");
  return copy[locale].line.replace("{line}", String(diagnostic.line)).replace("{message}", message);
}
