import { useStoreSelector } from "@sharkord/plugin-sdk/client";
import { useSyncExternalStore } from "react";
import { getEngine } from "../engine";
import { getSettings, subscribeSettings } from "../settings";

const engine = getEngine();

const useSettings = () => useSyncExternalStore(subscribeSettings, getSettings);

const useSources = () =>
  useSyncExternalStore(engine.subscribeSources, engine.getSources);

const useUserName = (userId: number | undefined) =>
  useStoreSelector((state) =>
    userId === undefined
      ? undefined
      : state.users.find((user) => user.id === userId)?.name,
  );

const useOwnUserId = () => useStoreSelector((state) => state.ownUserId);

export { useOwnUserId, useSettings, useSources, useUserName };
