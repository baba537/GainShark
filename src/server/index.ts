import type { PluginContext, UnloadPluginContext } from "@sharkord/plugin-sdk";

const onLoad = async (ctx: PluginContext) => {
  // the whole plugin runs client side, the server only has to ship the bundle
  ctx.ui.enable();
  ctx.logger.log("GainShark loaded");
};

const onUnload = async (ctx: UnloadPluginContext) => {
  ctx.logger.log("GainShark unloaded");
};

export { onLoad, onUnload };
