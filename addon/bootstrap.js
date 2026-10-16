var chromeHandle;
function install() {}
function uninstall() {}
async function startup({ rootURI }) {
  const aomStartup = Components.classes[
    "@mozilla.org/addons/addon-manager-startup;1"
  ].getService(Components.interfaces.amIAddonManagerStartup);
  chromeHandle = aomStartup.registerChrome(
    Services.io.newURI(rootURI + "manifest.json"),
    [["content", "llmthemescompanion", rootURI + "content/"]],
  );
  const context = { Zotero, Services, ChromeUtils };
  Services.scriptloader.loadSubScript(
    rootURI + "content/companion.js",
    context,
  );
  await Zotero.LLMThemesCompanion.startup();
}
function onMainWindowLoad({ window }) {
  Zotero.LLMThemesCompanion?.onWindowLoad(window);
}
function shutdown(_data, reason) {
  if (reason === APP_SHUTDOWN) return;
  Zotero.LLMThemesCompanion?.shutdown();
  chromeHandle?.destruct();
  chromeHandle = null;
}
