import { publish } from "@sharkord/plugin-builder";
import { PLUGIN_SDK_VERSION } from "@sharkord/plugin-sdk";

// Creates a GitHub release with the plugin archive and the version file the
// Sharkord marketplace registry expects. Without GITHUB_REPO the repository
// is read from the git remote.
const result = await publish({
  githubToken: process.env.GITHUB_TOKEN,
  repo: process.env.GITHUB_REPO || undefined,
  sdkVersion: PLUGIN_SDK_VERSION,
});

console.log("Plugin published", result.releaseUrl);
