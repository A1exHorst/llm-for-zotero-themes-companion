import { config } from "./config";
import { createElement } from "./dom";
import {
  applyAppearance,
  disposeAppearance,
  disposeAppearanceDocument,
} from "./runtime";
import { registerAppearanceSettings } from "./settings";

// These are upstream-owned UI boundaries. No upstream methods are patched.
const ROOTS = [
  ".llm-panel:not(.llm-theme-preview)",
  "#llmforzotero-standalone-chat-root",
  "#llmforzotero-standalone-response-document-root",
  "#llmforzotero-standalone-plan-document-root",
  "#llmforzotero-standalone-mermaid-root",
  ".llm-modal-overlay",
  ".llm-mermaid-viewer",
  ".llm-web-source-popover",
  ".llm-paper-chip-menu",
  ".llm-paper-chip-cache-menu",
].join(",");
const CUSTOMIZATION = "#llmforzotero-pref-panel-customization";
const SETTINGS_ID = `${config.addonRef}-appearance-settings`;
const OWN_SETTINGS_ID = `${config.addonRef}-standalone-appearance-settings`;
const watched = new Map<
  Document,
  { observer: MutationObserver; cleanup: () => void }
>();
const windows = new Map<Window, () => void>();
const settings = new Map<
  HTMLElement,
  { dispose: () => void; inserted: boolean }
>();
let active = false;

function ownSettings(
  doc: Document,
  host: HTMLElement,
  inserted: boolean,
): void {
  if (settings.has(host)) return;
  const dispose = registerAppearanceSettings(doc, host);
  if (dispose) settings.set(host, { dispose, inserted });
}

function inspect(node: Element): void {
  if (!node.isConnected) return;
  // Do not treat our sample chat or generated controls as upstream surfaces.
  if (node.id === OWN_SETTINGS_ID) {
    ownSettings(node.ownerDocument, node as HTMLElement, false);
    return;
  }
  if (node.closest(`#${SETTINGS_ID},#${OWN_SETTINGS_ID}`)) return;
  if (node.matches(ROOTS)) applyAppearance(node as HTMLElement);
  if (node.childElementCount)
    for (const root of node.querySelectorAll<HTMLElement>(ROOTS))
      applyAppearance(root);
  const panel = node.matches(CUSTOMIZATION)
    ? node
    : node.querySelector(CUSTOMIZATION);
  if (panel && !panel.querySelector(`#${SETTINGS_ID}`)) {
    const host = createElement(panel.ownerDocument, "section", "", {
      id: SETTINGS_ID,
    });
    panel.prepend(host);
    ownSettings(panel.ownerDocument, host, true);
  }
  const ownHost = node.querySelector<HTMLElement>(`#${OWN_SETTINGS_ID}`);
  if (ownHost) ownSettings(node.ownerDocument, ownHost, false);
}

export function watchDocument(doc: Document): void {
  if (watched.has(doc) || !doc.documentElement) return;
  const win = doc.defaultView;
  if (!win) return;
  const Observer = (
    win as unknown as { MutationObserver: typeof MutationObserver }
  ).MutationObserver;
  const observer = new Observer((mutations) => {
    if (!active) return;
    const added = new Set<Element>();
    for (const mutation of mutations)
      for (const node of mutation.addedNodes)
        if (node.nodeType === 1) added.add(node as Element);
    for (const node of added) {
      let parent = node.parentElement;
      while (parent && !added.has(parent)) parent = parent.parentElement;
      if (!parent) inspect(node);
    }
    for (const [host, mounted] of settings)
      if (host.ownerDocument === doc && !host.isConnected) {
        mounted.dispose();
        settings.delete(host);
      }
  });
  const cleanup = () => {
    observer.disconnect();
    watched.delete(doc);
    win.removeEventListener("unload", cleanup);
    for (const [host, mounted] of settings)
      if (host.ownerDocument === doc) {
        mounted.dispose();
        if (mounted.inserted) host.remove();
        settings.delete(host);
      }
    disposeAppearanceDocument(doc);
  };
  watched.set(doc, { observer, cleanup });
  observer.observe(doc.documentElement, { childList: true, subtree: true });
  win.addEventListener("unload", cleanup, { once: true });
  inspect(doc.documentElement);
  const ownHost = doc.getElementById(OWN_SETTINGS_ID) as HTMLElement | null;
  if (ownHost) ownSettings(doc, ownHost, false);
}

function supported(doc: Document): boolean {
  return [
    "chrome://zotero/",
    "chrome://llmforzotero/",
    `chrome://${config.addonRef}/`,
  ].some((prefix) => doc.documentURI.startsWith(prefix));
}

export function watchWindow(win: Window): void {
  if (!active || windows.has(win)) return;
  const inspectWindow = () => {
    if (win.closed || !active) return;
    if (supported(win.document)) watchDocument(win.document);
    // Reader subdocuments are separate browsing contexts on some Zotero builds.
    for (let i = 0; i < win.frames.length; i++) {
      try {
        if (supported(win.frames[i].document)) watchWindow(win.frames[i]);
      } catch {
        /* content frame */
      }
    }
  };
  const load = () => inspectWindow();
  const cleanup = () => {
    windows.delete(win);
    win.removeEventListener("load", load, true);
  };
  windows.set(win, cleanup);
  win.addEventListener("load", load, true);
  // New chrome windows first unload about:blank. Keep the outer-window load
  // listener until domwindowclosed so that the real document is discovered.
  inspectWindow();
}

const windowObserver = {
  observe(subject: Window, topic: string) {
    if (topic === "domwindowopened") watchWindow(subject);
    if (topic === "domwindowclosed") windows.get(subject)?.();
  },
};

export function startIntegration(): void {
  if (active) return;
  active = true;
  Services.ww.registerNotification(windowObserver);
  const enumerator = Services.wm.getEnumerator(null);
  while (enumerator.hasMoreElements())
    watchWindow(enumerator.getNext() as Window);
}

export function stopIntegration(): void {
  if (!active) return;
  active = false;
  Services.ww.unregisterNotification(windowObserver);
  for (const cleanup of [...windows.values()]) cleanup();
  for (const { cleanup } of [...watched.values()]) cleanup();
  disposeAppearance();
}
