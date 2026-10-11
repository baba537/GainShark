import { memo, useCallback, type ChangeEvent } from "react";
import { MAX_BOOST } from "../constants";
import { resetAllBoosts, setLimiter } from "../settings";
import { useSettings, useUsers } from "./hooks";
import { heading, hint, textButton } from "./styles";

const section = { display: "grid", gap: 12, maxWidth: 480 } as const;

const describeKey = (key: string, names: Map<number, string>) => {
  const match = /^(user|userscreen)-(\d+)$/.exec(key);

  if (!match) return `Stream ${key.replace(/^external-/, "")}`;

  const name = names.get(Number(match[2])) ?? `User #${match[2]}`;

  return match[1] === "user" ? name : `${name} (screen share)`;
};

/** GainShark's entry in the user settings */
const SettingsPage = memo(() => {
  const settings = useSettings();
  const users = useUsers();
  const names = new Map(users.map((user) => [user.id, user.name]));
  const entries = Object.entries(settings.boosts).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  const onLimiterChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setLimiter(event.target.checked),
    [],
  );

  return (
    <div style={{ display: "grid", gap: 24, color: "var(--foreground)" }}>
      <div style={section}>
        <h2 style={{ ...heading, fontSize: 18 }}>GainShark</h2>
        <p style={hint}>
          Sharkord's volume sliders go up to {MAX_BOOST}%: right-click a user
          in a voice channel, or use the volume button on a user's card, a
          screen share or the volume list in the top bar. The line in the
          middle of the slider marks 100%. Volumes are stored in this browser.
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
            Keeps audio above 100% from clipping. Turn it off for the rawest
            sound.
          </span>
        </span>
      </label>

      <div style={section}>
        <h3 style={heading}>Volumes above 100%</h3>
        {entries.length === 0 ? (
          <p style={hint}>None yet.</p>
        ) : (
          <>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", fontSize: 13 }}>
              {entries.map(([key, value]) => (
                <li
                  key={key}
                  style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}
                >
                  <span>{describeKey(key, names)}</span>
                  <span style={{ color: "var(--muted-foreground)" }}>{value}%</span>
                </li>
              ))}
            </ul>
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
