import { useStoreSelector } from "@sharkord/plugin-sdk/client";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { MAX_BOOST } from "../constants";
import { BoostIcon } from "./boost-icon";
import { useSettings, useSources } from "./hooks";
import { SourceRow } from "./source-row";
import { heading, hint, iconButton, panel } from "./styles";

const PANEL_WIDTH = 300;

/**
 * Top bar button while connected to a voice channel. Opens a panel with a
 * boost slider for every voice, screen share and stream that is playing.
 */
const TopbarButton = memo(() => {
  const voiceChannelId = useStoreSelector(
    (state) => state.currentVoiceChannelId,
  );
  const sources = useSources();
  const settings = useSettings();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const anyBoosted = sources.some((source) => settings.boosts[source.key]);

  const toggle = useCallback(() => setOpen((value) => !value), []);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;

    const rect = buttonRef.current.getBoundingClientRect();
    const left = Math.max(
      8,
      Math.min(rect.right - PANEL_WIDTH, window.innerWidth - PANEL_WIDTH - 8),
    );

    setPosition({ top: rect.bottom + 6, left });
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;

      if (panelRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;

      setOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!voiceChannelId) setOpen(false);
  }, [voiceChannelId]);

  if (!voiceChannelId) return null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        title="Volume boost"
        aria-expanded={open}
        style={iconButton(anyBoosted || open)}
      >
        <BoostIcon />
      </button>

      {open &&
        position &&
        createPortal(
          <div
            ref={panelRef}
            style={{
              ...panel,
              position: "fixed",
              zIndex: 60,
              width: PANEL_WIDTH,
              maxHeight: "70vh",
              overflowY: "auto",
              ...position,
            }}
          >
            <div style={{ display: "grid", gap: 4 }}>
              <h3 style={heading}>Volume boost</h3>
              <p style={hint}>
                Multiplies Sharkord's own volume, up to {MAX_BOOST}%.
              </p>
            </div>

            {sources.length === 0 ? (
              <p style={hint}>Nobody is playing audio in this channel yet.</p>
            ) : (
              sources.map((source) => (
                <SourceRow
                  key={source.key}
                  volumeKey={source.key}
                  kind={source.kind}
                  userId={source.userId}
                  streamKey={source.streamKey}
                />
              ))
            )}
          </div>,
          document.body,
        )}
    </>
  );
});

export { TopbarButton };
