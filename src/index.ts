import { config } from "./config";
import { startIntegration, stopIntegration, watchWindow } from "./integration";

let paneID: string | null = null;
const companion = {
  async startup() {
    await Promise.all([Zotero.initializationPromise, Zotero.uiReadyPromise]);
    paneID = await Zotero.PreferencePanes.register({
      pluginID: config.addonID,
      id: "llmthemescompanion-preferences",
      label: "LLM Themes Companion",
      src: `chrome://${config.addonRef}/content/preferences.xhtml`,
      image: `chrome://${config.addonRef}/content/icons/icon-48.png`,
    });
    startIntegration();
  },
  onWindowLoad(win: Window) {
    watchWindow(win);
  },
  shutdown() {
    stopIntegration();
    if (paneID) Zotero.PreferencePanes.unregister(paneID);
    paneID = null;
    delete Zotero.LLMThemesCompanion;
  },
};
Zotero.LLMThemesCompanion = companion;
