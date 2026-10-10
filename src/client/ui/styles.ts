import type { CSSProperties } from "react";

// Sharkord only ships the Tailwind classes it uses itself, so the plugin
// styles inline with the host's theme variables.

const iconButton = (active: boolean): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 32,
  height: 32,
  padding: 0,
  border: "none",
  borderRadius: "var(--radius, 8px)",
  background: "transparent",
  color: active ? "var(--primary)" : "var(--muted-foreground)",
  cursor: "pointer",
});

const panel: CSSProperties = {
  display: "grid",
  gap: 12,
  padding: 12,
  borderRadius: "var(--radius, 8px)",
  border: "1px solid var(--border)",
  background: "var(--popover)",
  color: "var(--popover-foreground)",
  boxShadow: "0 8px 24px rgba(0, 0, 0, 0.35)",
  fontSize: 13,
};

const heading: CSSProperties = {
  margin: 0,
  fontSize: 14,
  fontWeight: 600,
  color: "var(--foreground)",
};

const hint: CSSProperties = {
  margin: 0,
  fontSize: 12,
  lineHeight: 1.4,
  color: "var(--muted-foreground)",
};

const textButton: CSSProperties = {
  justifySelf: "start",
  padding: "4px 10px",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius, 8px)",
  background: "transparent",
  color: "var(--foreground)",
  fontSize: 12,
  cursor: "pointer",
};

export { heading, hint, iconButton, panel, textButton };
