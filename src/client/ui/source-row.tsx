import { memo } from "react";
import type { TSourceKind } from "../engine";
import { BoostSlider } from "./boost-slider";
import { useUserName } from "./hooks";

type TParsedKey = {
  kind: TSourceKind;
  userId?: number;
  streamKey?: string;
};

/** reads a volume key back, for boosts saved while the source is offline */
const parseKey = (key: string): TParsedKey => {
  const voice = /^user-(\d+)$/.exec(key);

  if (voice) return { kind: "voice", userId: Number(voice[1]) };

  const screen = /^userscreen-(\d+)$/.exec(key);

  if (screen) return { kind: "screen", userId: Number(screen[1]) };

  return { kind: "external", streamKey: key.replace(/^external-/, "") };
};

const kindLabel: Record<TSourceKind, string> = {
  voice: "Voice",
  screen: "Screen share",
  external: "Stream",
};

type TSourceRowProps = {
  volumeKey: string;
  kind?: TSourceKind;
  userId?: number;
  streamKey?: string;
};

const SourceRow = memo((props: TSourceRowProps) => {
  const parsed: TParsedKey = props.kind
    ? { kind: props.kind, userId: props.userId, streamKey: props.streamKey }
    : parseKey(props.volumeKey);
  const userName = useUserName(parsed.userId);

  const label =
    parsed.kind === "external"
      ? parsed.streamKey || "External stream"
      : userName ?? `User #${parsed.userId}`;

  return (
    <BoostSlider
      volumeKey={props.volumeKey}
      label={label}
      detail={kindLabel[parsed.kind]}
    />
  );
});

export { SourceRow };
