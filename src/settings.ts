import { config } from "./config";
import { createElement } from "./dom";
import { compileCustomCss } from "./customCss";
import { THEMES } from "./themes";
import {
  CSS_PREF,
  THEME_PREF,
  registerAppearanceDocument,
  selectedTheme,
} from "./runtime";

/** Preview is local to settings; only Apply changes the persisted selection. */
export function registerAppearanceSettings(
  doc: Document,
  host = doc.getElementById(`${config.addonRef}-appearance-settings`),
): (() => void) | undefined {
  if (!host || host.childElementCount) return;
  registerAppearanceDocument(doc);
  host.classList.add("llm-appearance-settings");
  const heading = createElement(doc, "h3", "", { textContent: "Appearance" });
  const hint = createElement(doc, "p", "", {
    textContent:
      "Explore a palette, preview it below, then apply it to every open chat. Your choice is saved automatically.",
  });
  const gallery = createElement(doc, "div", "llm-theme-gallery");
  gallery.setAttribute("role", "group");
  gallery.setAttribute("aria-label", "Theme previews");
  const preview = createElement(doc, "div", "llm-panel llm-theme-preview");
  preview.dataset.llmCompanionRoot = "";
  preview.dataset.llmThemePreview = "";
  const title = createElement(doc, "strong");
  const subtitle = createElement(doc, "p");
  const toolbar = createElement(doc, "div", "llm-header");
  toolbar.append(
    createElement(doc, "span", "", { textContent: "✦ Research companion" }),
  );
  const user = createElement(doc, "div", "llm-bubble user", {
    textContent: "What connects these papers?",
  });
  const response = createElement(doc, "div", "llm-bubble assistant", {
    textContent: "A clearer perspective, in your own colors.",
  });
  const code = createElement(doc, "pre", "llm-codeblock");
  const keyword = createElement(doc, "span", "hljs-keyword", {
    textContent: "const ",
  });
  code.append(
    keyword,
    doc.createTextNode("insight = "),
    createElement(doc, "span", "hljs-string", {
      textContent: '"a fresh perspective"',
    }),
  );
  const input = createElement(doc, "input", "", {
    placeholder: "Ask a follow-up…",
    readOnly: true,
  });
  input.setAttribute("aria-label", "Sample composer");
  const sampleButton = createElement(doc, "button", "llm-modal-primary", {
    type: "button",
    textContent: "Send",
  });
  sampleButton.tabIndex = -1;
  preview.append(toolbar, user, response, code, input, sampleButton);
  const actions = createElement(doc, "div", "llm-theme-actions");
  const apply = createElement(doc, "button", "", {
    type: "button",
    textContent: "Apply theme",
  });
  const restore = createElement(doc, "button", "", {
    type: "button",
    textContent: "Restore original",
  });
  const status = createElement(doc, "p", "llm-appearance-status");
  status.setAttribute("role", "status");
  let candidate = selectedTheme();
  const update = () => {
    const theme = THEMES.find((entry) => entry.id === candidate) || THEMES[0];
    preview.dataset.llmCompanionTheme = theme.id;
    title.textContent = theme.name;
    subtitle.textContent = theme.description;
    apply.disabled = candidate === selectedTheme();
    for (const card of Array.from(
      gallery.querySelectorAll<HTMLButtonElement>("button"),
    ) as HTMLButtonElement[]) {
      card.setAttribute(
        "aria-pressed",
        String(card.dataset.theme === candidate),
      );
    }
  };
  for (const theme of THEMES) {
    const card = createElement(doc, "button", "llm-theme-card", {
      type: "button",
      title: theme.description,
    });
    card.dataset.theme = theme.id;
    card.setAttribute("aria-label", `${theme.name}: ${theme.description}`);
    const swatch = createElement(doc, "span", "llm-theme-swatch");
    const colors = ["bg", "surface", "accent", "secondary"];
    for (const color of colors) {
      const chip = createElement(doc, "i");
      chip.style.background =
        (color === "bg" ? theme.tokens["--llm-theme-background"] : "") ||
        theme.tokens[`--llm-theme-${color}`] ||
        ["#f4f4f4", "#fff", "#3584e4", "#808080"][colors.indexOf(color)];
      swatch.append(chip);
    }
    card.append(
      swatch,
      createElement(doc, "span", "", { textContent: theme.name }),
    );
    card.addEventListener("click", () => {
      candidate = theme.id;
      update();
    });
    gallery.append(card);
  }
  apply.addEventListener("click", () => {
    Zotero.Prefs.set(THEME_PREF, candidate, true);
    update();
    status.textContent = `${THEMES.find((theme) => theme.id === candidate)?.name} applied to all chats.`;
  });
  restore.addEventListener("click", () => {
    candidate = "original";
    Zotero.Prefs.set(THEME_PREF, candidate, true);
    update();
    status.textContent =
      "Original theme restored. Custom CSS can be cleared separately below.";
  });
  actions.append(apply, restore);
  const cssLabel = createElement(doc, "label", "", {
    textContent: "Custom CSS",
    htmlFor: `${host.id}-css-editor`,
  });
  const cssHelp = createElement(doc, "p", "", {
    textContent:
      "Overrides the selected theme in plugin surfaces only. Use :root for tokens or selectors such as .llm-bubble.user. Use separate rules: nesting, CSS escapes, imports, external resources and global at-rules are unsupported. Apply again after editing an imported file.",
  });
  const editor = createElement(doc, "textarea", "llm-css-editor", {
    id: `${host.id}-css-editor`,
    rows: 7,
    spellcheck: false,
    value: String(Zotero.Prefs.get(CSS_PREF, true) || ""),
    placeholder:
      ":root { --llm-theme-accent: #a78bfa; }\n.llm-bubble.user { border-radius: 18px; }",
  });
  const cssActions = createElement(doc, "div", "llm-theme-actions");
  const save = createElement(doc, "button", "", {
    type: "button",
    textContent: "Apply CSS",
  });
  const clear = createElement(doc, "button", "", {
    type: "button",
    textContent: "Clear CSS",
  });
  const load = createElement(doc, "button", "", {
    type: "button",
    textContent: "Import CSS file…",
  });
  const file = createElement(doc, "input", "", {
    type: "file",
    accept: ".css,text/css",
    hidden: true,
  });
  load.addEventListener("click", () => file.click());
  file.addEventListener("change", async () => {
    const selected = file.files?.[0];
    if (!selected) return;
    if (selected.size > 100_000) {
      status.textContent = "Choose a CSS file smaller than 100 KB.";
      return;
    }
    try {
      editor.value = await selected.text();
      status.textContent =
        "CSS imported into the editor. Choose Apply CSS to save it.";
    } catch {
      status.textContent = "The CSS file could not be read.";
    }
    file.value = "";
  });
  save.addEventListener("click", () => {
    try {
      compileCustomCss(doc, editor.value);
      Zotero.Prefs.set(CSS_PREF, editor.value, true);
      status.textContent = "Custom CSS saved and applied to all chats.";
    } catch (error) {
      status.textContent =
        error instanceof Error ? error.message : "Could not apply CSS.";
    }
  });
  clear.addEventListener("click", () => {
    editor.value = "";
    Zotero.Prefs.set(CSS_PREF, "", true);
    status.textContent = "Custom CSS cleared.";
  });
  cssActions.append(save, load, clear, file);
  host.append(
    heading,
    hint,
    gallery,
    title,
    subtitle,
    preview,
    actions,
    cssLabel,
    cssHelp,
    editor,
    cssActions,
    status,
  );
  const observer = Zotero.Prefs.registerObserver(THEME_PREF, update, true);
  update();
  return () => {
    Zotero.Prefs.unregisterObserver(observer);
    host.replaceChildren();
    host.classList.remove("llm-appearance-settings");
  };
}
