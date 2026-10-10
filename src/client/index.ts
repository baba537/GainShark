import { PluginSlot } from "@sharkord/plugin-sdk";
import type { TPluginComponentsMapBySlotId } from "@sharkord/plugin-sdk/client";
import { PLUGIN_ID } from "./constants";
import { getEngine } from "./engine";
import { SettingsPage } from "./ui/settings-page";
import { TopbarButton } from "./ui/topbar-button";
import { UserPopoverButton } from "./ui/user-popover-button";

const engine = getEngine();
const store = window.__SHARKORD_STORE__;

// the engine runs while the server has the plugin loaded. Disabling it in the
// server settings restores Sharkord's normal audio without a reload.
const syncEngine = () => {
  if (window.__GAINSHARK_ENGINE__ !== engine) return;

  const loaded = store
    .getState()
    .plugins.some((plugin) => plugin.pluginId === PLUGIN_ID);

  if (loaded) {
    engine.start();
  } else {
    engine.stop();
  }
};

store.subscribe(syncEngine);
syncEngine();

const components: TPluginComponentsMapBySlotId = {
  [PluginSlot.TOPBAR_RIGHT]: [TopbarButton],
  [PluginSlot.USER_POPOVER]: [UserPopoverButton],
  [PluginSlot.USER_SETTINGS]: [SettingsPage],
};

export { components };
