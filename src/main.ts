import { detectLocale } from "./i18n";
import { waitForRocketChat } from "./rocket-chat";
import type { Diagnostic } from "./types";
import { startComposerUi } from "./ui";

function start(): void {
  const locale = () => detectLocale();
  let showDiagnostics: (diagnostics: Diagnostic[]) => void = () => undefined;
  waitForRocketChat({
    locale,
    onDiagnostics: (diagnostics) => showDiagnostics(diagnostics),
    onReady: () => {
      const ui = startComposerUi({ locale });
      showDiagnostics = ui.showDiagnostics;
    },
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
