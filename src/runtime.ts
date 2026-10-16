import { config } from "./config";
import { HTML_NS } from "./dom";
import { THEMES, themeVariables } from "./themes";
import { compileCustomCss } from "./customCss";

export const THEME_PREF = `${config.prefsPrefix}.appearanceTheme`;
export const CSS_PREF = `${config.prefsPrefix}.appearanceCustomCss`;
const documents = new Map<Document, () => void>();
let observers: unknown[] = [];
const styleIDs = [
  "llm-themes-companion-components",
  "llm-themes-companion-tokens",
  "llm-themes-companion-custom",
];

export function selectedTheme(): string {
  const value = Zotero.Prefs.get(THEME_PREF, true);
  return THEMES.some((theme) => theme.id === value)
    ? String(value)
    : "original";
}

function refresh(doc: Document): void {
  for (const root of doc.querySelectorAll<HTMLElement>(
    "[data-llm-companion-root]:not([data-llm-theme-preview])",
  ))
    root.dataset.llmCompanionTheme = selectedTheme();
  const custom = doc.getElementById(styleIDs[2]);
  if (!custom) return;
  try {
    custom.textContent = compileCustomCss(
      doc,
      String(Zotero.Prefs.get(CSS_PREF, true) || ""),
    );
  } catch {
    custom.textContent = "";
  }
}

export function registerAppearanceDocument(doc: Document): void {
  if (documents.has(doc)) return;
  const parent = doc.head || doc.documentElement;
  const link = doc.createElementNS(HTML_NS, "link") as HTMLLinkElement;
  link.id = styleIDs[0];
  link.rel = "stylesheet";
  link.href = `chrome://${config.addonRef}/content/themes.css`;
  const tokens = doc.createElementNS(HTML_NS, "style");
  tokens.id = styleIDs[1];
  tokens.textContent = THEMES.filter((theme) => theme.id !== "original")
    .map(
      (theme) =>
        `[data-llm-companion-root][data-llm-companion-theme="${theme.id}"] {${themeVariables(theme)}}`,
    )
    .join("\n");
  const custom = doc.createElementNS(HTML_NS, "style");
  custom.id = styleIDs[2];
  parent.append(link, tokens, custom);
  const dispose = () => disposeAppearanceDocument(doc);
  documents.set(doc, dispose);
  doc.defaultView?.addEventListener("unload", dispose, { once: true });
  if (!observers.length)
    observers = [THEME_PREF, CSS_PREF].map((key) =>
      Zotero.Prefs.registerObserver(
        key,
        () => {
          for (const target of documents.keys()) refresh(target);
        },
        true,
      ),
    );
  refresh(doc);
}

export function applyAppearance(root: HTMLElement): void {
  registerAppearanceDocument(root.ownerDocument);
  root.dataset.llmCompanionRoot = "";
  root.dataset.llmCompanionTheme = selectedTheme();
}

export function disposeAppearanceDocument(doc: Document): void {
  const dispose = documents.get(doc);
  if (!dispose) return;
  documents.delete(doc);
  doc.defaultView?.removeEventListener("unload", dispose);
  for (const id of styleIDs) doc.getElementById(id)?.remove();
  for (const root of doc.querySelectorAll("[data-llm-companion-root]")) {
    root.removeAttribute("data-llm-companion-root");
    root.removeAttribute("data-llm-companion-theme");
  }
}

export function disposeAppearance(): void {
  for (const doc of [...documents.keys()]) disposeAppearanceDocument(doc);
  for (const observer of observers) Zotero.Prefs.unregisterObserver(observer);
  observers = [];
}
