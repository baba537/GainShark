import { MAX_BOOST, MIN_BOOST } from "./constants";
import { findFiberProps } from "./fiber";
import { getBoost, setBoost, subscribeSettings } from "./settings";

/**
 * Extends Sharkord's own volume sliders (right-click menu of a voice user,
 * volume button on voice and screen share cards, volume list in the top bar)
 * from 0-100% to 0-200%.
 *
 * Plugins cannot change the props of Sharkord's components, so each volume
 * slider is hidden and an identical looking slider is put in its place. It
 * shares Sharkord's classes and therefore its theme.
 *
 * Sharkord's own volume state never goes above 100%, so audio stays valid if
 * the plugin is removed. Values above 100% are kept by GainShark:
 *   0-100%    -> Sharkord volume, no boost
 *   101-200%  -> Sharkord volume 100%, boost stored by GainShark
 */

type THostSliderProps = {
  value: number[];
  max: number;
  onValueChange: (values: number[]) => void;
};

type TExtended = {
  hostRoot: HTMLElement;
  key: string;
  root: HTMLElement;
  range: HTMLElement;
  thumbWrapper: HTMLElement;
  thumb: HTMLElement;
  hostLabel?: HTMLElement;
  label?: HTMLElement;
  observer: MutationObserver;
};

const HOST_MAX = 100;
const THUMB_SIZE = 16;
const MARKER = "data-gainshark";

const percentLabel = /^\d+%$/;

const isHostSliderProps = (
  props: Record<string, unknown>,
): props is Record<string, unknown> & THostSliderProps =>
  typeof props.onValueChange === "function" &&
  Array.isArray(props.value) &&
  props.max === HOST_MAX;

/** the Sharkord volume key a slider controls, from its components' props */
const findVolumeKey = (el: Element): string | undefined => {
  const props = findFiberProps(
    el,
    (p) =>
      typeof p.volumeKey === "string" ||
      (p.type === "user" && typeof p.userId === "number") ||
      (p.type === "external" &&
        typeof p.pluginId === "string" &&
        typeof p.streamKey === "string"),
    // Radix menus and popovers sit deep below the component that owns them
    150,
  );

  if (!props) return undefined;
  if (typeof props.volumeKey === "string") return props.volumeKey;
  if (props.type === "user") return `user-${props.userId as number}`;

  return `external-${props.pluginId as string}-${props.streamKey as string}`;
};

/** the "42%" next to a slider, searched a few levels up */
const findHostLabel = (hostRoot: HTMLElement): HTMLElement | undefined => {
  let scope = hostRoot.parentElement;

  for (let level = 0; scope && level < 3; level++) {
    const candidates = scope.querySelectorAll<HTMLElement>("span, div, p");

    for (const candidate of candidates) {
      if (candidate.children.length > 0) continue;
      if (hostRoot.contains(candidate)) continue;
      if (candidate.hasAttribute(MARKER)) continue;
      if (percentLabel.test(candidate.textContent?.trim() ?? "")) {
        return candidate;
      }
    }

    scope = scope.parentElement;
  }

  return undefined;
};

const createExtender = () => {
  const extended = new Map<HTMLElement, TExtended>();
  const ignored = new WeakSet<HTMLElement>();
  let observer: MutationObserver | undefined;
  let unsubscribeSettings: (() => void) | undefined;
  let scanQueued = false;

  const hostValue = (item: TExtended) => {
    const thumb = item.hostRoot.querySelector('[role="slider"]');
    const value = Number(thumb?.getAttribute("aria-valuenow"));

    return Number.isFinite(value) ? value : HOST_MAX;
  };

  const displayValue = (item: TExtended) => {
    const host = hostValue(item);

    return host < HOST_MAX ? host : getBoost(item.key);
  };

  const render = (item: TExtended) => {
    const value = displayValue(item);
    const percent = (value / MAX_BOOST) * 100;
    // keeps the thumb inside the track at both ends, like Radix does
    const offset = THUMB_SIZE / 2 - (percent / 100) * THUMB_SIZE;

    item.range.style.right = `${100 - percent}%`;
    item.thumbWrapper.style.left = `calc(${percent}% + ${offset}px)`;
    item.thumb.setAttribute("aria-valuenow", String(value));

    if (item.label) item.label.textContent = `${value}%`;
  };

  const commit = (item: TExtended, raw: number) => {
    const value = Math.round(Math.min(MAX_BOOST, Math.max(0, raw)));
    const props = findFiberProps(item.hostRoot, isHostSliderProps) as
      | THostSliderProps
      | undefined;

    if (!props) return;

    if (value > HOST_MAX) {
      setBoost(item.key, value);

      if (hostValue(item) !== HOST_MAX) props.onValueChange([HOST_MAX]);
    } else {
      setBoost(item.key, MIN_BOOST);
      props.onValueChange([value]);
    }

    render(item);
  };

  const build = (hostRoot: HTMLElement, key: string): TExtended => {
    const orientation = "horizontal";
    const hostTrack = hostRoot.querySelector<HTMLElement>(
      '[data-slot="slider-track"]',
    );
    const hostRange = hostRoot.querySelector<HTMLElement>(
      '[data-slot="slider-range"]',
    );
    const hostThumb = hostRoot.querySelector<HTMLElement>(
      '[data-slot="slider-thumb"]',
    );

    const root = document.createElement("span");
    root.className = hostRoot.className;
    root.setAttribute("data-orientation", orientation);
    root.setAttribute(MARKER, "slider");
    root.style.position = "relative";

    const track = document.createElement("span");
    track.className = hostTrack?.className ?? "";
    track.setAttribute("data-orientation", orientation);

    const range = document.createElement("span");
    range.className = hostRange?.className ?? "";
    range.setAttribute("data-orientation", orientation);
    range.style.left = "0";

    // marks where 100% is
    const marker = document.createElement("span");
    marker.style.cssText =
      "position:absolute;top:0;bottom:0;left:50%;width:2px;margin-left:-1px;" +
      "background:var(--foreground);opacity:.35;pointer-events:none";

    track.append(range, marker);

    const thumbWrapper = document.createElement("span");
    thumbWrapper.style.cssText =
      "position:absolute;transform:translateX(-50%)";

    const thumb = document.createElement("span");
    thumb.className = hostThumb?.className ?? "";
    thumb.setAttribute("role", "slider");
    thumb.setAttribute("tabindex", "0");
    thumb.setAttribute("aria-valuemin", "0");
    thumb.setAttribute("aria-valuemax", String(MAX_BOOST));
    thumb.setAttribute("aria-orientation", orientation);
    thumb.setAttribute("aria-label", "Volume");

    thumbWrapper.append(thumb);
    root.append(track, thumbWrapper);

    const item: TExtended = {
      hostRoot,
      key,
      root,
      range,
      thumbWrapper,
      thumb,
      observer: new MutationObserver(() => render(item)),
    };

    const valueAt = (clientX: number) => {
      const rect = root.getBoundingClientRect();
      const usable = rect.width - THUMB_SIZE;
      const ratio = usable > 0 ? (clientX - rect.left - THUMB_SIZE / 2) / usable : 0;

      return Math.min(1, Math.max(0, ratio)) * MAX_BOOST;
    };

    root.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;

      event.preventDefault();
      event.stopPropagation();
      root.setPointerCapture(event.pointerId);
      thumb.focus();
      commit(item, valueAt(event.clientX));
    });

    root.addEventListener("pointermove", (event) => {
      if (!root.hasPointerCapture(event.pointerId)) return;

      commit(item, valueAt(event.clientX));
    });

    root.addEventListener("pointerup", (event) => {
      if (root.hasPointerCapture(event.pointerId)) {
        root.releasePointerCapture(event.pointerId);
      }
    });

    thumb.addEventListener("keydown", (event) => {
      const step = event.shiftKey ? 10 : 1;
      const current = displayValue(item);
      const next: Record<string, number> = {
        ArrowRight: current + step,
        ArrowUp: current + step,
        ArrowLeft: current - step,
        ArrowDown: current - step,
        PageUp: current + 10,
        PageDown: current - 10,
        Home: 0,
        End: MAX_BOOST,
      };

      if (!(event.key in next)) return;

      // menus would otherwise use the arrow keys to move between items
      event.preventDefault();
      event.stopPropagation();
      commit(item, next[event.key]!);
    });

    const hostLabel = findHostLabel(hostRoot);

    if (hostLabel) {
      const label = document.createElement("span");
      label.className = hostLabel.className;
      label.setAttribute(MARKER, "label");
      hostLabel.style.display = "none";
      hostLabel.after(label);
      item.hostLabel = hostLabel;
      item.label = label;
    }

    hostRoot.style.display = "none";
    hostRoot.after(root);

    // Sharkord changes its own value too (mute button), follow it
    item.observer.observe(hostRoot, {
      attributes: true,
      attributeFilter: ["aria-valuenow"],
      subtree: true,
    });

    render(item);

    return item;
  };

  const restore = (item: TExtended) => {
    item.observer.disconnect();
    item.root.remove();
    item.label?.remove();
    item.hostRoot.style.display = "";

    if (item.hostLabel) item.hostLabel.style.display = "";
  };

  const consider = (hostRoot: HTMLElement) => {
    if (extended.has(hostRoot) || ignored.has(hostRoot)) return;
    if (hostRoot.hasAttribute(MARKER) || !hostRoot.isConnected) return;

    const props = findFiberProps(hostRoot, isHostSliderProps);
    const key = props ? findVolumeKey(hostRoot) : undefined;

    if (!key) {
      ignored.add(hostRoot);

      return;
    }

    extended.set(hostRoot, build(hostRoot, key));
  };

  const scan = () => {
    scanQueued = false;

    for (const [hostRoot, item] of extended) {
      if (hostRoot.isConnected) continue;

      restore(item);
      extended.delete(hostRoot);
    }

    document
      .querySelectorAll<HTMLElement>('[data-slot="slider"]')
      .forEach(consider);
  };

  const queueScan = () => {
    if (scanQueued) return;

    scanQueued = true;
    queueMicrotask(scan);
  };

  const start = () => {
    if (observer) return;

    observer = new MutationObserver(queueScan);
    observer.observe(document.body, { childList: true, subtree: true });

    unsubscribeSettings = subscribeSettings(() => extended.forEach(render));

    scan();
  };

  const stop = () => {
    if (!observer) return;

    observer.disconnect();
    observer = undefined;

    unsubscribeSettings?.();
    unsubscribeSettings = undefined;

    extended.forEach(restore);
    extended.clear();
  };

  return { start, stop };
};

export { createExtender };
