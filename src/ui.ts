import { defaultTitles, formatDiagnostic, uiCopy } from "./i18n";
import { parseMessage } from "./parser";
import { CALLOUT_TYPES, type CalloutType, type Diagnostic, type Locale } from "./types";

export const composerSelector = [
  'textarea[data-qa-id="message-composer-input"]',
  'textarea[name="msg"]',
  '[contenteditable="true"][role="textbox"][data-qa-id*="composer"]',
  '[contenteditable="true"][role="textbox"]',
].join(",");

export const rocketChatComposerMarkerSelector = [
  '[data-qa-id="message-composer-input"]',
  ".rc-message-box",
  'footer[aria-label="Room composer"]',
].join(",");

export function hasRocketChatComposer(): boolean {
  return Boolean(
    document.querySelector(rocketChatComposerMarkerSelector) &&
      document.querySelector(composerSelector),
  );
}

const typeColors: Record<CalloutType, string> = {
  warning: "#ff8800",
  info: "#3498db",
  success: "#27ae60",
  error: "#e74c3c",
  note: "#9b59b6",
};
const hexColorPattern = /^#(?:[\da-f]{3}|[\da-f]{6})$/i;

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export interface CustomCalloutOptions {
  type: CalloutType;
  title: string;
  color: string;
  thumb?: string;
  image?: string;
  collapsed?: boolean;
}

export function buildCustomTemplate(options: CustomCalloutOptions, placeholder: string): string {
  const metadata = [`title=${options.title}`, `color=${options.color}`];
  if (options.thumb) metadata.push(`thumb=${options.thumb}`);
  if (options.image) metadata.push(`image=${options.image}`);
  if (options.collapsed) metadata.push("collapsed=true");
  return [`:::${options.type}`, ...metadata, "", placeholder, ":::"].join("\n");
}

interface ComposerController {
  composer: HTMLElement;
  host: HTMLElement;
  place: () => void;
  showDiagnostics: (diagnostics: Diagnostic[]) => void;
  destroy: () => void;
}

interface ComposerUiOptions {
  locale: () => Locale;
}

function composerValue(composer: HTMLElement): string {
  if (composer instanceof HTMLTextAreaElement) return composer.value;
  return composer.innerText.replace(/\u00a0/g, " ");
}

function findComposerToolbar(composer: HTMLElement): HTMLElement | null {
  const composerRoot =
    composer.closest<HTMLElement>('footer[aria-label="Room composer"], .rc-message-box') ??
    composer.closest<HTMLElement>("form");
  if (!composerRoot) return null;

  return (
    composerRoot.querySelector<HTMLElement>(
      '[role="toolbar"][aria-label="Composer Primary Actions"]',
    ) ?? composerRoot.querySelector<HTMLElement>('[role="toolbar"]')
  );
}

function placeTrigger(composer: HTMLElement, host: HTMLElement): void {
  const toolbar = findComposerToolbar(composer);
  if (toolbar) {
    if (host.parentElement !== toolbar || toolbar.firstElementChild !== host) {
      toolbar.prepend(host);
    }
    return;
  }

  if (!host.isConnected) composer.insertAdjacentElement("afterend", host);
}

function dispatchInput(composer: HTMLElement, value: string): void {
  composer.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      composed: true,
      inputType: "insertText",
      data: value,
    }),
  );
}

function insertIntoTextarea(
  composer: HTMLTextAreaElement,
  template: string,
  placeholder: string,
  savedSelection: { start: number; end: number } | null = null,
): void {
  const start = savedSelection?.start ?? composer.selectionStart ?? composer.value.length;
  const end = savedSelection?.end ?? composer.selectionEnd ?? start;
  composer.setRangeText(template, start, end, "end");
  const placeholderStart = start + template.indexOf(placeholder);
  composer.setSelectionRange(placeholderStart, placeholderStart + placeholder.length);
  dispatchInput(composer, template);
  composer.focus();
}

function insertIntoContentEditable(
  composer: HTMLElement,
  template: string,
  placeholder: string,
  savedRange: Range | null,
): void {
  const selection = window.getSelection();
  const range = savedRange?.cloneRange() ?? document.createRange();
  if (!savedRange) {
    range.selectNodeContents(composer);
    range.collapse(false);
  }

  range.deleteContents();
  const textNode = document.createTextNode(template);
  range.insertNode(textNode);
  const placeholderStart = template.indexOf(placeholder);
  range.setStart(textNode, placeholderStart);
  range.setEnd(textNode, placeholderStart + placeholder.length);
  selection?.removeAllRanges();
  selection?.addRange(range);
  dispatchInput(composer, template);
  composer.focus();
}

function createStyles(): string {
  return `
    :host {
      --rcmp-surface: #ffffff;
      --rcmp-text: #1f2328;
      --rcmp-muted: #667085;
      --rcmp-border: #d0d5dd;
      --rcmp-hover: #f2f4f7;
      --rcmp-danger: #b42318;
      display: inline-flex;
      position: relative;
      align-items: center;
      margin-inline-end: 4px;
      font: 13px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--rcmp-text);
      z-index: 30;
    }
    @media (prefers-color-scheme: dark) {
      :host {
        --rcmp-surface: #20242b;
        --rcmp-text: #f2f4f7;
        --rcmp-muted: #98a2b3;
        --rcmp-border: #475467;
        --rcmp-hover: #344054;
        --rcmp-danger: #fda29b;
      }
    }
    button { font: inherit; color: inherit; }
    .trigger {
      width: 30px;
      height: 30px;
      display: inline-grid;
      place-items: center;
      border: 1px solid transparent;
      border-radius: 6px;
      background: transparent;
      cursor: pointer;
      font-weight: 700;
      letter-spacing: -1px;
    }
    .trigger:hover, .trigger:focus-visible, .trigger[aria-expanded="true"] {
      background: var(--rcmp-hover);
      border-color: var(--rcmp-border);
      outline: none;
    }
    .diagnostic {
      position: absolute;
      inset-inline-start: 0;
      top: calc(100% + 6px);
      width: min(360px, 70vw);
      padding: 7px 9px;
      border: 1px solid color-mix(in srgb, var(--rcmp-danger) 45%, transparent);
      border-radius: 6px;
      background: var(--rcmp-surface);
      color: var(--rcmp-danger);
      box-shadow: 0 8px 24px rgb(16 24 40 / 16%);
      white-space: pre-line;
    }
    .diagnostic:empty { display: none; }
  `;
}

function createPopupStyles(): string {
  return `
    :host {
      --rcmp-surface: #ffffff;
      --rcmp-text: #1f2328;
      --rcmp-border: #d0d5dd;
      --rcmp-hover: #f2f4f7;
      --rcmp-danger: #b42318;
      display: block;
      position: fixed;
      width: max-content;
      height: max-content;
      margin: 0;
      padding: 0;
      z-index: 2147483647;
      font: 13px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--rcmp-text);
      color-scheme: light;
    }
    @media (prefers-color-scheme: dark) {
      :host {
        --rcmp-surface: #20242b;
        --rcmp-text: #f2f4f7;
        --rcmp-border: #475467;
        --rcmp-hover: #344054;
        --rcmp-danger: #fda29b;
        color-scheme: dark;
      }
    }
    .panel {
      box-sizing: border-box;
      width: min(320px, calc(100vw - 16px));
      max-height: calc(100vh - 16px);
      overflow: auto;
      overscroll-behavior: contain;
      scrollbar-gutter: stable;
      padding: 12px;
      border: 1px solid var(--rcmp-border);
      border-radius: 10px;
      background: var(--rcmp-surface);
      box-shadow: 0 12px 32px rgb(16 24 40 / 22%);
    }
    .panel[hidden] { display: none; }
    .panel-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-block-end: 12px;
    }
    .panel-header h2 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
    }
    .presets {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-block-end: 6px;
    }
    .preset {
      display: inline-flex;
      min-height: 30px;
      align-items: center;
      gap: 6px;
      padding: 5px 8px;
      border: 1px solid var(--rcmp-border);
      border-radius: 999px;
      background: var(--rcmp-surface);
      color: inherit;
      cursor: pointer;
      font: inherit;
    }
    .preset:hover, .preset:focus-visible {
      background: var(--rcmp-hover);
      outline: 2px solid color-mix(in srgb, #3498db 35%, transparent);
      outline-offset: 1px;
    }
    .preset[aria-pressed="true"] {
      border-color: #3498db;
      background: color-mix(in srgb, #3498db 12%, var(--rcmp-surface));
      font-weight: 600;
    }
    .dot {
      width: 8px;
      height: 18px;
      border-radius: 4px;
      flex: none;
    }
    .preset-state {
      min-height: 17px;
      margin-block-end: 8px;
      color: color-mix(in srgb, var(--rcmp-text) 70%, transparent);
      font-size: 11px;
    }
    .field {
      display: grid;
      gap: 4px;
      margin-block-end: 10px;
    }
    .field label, .field-label {
      font-size: 12px;
      font-weight: 600;
    }
    .field input[type="text"], .field input[type="url"] {
      box-sizing: border-box;
      width: 100%;
      min-height: 30px;
      padding: 5px 8px;
      border: 1px solid var(--rcmp-border);
      border-radius: 6px;
      background: var(--rcmp-surface);
      color: var(--rcmp-text);
      font: inherit;
    }
    .field input:focus-visible {
      border-color: #3498db;
      outline: 2px solid color-mix(in srgb, #3498db 35%, transparent);
      outline-offset: 1px;
    }
    .field input[aria-invalid="true"] {
      border-color: var(--rcmp-danger);
    }
    .color-row {
      display: grid;
      grid-template-columns: 42px 1fr;
      gap: 6px;
    }
    .color-picker {
      width: 42px;
      height: 30px;
      padding: 2px;
      border: 1px solid var(--rcmp-border);
      border-radius: 6px;
      background: var(--rcmp-surface);
      cursor: pointer;
    }
    .field-error {
      min-height: 0;
      color: var(--rcmp-danger);
      font-size: 11px;
    }
    .field-help {
      margin: 0 0 8px;
      color: var(--rcmp-muted);
      font-size: 11px;
    }
    details {
      margin-block: 3px 10px;
      border-block: 1px solid var(--rcmp-border);
    }
    summary {
      padding: 8px 0;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
    }
    .check {
      display: flex;
      align-items: center;
      gap: 7px;
      margin-block: 4px 10px;
      font-size: 12px;
    }
    .status {
      min-height: 17px;
      margin-block-end: 6px;
      color: var(--rcmp-danger);
      font-size: 12px;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 7px;
    }
    .actions button {
      min-height: 30px;
      padding: 5px 10px;
      border: 1px solid var(--rcmp-border);
      border-radius: 6px;
      background: var(--rcmp-surface);
      color: inherit;
      cursor: pointer;
      font: inherit;
    }
    .actions button[type="submit"] {
      border-color: #3498db;
      background: #3498db;
      color: #ffffff;
    }
    .actions button:hover, .actions button:focus-visible {
      filter: brightness(0.96);
      outline: 2px solid color-mix(in srgb, #3498db 35%, transparent);
      outline-offset: 1px;
    }
  `;
}

function createController(composer: HTMLElement, options: ComposerUiOptions): ComposerController {
  const host = document.createElement("span");
  host.dataset.rcmpHost = "";
  host.setAttribute("data-testid", "rcmp-host");
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = createStyles();
  const popupHost = document.createElement("span");
  popupHost.dataset.rcmpPopup = "";
  const popupShadow = popupHost.attachShadow({ mode: "open" });
  const popupStyle = document.createElement("style");
  popupStyle.textContent = createPopupStyles();
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "trigger";
  trigger.textContent = "::+";
  trigger.setAttribute("aria-haspopup", "dialog");
  trigger.setAttribute("aria-expanded", "false");
  const customPanel = document.createElement("form");
  customPanel.className = "panel";
  customPanel.hidden = true;
  customPanel.setAttribute("role", "dialog");
  customPanel.setAttribute("aria-modal", "true");
  customPanel.setAttribute("aria-label", "");
  const panelHeader = document.createElement("div");
  panelHeader.className = "panel-header";
  const panelHeading = document.createElement("h2");
  panelHeader.append(panelHeading);
  const presetGroup = document.createElement("div");
  presetGroup.className = "presets";
  presetGroup.setAttribute("role", "group");
  const presetState = document.createElement("div");
  presetState.className = "preset-state";
  presetState.setAttribute("aria-live", "polite");

  const field = (labelText: string, type: "text" | "url" = "text") => {
    const wrapper = document.createElement("div");
    wrapper.className = "field";
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = type;
    const error = document.createElement("span");
    error.className = "field-error";
    error.setAttribute("aria-live", "polite");
    const labelNode = document.createTextNode(` ${labelText}`);
    label.append(input, labelNode);
    wrapper.append(label, error);
    return { wrapper, input, error, labelNode };
  };

  const titleField = field("");
  const titleInput = titleField.input;
  titleInput.autocomplete = "off";
  const colorWrapper = document.createElement("div");
  colorWrapper.className = "field";
  const colorLabel = document.createElement("span");
  colorLabel.className = "field-label";
  const colorRow = document.createElement("div");
  colorRow.className = "color-row";
  const colorPicker = document.createElement("input");
  colorPicker.type = "color";
  colorPicker.className = "color-picker";
  colorPicker.value = typeColors.note;
  const colorInput = document.createElement("input");
  colorInput.type = "text";
  colorInput.autocomplete = "off";
  colorInput.spellcheck = false;
  colorRow.append(colorPicker, colorInput);
  const colorError = document.createElement("span");
  colorError.className = "field-error";
  colorError.setAttribute("aria-live", "polite");
  colorWrapper.append(colorLabel, colorRow, colorError);

  const additional = document.createElement("details");
  const additionalSummary = document.createElement("summary");
  const mediaHint = document.createElement("p");
  mediaHint.className = "field-help";
  mediaHint.id = "media-compatibility-hint";
  const thumbField = field("");
  const imageField = field("");
  thumbField.input.inputMode = "url";
  imageField.input.inputMode = "url";
  const collapsedLabel = document.createElement("label");
  collapsedLabel.className = "check";
  const collapsedInput = document.createElement("input");
  collapsedInput.type = "checkbox";
  const collapsedText = document.createTextNode("");
  collapsedLabel.append(collapsedInput, collapsedText);
  additional.append(
    additionalSummary,
    mediaHint,
    thumbField.wrapper,
    imageField.wrapper,
    collapsedLabel,
  );
  const formStatus = document.createElement("div");
  formStatus.className = "status";
  formStatus.setAttribute("role", "status");
  formStatus.setAttribute("aria-live", "polite");
  const actions = document.createElement("div");
  actions.className = "actions";
  const insertCustomButton = document.createElement("button");
  insertCustomButton.type = "submit";
  actions.append(insertCustomButton);
  customPanel.append(
    panelHeader,
    presetGroup,
    presetState,
    titleField.wrapper,
    colorWrapper,
    additional,
    formStatus,
    actions,
  );
  const diagnostic = document.createElement("div");
  diagnostic.className = "diagnostic";
  diagnostic.setAttribute("role", "status");
  diagnostic.setAttribute("aria-live", "polite");
  let savedRange: Range | null = null;
  let savedTextareaSelection: { start: number; end: number } | null = null;
  let popupOpen = false;

  const insertTemplate = (template: string, placeholder: string) => {
    if (composer instanceof HTMLTextAreaElement) {
      insertIntoTextarea(composer, template, placeholder, savedTextareaSelection);
      savedTextareaSelection = null;
    } else {
      insertIntoContentEditable(composer, template, placeholder, savedRange);
      savedRange = null;
    }
  };

  let selectedType: CalloutType = "note";
  let presetModified = false;

  const updatePresetState = () => {
    const strings = uiCopy(options.locale());
    const label = strings.typeLabels[selectedType];
    presetState.textContent = presetModified ? `${label} · ${strings.modified}` : label;
    for (const button of presetGroup.querySelectorAll<HTMLButtonElement>("button[data-type]")) {
      button.setAttribute("aria-pressed", String(button.dataset.type === selectedType));
    }
  };

  const applyPreset = (type: CalloutType) => {
    selectedType = type;
    presetModified = false;
    titleInput.value = defaultTitles(options.locale())[type];
    colorInput.value = typeColors[type];
    colorPicker.value = typeColors[type];
    clearCustomErrors();
    updatePresetState();
  };

  const markPresetModified = () => {
    presetModified = true;
    updatePresetState();
  };

  const refreshCopy = () => {
    const strings = uiCopy(options.locale());
    trigger.title = strings.insert;
    trigger.setAttribute("aria-label", strings.insert);
    customPanel.setAttribute("aria-label", strings.formLabel);
    panelHeading.textContent = strings.customHeading;
    presetGroup.setAttribute("aria-label", strings.presetGroup);
    titleField.labelNode.textContent = ` ${strings.titleField}`;
    titleInput.setAttribute("aria-label", strings.titleField);
    colorLabel.textContent = strings.colorField;
    colorPicker.setAttribute("aria-label", `${strings.colorField} picker`);
    colorInput.setAttribute("aria-label", `${strings.colorField} HEX`);
    thumbField.labelNode.textContent = ` ${strings.thumbField}`;
    thumbField.input.setAttribute("aria-label", strings.thumbField);
    imageField.labelNode.textContent = ` ${strings.imageField}`;
    imageField.input.setAttribute("aria-label", strings.imageField);
    additionalSummary.textContent = strings.customAdditional;
    mediaHint.textContent = strings.mediaCompatibilityHint;
    imageField.input.setAttribute("aria-describedby", mediaHint.id);
    collapsedInput.setAttribute("aria-describedby", mediaHint.id);
    collapsedText.textContent = ` ${strings.collapsedField}`;
    insertCustomButton.textContent = strings.insertCustom;
    for (const button of presetGroup.querySelectorAll<HTMLButtonElement>("button[data-type]")) {
      const type = button.dataset.type as CalloutType;
      const label = button.querySelector<HTMLElement>(".label");
      if (label) label.textContent = strings.presetLabels[type];
      button.setAttribute("aria-label", strings.typeLabels[type]);
    }
    updatePresetState();
  };

  const closeMenu = (returnFocus = false) => {
    customPanel.hidden = true;
    popupHost.hidden = true;
    popupOpen = false;
    trigger.setAttribute("aria-expanded", "false");
    if (returnFocus) trigger.focus();
  };

  const placePopup = () => {
    const triggerRect = trigger.getBoundingClientRect();
    const gap = 8;
    const edge = 8;
    if (!customPanel.hidden) {
      customPanel.style.maxHeight = `${Math.max(160, window.innerHeight - edge * 2)}px`;
    }
    const popupRect = customPanel.getBoundingClientRect();
    const left = Math.min(
      Math.max(edge, triggerRect.left),
      Math.max(edge, window.innerWidth - popupRect.width - edge),
    );
    const top =
      triggerRect.top >= popupRect.height + gap + edge
        ? triggerRect.top - popupRect.height - gap
        : Math.min(triggerRect.bottom + gap, window.innerHeight - popupRect.height - edge);
    popupHost.style.left = `${left}px`;
    popupHost.style.top = `${Math.max(edge, top)}px`;
  };
  const popupResizeObserver = new ResizeObserver(() => {
    if (popupOpen) placePopup();
  });
  popupResizeObserver.observe(customPanel);

  for (const type of CALLOUT_TYPES) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "preset";
    button.dataset.type = type;
    button.setAttribute("aria-pressed", "false");
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = typeColors[type];
    const label = document.createElement("span");
    label.className = "label";
    button.append(dot, label);
    button.addEventListener("click", () => applyPreset(type));
    presetGroup.append(button);
  }

  const customFields = [titleField, thumbField, imageField];
  const syncMediaCompatibility = () => {
    const hasImage = imageField.input.value.trim().length > 0;
    const isCollapsed = collapsedInput.checked;
    imageField.input.disabled = isCollapsed;
    collapsedInput.disabled = hasImage;
  };
  const clearCustomErrors = () => {
    for (const item of customFields) {
      item.error.textContent = "";
      item.input.removeAttribute("aria-invalid");
    }
    colorError.textContent = "";
    colorInput.removeAttribute("aria-invalid");
    formStatus.textContent = "";
  };

  const resetCustomForm = () => {
    thumbField.input.value = "";
    imageField.input.value = "";
    collapsedInput.checked = false;
    additional.open = false;
    clearCustomErrors();
    applyPreset("note");
    syncMediaCompatibility();
  };

  colorPicker.addEventListener("input", () => {
    colorInput.value = colorPicker.value;
    colorError.textContent = "";
    colorInput.removeAttribute("aria-invalid");
    markPresetModified();
  });
  colorInput.addEventListener("input", () => {
    const value = colorInput.value.trim();
    if (hexColorPattern.test(value)) {
      const expanded =
        value.length === 4
          ? `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`
          : value;
      colorPicker.value = expanded;
      colorError.textContent = "";
      colorInput.removeAttribute("aria-invalid");
    }
    markPresetModified();
  });
  titleInput.addEventListener("input", markPresetModified);
  imageField.input.addEventListener("input", syncMediaCompatibility);
  collapsedInput.addEventListener("change", syncMediaCompatibility);
  const customFocusable = () =>
    [
      ...customPanel.querySelectorAll<HTMLElement>(
        'button, input, summary, [tabindex]:not([tabindex="-1"])',
      ),
    ].filter((element) => !element.hasAttribute("disabled") && element.getClientRects().length > 0);
  customPanel.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu(true);
      return;
    }
    if (event.key === "Tab") {
      const focusable = customFocusable();
      const root = customPanel.getRootNode();
      const activeElement =
        root instanceof ShadowRoot ? root.activeElement : document.activeElement;
      const current = focusable.indexOf(activeElement as HTMLElement);
      if (
        focusable.length > 0 &&
        (current === -1 ||
          (!event.shiftKey && current === focusable.length - 1) ||
          (event.shiftKey && current === 0))
      ) {
        event.preventDefault();
        focusable[event.shiftKey ? focusable.length - 1 : 0]?.focus();
      }
    }
  });
  customPanel.addEventListener("focusout", (event) => {
    const next = event.relatedTarget;
    if (!popupOpen || (next instanceof Node && customPanel.contains(next))) return;
    const previous = event.target instanceof HTMLElement ? event.target : customFocusable()[0];
    window.setTimeout(() => {
      if (popupOpen && !customPanel.contains(document.activeElement)) {
        previous?.focus();
      }
    }, 0);
  });
  for (const eventName of ["keyup", "keypress"] as const) {
    customPanel.addEventListener(eventName, (event) => event.stopPropagation());
  }
  customPanel.addEventListener("wheel", (event) => event.stopPropagation());
  customPanel.addEventListener("touchmove", (event) => event.stopPropagation());
  customPanel.addEventListener("submit", (event) => {
    event.preventDefault();
    const strings = uiCopy(options.locale());
    clearCustomErrors();
    const title = titleInput.value.trim();
    const color = colorInput.value.trim();
    const thumb = thumbField.input.value.trim();
    const image = imageField.input.value.trim();
    const collapsed = collapsedInput.checked;
    let firstInvalid: HTMLInputElement | undefined;
    let invalid = false;

    if (!title || /[\r\n]/.test(title)) {
      titleField.error.textContent = strings.requiredTitle;
      titleInput.setAttribute("aria-invalid", "true");
      firstInvalid = titleInput;
      invalid = true;
    }
    if (!hexColorPattern.test(color)) {
      colorError.textContent = strings.invalidCustomColor;
      colorInput.setAttribute("aria-invalid", "true");
      firstInvalid ??= colorInput;
      invalid = true;
    }
    for (const [value, item] of [[thumb, thumbField] as const, [image, imageField] as const]) {
      if (value && !isHttpsUrl(value)) {
        item.error.textContent = strings.invalidCustomUrl;
        item.input.setAttribute("aria-invalid", "true");
        firstInvalid ??= item.input;
        invalid = true;
      }
    }
    if (image && collapsed) {
      imageField.error.textContent = strings.incompatibleMedia;
      imageField.input.setAttribute("aria-invalid", "true");
      firstInvalid ??= imageField.input;
      invalid = true;
    }
    if (invalid) {
      formStatus.textContent = strings.customFormError;
      firstInvalid?.focus();
      return;
    }

    const customOptions: CustomCalloutOptions = { type: selectedType, title, color };
    if (thumb) customOptions.thumb = thumb;
    if (image) customOptions.image = image;
    if (collapsed) customOptions.collapsed = true;
    insertTemplate(buildCustomTemplate(customOptions, strings.placeholder), strings.placeholder);
    diagnostic.textContent = "";
    closeMenu();
  });
  trigger.addEventListener("mousedown", (event) => {
    event.preventDefault();
    if (composer instanceof HTMLTextAreaElement) {
      savedTextareaSelection = {
        start: composer.selectionStart ?? composer.value.length,
        end: composer.selectionEnd ?? composer.selectionStart ?? composer.value.length,
      };
    }
  });
  trigger.addEventListener("click", () => {
    refreshCopy();
    if (popupOpen) {
      closeMenu();
      return;
    }
    resetCustomForm();
    customPanel.hidden = false;
    popupHost.hidden = false;
    popupOpen = true;
    trigger.setAttribute("aria-expanded", "true");
    placePopup();
    presetGroup.querySelector<HTMLButtonElement>('[data-type="note"]')?.focus();
  });

  const closeOnOutsidePointer = (event: PointerEvent) => {
    const path = event.composedPath();
    if (popupOpen && !path.includes(host) && !path.includes(popupHost)) closeMenu();
  };
  document.addEventListener("pointerdown", closeOnOutsidePointer, true);
  window.addEventListener("resize", placePopup);
  window.addEventListener("scroll", placePopup, true);

  const rememberSelection = () => {
    if (composer instanceof HTMLTextAreaElement) {
      savedTextareaSelection = {
        start: composer.selectionStart ?? composer.value.length,
        end: composer.selectionEnd ?? composer.selectionStart ?? composer.value.length,
      };
      return;
    }
    const selection = window.getSelection();
    if (selection?.rangeCount && composer.contains(selection.anchorNode)) {
      savedRange = selection.getRangeAt(0).cloneRange();
    }
  };
  composer.addEventListener("keyup", rememberSelection);
  composer.addEventListener("mouseup", rememberSelection);
  composer.addEventListener("focus", rememberSelection);

  const showDiagnostics = (diagnostics: Diagnostic[]) => {
    diagnostic.textContent = diagnostics
      .slice(0, 3)
      .map((item) => formatDiagnostic(options.locale(), item))
      .join("\n");
  };

  const stopInvalidSubmission = (event: Event) => {
    const result = parseMessage(composerValue(composer), options.locale());
    if (result.kind !== "invalid") {
      showDiagnostics([]);
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    showDiagnostics(result.diagnostics);
    composer.focus();
  };

  composer.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        stopInvalidSubmission(event);
      }
    },
    true,
  );
  const form = composer.closest("form");
  const submissionRoot =
    form ?? composer.closest<HTMLElement>('footer[aria-label="Room composer"], .rc-message-box');
  form?.addEventListener("submit", stopInvalidSubmission, true);
  submissionRoot?.addEventListener(
    "click",
    (event) => {
      const button = (event.target as Element | null)?.closest<HTMLButtonElement>("button");
      const qaId = button?.dataset.qaId?.toLowerCase() ?? "";
      const label = button?.ariaLabel?.toLowerCase() ?? "";
      if (
        button &&
        (button.type === "submit" ||
          qaId.includes("send") ||
          label === "send" ||
          label === "отправить")
      ) {
        stopInvalidSubmission(event);
      }
    },
    true,
  );
  composer.addEventListener("input", () => {
    if (diagnostic.textContent) {
      const result = parseMessage(composerValue(composer), options.locale());
      showDiagnostics(result.kind === "invalid" ? result.diagnostics : []);
    }
  });

  shadow.append(style, trigger, diagnostic);
  popupShadow.append(popupStyle, customPanel);
  popupHost.hidden = true;
  document.body.append(popupHost);
  refreshCopy();
  placeTrigger(composer, host);

  return {
    composer,
    host,
    place() {
      placeTrigger(composer, host);
    },
    showDiagnostics,
    destroy() {
      document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
      window.removeEventListener("resize", placePopup);
      window.removeEventListener("scroll", placePopup, true);
      popupResizeObserver.disconnect();
      popupHost.remove();
      host.remove();
    },
  };
}

export function startComposerUi(options: ComposerUiOptions) {
  const controllers = new Map<HTMLElement, ComposerController>();
  let active: ComposerController | undefined;

  const scan = () => {
    for (const composer of document.querySelectorAll<HTMLElement>(composerSelector)) {
      const existing = controllers.get(composer);
      if (existing?.host.isConnected) {
        existing.place();
        continue;
      }
      const controller = createController(composer, options);
      controllers.set(composer, controller);
      composer.addEventListener("focus", () => {
        active = controller;
      });
      if (!active) active = controller;
    }
    for (const [composer, controller] of controllers) {
      if (!composer.isConnected) {
        controller.destroy();
        controllers.delete(composer);
        if (active === controller) active = undefined;
      }
    }
  };

  scan();
  const observer = new MutationObserver(scan);
  observer.observe(document.body, { childList: true, subtree: true });

  return {
    showDiagnostics(diagnostics: Diagnostic[]) {
      active?.showDiagnostics(diagnostics);
    },
    stop() {
      observer.disconnect();
      for (const controller of controllers.values()) controller.destroy();
      controllers.clear();
    },
  };
}
