import { useStoreSelector } from "@sharkord/plugin-sdk/client";
import { useSyncExternalStore } from "react";
import { getSettings, subscribeSettings } from "../settings";

const useSettings = () => useSyncExternalStore(subscribeSettings, getSettings);

const useUsers = () => useStoreSelector((state) => state.users);

export { useSettings, useUsers };
