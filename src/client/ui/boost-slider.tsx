import { memo, useCallback, type ChangeEvent } from "react";
import { MAX_BOOST, MIN_BOOST } from "../constants";
import { setBoost } from "../settings";
import { useSettings } from "./hooks";

type TBoostSliderProps = {
  volumeKey: string;
  label: string;
  detail?: string;
};

const BoostSlider = memo(({ volumeKey, label, detail }: TBoostSliderProps) => {
  const settings = useSettings();
  const boost = settings.boosts[volumeKey] ?? MIN_BOOST;
  const boosted = boost > MIN_BOOST;

  const onChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      setBoost(volumeKey, Number(event.target.value)),
    [volumeKey],
  );

  const onReset = useCallback(() => setBoost(volumeKey, MIN_BOOST), [volumeKey]);

  return (
    <div style={{ display: "grid", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span
          style={{
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: "var(--foreground)",
          }}
          title={label}
        >
          {label}
          {detail && (
            <span style={{ color: "var(--muted-foreground)", fontSize: 11 }}>
              {" "}
              · {detail}
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={onReset}
          disabled={!boosted}
          title="Reset to 100%"
          style={{
            border: "none",
            background: "transparent",
            padding: 0,
            fontSize: 12,
            fontVariantNumeric: "tabular-nums",
            color: boosted ? "var(--primary)" : "var(--muted-foreground)",
            cursor: boosted ? "pointer" : "default",
          }}
        >
          {boost}%
        </button>
      </div>
      <input
        type="range"
        min={MIN_BOOST}
        max={MAX_BOOST}
        step={5}
        value={boost}
        onChange={onChange}
        aria-label={`${label} boost`}
        style={{ width: "100%", accentColor: "var(--primary)", cursor: "pointer" }}
      />
    </div>
  );
});

export { BoostSlider };
