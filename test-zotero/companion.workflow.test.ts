import { assert } from "chai";
// Replaced by the integration runner with the independent project's path.
// @ts-ignore build-time fixture import
import { THEMES } from "__COMPANION_THEMES__";
const XPI = "__COMPANION_XPI__";
const ID = "llm-themes-companion@local.zotero";
const UPSTREAM_ID = "zotero-llm@github.com.yilewang";
const PREFIX = "extensions.zotero.llmthemescompanion.";
const UPSTREAM_PREFIX = "extensions.zotero.llmforzotero.";

describe("independent companion with unmodified LLM for Zotero", function () {
  this.timeout(60000);
  let manager: any;
  let installed: any;
  let api: any;
  let fixture: any;
  let panel: HTMLElement;
  let standalone: Document;
  let preferences: Window | undefined;
  const saved = new Map<string, unknown>();
  let originalHooks: any;
  const catalog = ["test-model-a", "test-model-b"].map((name) => ({
    id: name,
    model: name,
    displayName: name,
    description: "",
    hidden: false,
    supportedReasoningEfforts: ["low", "high"],
  }));
  async function waitFor(label: string, check: () => boolean) {
    for (let i = 0; i < 200; i++) {
      if (check()) return;
      await Zotero.Promise.delay(30);
    }
    throw new Error(`Timed out: ${label}`);
  }
  async function pref(key: string, value: string) {
    Zotero.Prefs.set(PREFIX + key, value, true);
    await Zotero.Promise.delay(40);
  }
  function root(doc: Document) {
    return doc.querySelector<HTMLElement>(
      ".llm-panel:not(.llm-theme-preview)",
    )!;
  }
  function normalize(doc: Document, value: string) {
    const probe = doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "span",
    ) as HTMLElement;
    probe.style.color = value;
    doc.documentElement.appendChild(probe);
    const color = doc.defaultView!.getComputedStyle(probe).color;
    probe.remove();
    return color;
  }
  before(async function () {
    manager = ChromeUtils.importESModule(
      "resource://gre/modules/AddonManager.sys.mjs",
    ).AddonManager;
    api = Zotero.LLMForZotero.api.workflowTest;
    originalHooks = Zotero.LLMForZotero.hooks.onMainWindowLoad;
    await api.reset();
    api.configurePermissionCatalogs();
    const prefs: Record<string, string | boolean> = {
      [UPSTREAM_PREFIX + "enableCodexAppServerMode"]: true,
      [UPSTREAM_PREFIX + "conversationSystem"]: "codex",
      [UPSTREAM_PREFIX + "codexAppServerModel"]: "test-model-a",
      [UPSTREAM_PREFIX + "codexAppServerReasoning"]: "auto",
      [UPSTREAM_PREFIX + "codexAppServerPath"]: "/workflow/codex",
      [PREFIX + "appearanceTheme"]: "midnight",
      [PREFIX + "appearanceCustomCss"]: "",
    };
    for (const [key, value] of Object.entries(prefs)) {
      saved.set(key, Zotero.Prefs.get(key, true));
      Zotero.Prefs.set(key, value, true);
    }
    api.configureCodexModelCatalogs([{ models: catalog }]);
    fixture = await api.createPaperWithPdfFixture({
      title: "Companion compatibility",
      pdfTitle: "Theme fixture",
    });
    const result = await api.renderPanelForItem(fixture.parentItemId);
    const host = Zotero.getMainWindow().document.querySelector(
      `[data-workflow-panel-id="${result.panelId}"]`,
    ) as HTMLElement;
    host.style.cssText =
      "position:fixed;left:40px;top:40px;width:600px;height:600px;z-index:100000;overflow:hidden";
    panel = host.querySelector<HTMLElement>(".llm-panel")!;
    assert.isFalse(
      panel.hasAttribute("data-llm-theme-root"),
      "original plugin has no fork theme hooks",
    );
    const opened = await api.openStandaloneForItem(fixture.parentItemId);
    if (opened.conversationSystem !== "codex")
      await api.clickStandaloneSystemToggle("codex");
    const windows = Services.wm.getEnumerator(null);
    while (windows.hasMoreElements()) {
      const doc = (windows.getNext() as Window).document;
      if (doc.getElementById("llmforzotero-standalone-chat-root"))
        standalone = doc;
    }
    assert.isOk(
      standalone,
      "unmodified standalone chat opened before companion starts",
    );
    const file = Components.classes["@mozilla.org/file/local;1"].createInstance(
      Components.interfaces.nsIFile,
    );
    file.initWithPath(XPI);
    try {
      installed = await manager.installTemporaryAddon(file);
    } catch (error) {
      throw new Error(
        `Companion installation failed: ${(error as any).message}; ${JSON.stringify((error as any).additionalErrors)}; Zotero ${Zotero.version}; app ${Services.appinfo.version}`,
      );
    }
    await waitFor(
      "companion attaches existing sidebar and standalone",
      () =>
        panel.dataset.llmCompanionTheme === "midnight" &&
        root(standalone).dataset.llmCompanionTheme === "midnight",
    );
  });
  after(async function () {
    preferences?.close();
    if (installed) await installed.uninstall();
    if (api) await api.reset();
    if (fixture) await api.cleanupFixture(fixture);
    for (const [key, value] of saved) {
      if (value === undefined) Zotero.Prefs.clear(key, true);
      else Zotero.Prefs.set(key, value, true);
    }
  });
  it("installs beside the original with its own ID and without patching upstream hooks", async function () {
    assert.equal(installed.id, ID);
    assert.isTrue((await manager.getAddonByID(UPSTREAM_ID)).isActive);
    assert.isTrue((await manager.getAddonByID(ID)).isActive);
    assert.strictEqual(
      Zotero.LLMForZotero.hooks.onMainWindowLoad,
      originalHooks,
    );
  });
  it("renders every palette in existing original sidebar and standalone surfaces", async function () {
    assert.lengthOf(
      THEMES.filter((theme: any) => theme.id !== "original"),
      20,
    );
    for (const theme of THEMES.filter(
      (theme: any) => theme.id !== "original",
    )) {
      await pref("appearanceTheme", theme.id);
      for (const node of [panel, root(standalone)]) {
        const doc = node.ownerDocument;
        assert.equal(node.dataset.llmCompanionTheme, theme.id);
        assert.equal(
          doc.defaultView!.getComputedStyle(node).color,
          normalize(doc, theme.tokens["--llm-theme-text"]),
          theme.name,
        );
      }
    }
  });
  it("keeps the original model and reasoning pickers selectable under Aurora Glass", async function () {
    await pref("appearanceTheme", "glass");
    for (const surface of [panel, root(standalone)]) {
      const doc = surface.ownerDocument;
      (surface.querySelector("#llm-model-toggle") as HTMLButtonElement).click();
      await waitFor(
        "original model catalog",
        () =>
          !!surface.querySelector(
            '[data-entry-id="codex_app_server::test-model-b"]',
          ),
      );
      const choice = surface.querySelector(
        '[data-entry-id="codex_app_server::test-model-b"]',
      ) as HTMLButtonElement;
      const bounds = choice.getBoundingClientRect();
      const hit = doc.elementFromPoint(
        bounds.left + bounds.width / 2,
        bounds.top + bounds.height / 2,
      );
      assert.isTrue(
        choice === hit || (!!hit && choice.contains(hit)),
        "model option receives pointer input",
      );
      choice.click();
      (
        surface.querySelector("#llm-reasoning-toggle") as HTMLButtonElement
      ).click();
      const high = Array.from(
        surface.querySelectorAll<HTMLButtonElement>(".llm-reasoning-option"),
      ).find((node) => node.textContent?.trim() === "High")!;
      assert.isOk(high, "original reasoning choices present");
      const reasoningBounds = high.getBoundingClientRect();
      const reasoningHit = doc.elementFromPoint(
        reasoningBounds.left + reasoningBounds.width / 2,
        reasoningBounds.top + reasoningBounds.height / 2,
      );
      assert.isTrue(
        high === reasoningHit ||
          (!!reasoningHit && high.contains(reasoningHit)),
        "reasoning option receives pointer input",
      );
      high.click();
      assert.include(
        surface.querySelector("#llm-model-toggle")!.textContent,
        "test-model-b",
      );
      assert.equal(
        (surface.querySelector("#llm-reasoning-toggle") as HTMLElement).dataset
          .reasoningLabel,
        "High",
      );
    }
  });
  it("injects a full-height gallery into native Customization and provides an independent settings pane", async function () {
    preferences = Zotero.Utilities.Internal.openPreferences(
      "llmforzotero-preferences",
    ) as Window;
    try {
      await waitFor(
        "injected original customization gallery",
        () =>
          !!preferences!.document.querySelector(
            "#llmthemescompanion-appearance-settings .llm-theme-card",
          ),
      );
    } catch (error) {
      throw new Error(
        `${String(error)}; document=${preferences.document.documentURI}; customization=${!!preferences.document.querySelector("#llmforzotero-pref-panel-customization")}; host=${!!preferences.document.getElementById("llmthemescompanion-appearance-settings")}; errors=${JSON.stringify(
          Services.console
            .getMessageArray()
            .map((entry: any) => String(entry.message))
            .filter((entry: string) => entry.includes("companion.js"))
            .slice(-4),
        )}`,
      );
    }
    await waitFor("visible customization", () => {
      (
        preferences!.document.querySelector(
          '[data-pref-tab="customization"]',
        ) as HTMLButtonElement
      ).click();
      return (
        (preferences!.document
          .querySelector(".llm-theme-card")
          ?.getBoundingClientRect().height || 0) > 0
      );
    });
    for (const width of [800, 1100]) {
      preferences.resizeTo(width, 900);
      await Zotero.Promise.delay(100);
      const cards = Array.from(
        preferences.document.querySelectorAll<HTMLButtonElement>(
          "#llmthemescompanion-appearance-settings .llm-theme-card",
        ),
      );
      assert.lengthOf(cards, THEMES.length);
      for (const card of cards) {
        const bounds = card.getBoundingClientRect();
        assert.isAtLeast(bounds.height, 84);
        assert.isAtLeast(
          card.querySelector(".llm-theme-swatch")!.getBoundingClientRect()
            .height,
          30,
        );
        assert.isAtMost(
          card.lastElementChild!.getBoundingClientRect().bottom,
          bounds.bottom,
        );
      }
    }
    const host = preferences.document.getElementById(
      "llmthemescompanion-appearance-settings",
    )!;
    (host.querySelector('[data-theme="emerald"]') as HTMLButtonElement).click();
    assert.equal(panel.dataset.llmCompanionTheme, "glass", "preview is local");
    (
      Array.from(host.querySelectorAll("button")).find(
        (node) => node.textContent === "Apply theme",
      ) as HTMLButtonElement
    ).click();
    await waitFor(
      "apply updates original windows",
      () =>
        panel.dataset.llmCompanionTheme === "emerald" &&
        root(standalone).dataset.llmCompanionTheme === "emerald",
    );
    Zotero.Utilities.Internal.openPreferences("llmthemescompanion-preferences");
    await waitFor(
      "companion's own preferences",
      () =>
        !!preferences!.document.querySelector(
          "#llmthemescompanion-standalone-appearance-settings .llm-theme-card",
        ),
    );
  });
  it("applies editor CSS above the palette while blocking escape into Zotero", async function () {
    Zotero.Utilities.Internal.openPreferences("llmforzotero-preferences");
    const doc = preferences!.document;
    const host = doc.getElementById("llmthemescompanion-appearance-settings")!;
    const editor = host.querySelector("textarea")!;
    editor.value =
      ":root { --llm-theme-accent: #123456; } .llm-header { color: rgb(255,0,0) !important; } & ~ * { outline: 9px solid red !important; }";
    (
      Array.from(host.querySelectorAll("button")).find(
        (node) => node.textContent === "Apply CSS",
      ) as HTMLButtonElement
    ).click();
    await waitFor(
      "custom CSS live on original plugin",
      () =>
        panel.ownerDocument.defaultView!.getComputedStyle(
          panel.querySelector(".llm-header")!,
        ).color === "rgb(255, 0, 0)",
    );
    assert.equal(
      panel.ownerDocument
        .defaultView!.getComputedStyle(panel)
        .getPropertyValue("--llm-theme-accent")
        .trim(),
      "#123456",
    );
    assert.notEqual(
      panel.ownerDocument.defaultView!.getComputedStyle(panel.parentElement!)
        .outlineWidth,
      "9px",
    );
    const valid = Zotero.Prefs.get(PREFIX + "appearanceCustomCss", true);
    editor.value = '@import "https://example.invalid/x.css";';
    (
      Array.from(host.querySelectorAll("button")).find(
        (node) => node.textContent === "Apply CSS",
      ) as HTMLButtonElement
    ).click();
    assert.equal(
      Zotero.Prefs.get(PREFIX + "appearanceCustomCss", true),
      valid,
      "invalid CSS leaves saved styles intact",
    );
    (
      Array.from(host.querySelectorAll("button")).find(
        (node) => node.textContent === "Clear CSS",
      ) as HTMLButtonElement
    ).click();
    await waitFor(
      "clear CSS",
      () => !Zotero.Prefs.get(PREFIX + "appearanceCustomCss", true),
    );
  });
  it("imports CSS files into the editor and applies them only after saving", async function () {
    const host = preferences!.document.getElementById(
      "llmthemescompanion-appearance-settings",
    )!;
    const imported = ":root { --llm-theme-accent: #654321; }";
    const native = preferences as any;
    const transfer = new native.DataTransfer();
    transfer.items.add(
      new native.File([imported], "test-theme.css", { type: "text/css" }),
    );
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    input.files = transfer.files;
    input.dispatchEvent(new native.Event("change"));
    await waitFor(
      "CSS file read",
      () => host.querySelector("textarea")!.value === imported,
    );
    assert.equal(
      Zotero.Prefs.get(PREFIX + "appearanceCustomCss", true),
      "",
      "import does not auto-save",
    );
    (
      Array.from(host.querySelectorAll("button")).find(
        (node) => node.textContent === "Apply CSS",
      ) as HTMLButtonElement
    ).click();
    await waitFor(
      "imported CSS applied",
      () =>
        panel.ownerDocument
          .defaultView!.getComputedStyle(panel)
          .getPropertyValue("--llm-theme-accent")
          .trim() === "#654321",
    );
    (
      Array.from(host.querySelectorAll("button")).find(
        (node) => node.textContent === "Clear CSS",
      ) as HTMLButtonElement
    ).click();
  });
  it("discovers a newly opened upstream window and dynamic portal roots", async function () {
    const main = Zotero.getMainWindow();
    const extra = main.openDialog(
      "chrome://llmforzotero/content/standaloneResponseDocument.xhtml",
      "companion-late-window",
      "chrome,dialog=no,width=800,height=650",
    ) as Window;
    try {
      await waitFor(
        "late document root",
        () =>
          !!extra.document
            .getElementById("llmforzotero-standalone-response-document-root")
            ?.hasAttribute("data-llm-companion-root"),
      );
      const overlay = extra.document.createElementNS(
        "http://www.w3.org/1999/xhtml",
        "div",
      ) as HTMLElement;
      overlay.className = "llm-modal-overlay";
      extra.document.documentElement.appendChild(overlay);
      await waitFor(
        "portal inherits companion theme",
        () => overlay.dataset.llmCompanionTheme === "emerald",
      );
      overlay.remove();
    } finally {
      extra.close();
    }
  });
  it("restores the original on disable and saved appearance on enable without touching upstream", async function () {
    await installed.disable();
    assert.isFalse(panel.hasAttribute("data-llm-companion-root"));
    assert.isNull(
      panel.ownerDocument.getElementById("llm-themes-companion-components"),
    );
    assert.isNull(
      preferences!.document.getElementById(
        "llmthemescompanion-appearance-settings",
      ),
    );
    assert.strictEqual(
      Zotero.LLMForZotero.hooks.onMainWindowLoad,
      originalHooks,
    );
    assert.isTrue((await manager.getAddonByID(UPSTREAM_ID)).isActive);
    await installed.enable();
    await waitFor(
      "enable restores existing original windows",
      () =>
        panel.dataset.llmCompanionTheme === "emerald" &&
        root(standalone).dataset.llmCompanionTheme === "emerald",
    );
    await pref("appearanceTheme", "original");
    assert.equal(panel.dataset.llmCompanionTheme, "original");
  });
});
