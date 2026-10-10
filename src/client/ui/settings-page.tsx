import { memo, useCallback, type ChangeEvent } from "react";
import { MAX_BOOST } from "../constants";
import { resetAllBoosts, setLimiter } from "../settings";
import { useSettings } from "./hooks";
import { SourceRow } from "./source-row";
import { heading, hint, textButton } from "./styles";

const section = { display: "grid", gap: 12, maxWidth: 480 } as const;

/** GainShark's entry in the user settings */
const SettingsPage = memo(() => {
  const settings = useSettings();
  const keys = Object.keys(settings.boosts).sort();

  const onLimiterChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setLimiter(event.target.checked),
    [],
  );

  return (
    <div style={{ display: "grid", gap: 24, color: "var(--foreground)" }}>
      <div style={section}>
        <h2 style={{ ...heading, fontSize: 18 }}>GainShark</h2>
        <p style={hint}>
          Raises the volume of users, screen shares and streams above 100%.
          The boost multiplies Sharkord's own volume slider, so 100% there and
          {` ${MAX_BOOST}%`} here plays at {MAX_BOOST}%. Use the speaker button
          in the top bar during a call, or the one in a user's profile card.
          Settings are stored in this browser.
        </p>
      </div>

      <label
        style={{ ...section, display: "flex", alignItems: "flex-start", gap: 10 }}
      >
        <input
          type="checkbox"
          checked={settings.limiter}
          onChange={onLimiterChange}
          style={{ marginTop: 2, accentColor: "var(--primary)" }}
        />
        <span style={{ display: "grid", gap: 2 }}>
          <span style={{ fontSize: 14 }}>Limiter</span>
          <span style={hint}>
            Keeps boosted audio from clipping. Turn it off for the rawest
            sound.
          </span>
        </span>
      </label>

      <div style={section}>
        <h3 style={heading}>Saved boosts</h3>
        {keys.length === 0 ? (
          <p style={hint}>No boosts yet.</p>
        ) : (
          <>
            {keys.map((key) => (
              <SourceRow key={key} volumeKey={key} />
            ))}
            <button type="button" style={textButton} onClick={resetAllBoosts}>
              Reset all to 100%
            </button>
          </>
        )}
      </div>
    </div>
  );
});

export { SettingsPage };
