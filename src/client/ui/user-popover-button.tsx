import { memo, useCallback, useEffect, useRef, useState } from "react";
import { MIN_BOOST } from "../constants";
import { BoostIcon } from "./boost-icon";
import { useOwnUserId, useSettings } from "./hooks";
import { BoostSlider } from "./boost-slider";
import { heading, iconButton, panel } from "./styles";

type TUserPopoverButtonProps = {
  userId: number;
};

/**
 * Button in the user card. The panel is rendered inside the card, not in a
 * portal, so clicking it does not count as a click outside and close the card.
 */
const UserPopoverButton = memo(({ userId }: TUserPopoverButtonProps) => {
  const ownUserId = useOwnUserId();
  const settings = useSettings();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);

  const voiceKey = `user-${userId}`;
  const screenKey = `userscreen-${userId}`;
  const boosted =
    (settings.boosts[voiceKey] ?? MIN_BOOST) > MIN_BOOST ||
    (settings.boosts[screenKey] ?? MIN_BOOST) > MIN_BOOST;

  const toggle = useCallback(() => setOpen((value) => !value), []);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown, true);

    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);

  if (userId === ownUserId) return null;

  return (
    <span ref={rootRef} style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        onClick={toggle}
        title="Volume boost"
        aria-expanded={open}
        style={iconButton(boosted || open)}
      >
        <BoostIcon size={16} />
      </button>

      {open && (
        <div
          style={{
            ...panel,
            position: "absolute",
            bottom: "calc(100% + 8px)",
            right: 0,
            zIndex: 60,
            width: 240,
          }}
        >
          <h3 style={heading}>Volume boost</h3>
          <BoostSlider volumeKey={voiceKey} label="Voice" />
          <BoostSlider volumeKey={screenKey} label="Screen share" />
        </div>
      )}
    </span>
  );
});

export { UserPopoverButton };
