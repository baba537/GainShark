import { MIN_BOOST } from "./constants";
import { getBoost, getSettings, subscribeSettings } from "./settings";

/**
 * Sharkord plays every remote stream through a hidden <audio> element and sets
 * `element.volume = slider / 100`. HTMLMediaElement.volume stops at 1.0, so
 * anything above 100% needs Web Audio.
 *
 * For every source with a boost above 100% the engine:
 *   1. routes the element's MediaStream through a GainNode (and a limiter),
 *   2. mutes the element itself, which keeps it playing so Chrome keeps
 *      decoding the remote WebRTC track,
 *   3. intercepts Sharkord's later writes to `volume` and `muted` on that
 *      element and applies them to the gain instead.
 *
 * Sources without a boost are left untouched and play natively.
 */

type TSourceKind = "voice" | "screen" | "external";

type TSource = {
  /** same format as Sharkord's volume keys */
  key: string;
  kind: TSourceKind;
  userId?: number;
  pluginId?: string;
  streamKey?: string;
};

type TGraph = {
  stream: MediaStream;
  source: MediaStreamAudioSourceNode;
  gain: GainNode;
  limiter: DynamicsCompressorNode;
  limited: boolean;
};

type TTracked = {
  el: HTMLAudioElement;
  source: TSource;
  /** what Sharkord last wrote to `volume` (0-1) */
  hostVolume: number;
  /** what Sharkord last wrote to `muted` (deafen) */
  hostMuted: boolean;
  graph?: TGraph;
};

type TSinkElement = HTMLMediaElement & {
  sinkId?: string;
  setSinkId?: (id: string) => Promise<void>;
};

type TSinkContext = AudioContext & {
  sinkId?: string | object;
  setSinkId?: (id: string) => Promise<void>;
};

type TSaved = {
  volume: PropertyDescriptor;
  muted: PropertyDescriptor;
  srcObject: PropertyDescriptor;
  setSinkId?: PropertyDescriptor;
};

const SCAN_INTERVAL_MS = 2000;
const GAIN_SMOOTHING = 0.015;

const proto = HTMLMediaElement.prototype;

const findFiberProps = (
  el: Element,
  match: (props: Record<string, unknown>) => boolean,
  maxDepth = 25,
): Record<string, unknown> | undefined => {
  const fiberKey = Object.keys(el).find((key) =>
    key.startsWith("__reactFiber$"),
  );

  if (!fiberKey) return undefined;

  let fiber = (el as unknown as Record<string, unknown>)[fiberKey] as
    | { memoizedProps?: unknown; return?: unknown }
    | undefined;

  for (let depth = 0; fiber && depth < maxDepth; depth++) {
    const props = fiber.memoizedProps;

    if (props && typeof props === "object") {
      const record = props as Record<string, unknown>;

      if (match(record)) return record;
    }

    fiber = fiber.return as typeof fiber;
  }

  return undefined;
};

/**
 * Works out which Sharkord volume key an <audio> element belongs to.
 * - user voice:   <audio data-user-id>
 * - plugin stream: <audio data-stream-id>, plugin id and key from React props
 * - screen share:  <audio> next to the <video> of a screen share card, user id
 *                  from the card's React props
 */
const classify = (el: HTMLAudioElement): TSource | undefined => {
  const userId = Number(el.dataset.userId);

  if (el.dataset.userId && Number.isInteger(userId)) {
    return { key: `user-${userId}`, kind: "voice", userId };
  }

  if (el.dataset.streamId) {
    const props = findFiberProps(
      el,
      (p) => typeof p.pluginId === "string" && typeof p.streamKey === "string",
    );

    if (props) {
      const pluginId = props.pluginId as string;
      const streamKey = props.streamKey as string;

      return {
        key: `external-${pluginId}-${streamKey}`,
        kind: "external",
        pluginId,
        streamKey,
      };
    }

    return { key: `external-stream-${el.dataset.streamId}`, kind: "external" };
  }

  if (!el.parentElement?.querySelector(":scope > video")) return undefined;

  const props = findFiberProps(el, (p) => typeof p.userId === "number");

  if (!props) return undefined;

  const screenUserId = props.userId as number;

  return { key: `userscreen-${screenUserId}`, kind: "screen", userId: screenUserId };
};

const kindOrder: Record<TSourceKind, number> = {
  voice: 0,
  screen: 1,
  external: 2,
};

const createEngine = () => {
  let saved: TSaved | undefined;
  let ctx: TSinkContext | undefined;
  let sinkId: string | undefined;
  let observer: MutationObserver | undefined;
  let scanTimer: ReturnType<typeof setInterval> | undefined;
  let unsubscribeSettings: (() => void) | undefined;

  const tracked = new Map<HTMLAudioElement, TTracked>();
  const ignored = new WeakSet<HTMLAudioElement>();
  const pending = new Set<HTMLAudioElement>();

  let sources: TSource[] = [];
  const sourceListeners = new Set<() => void>();

  // native accessors, always valid while the engine runs
  const nativeVolume = (el: HTMLMediaElement) =>
    saved!.volume.get!.call(el) as number;
  const setNativeVolume = (el: HTMLMediaElement, value: number) =>
    saved!.volume.set!.call(el, value);
  const nativeMuted = (el: HTMLMediaElement) =>
    saved!.muted.get!.call(el) as boolean;
  const setNativeMuted = (el: HTMLMediaElement, value: boolean) =>
    saved!.muted.set!.call(el, value);
  const nativeSrcObject = (el: HTMLMediaElement) =>
    saved!.srcObject.get!.call(el) as MediaProvider | null;

  const hasAudio = (el: HTMLMediaElement) => {
    const stream = nativeSrcObject(el);

    return stream instanceof MediaStream && stream.getAudioTracks().length > 0;
  };

  // --- sources list for the UI -------------------------------------------

  const publishSources = () => {
    const byKey = new Map<string, TSource>();

    for (const item of tracked.values()) {
      if (item.el.isConnected && hasAudio(item.el)) {
        byKey.set(item.source.key, item.source);
      }
    }

    const next = Array.from(byKey.values()).sort(
      (a, b) =>
        kindOrder[a.kind] - kindOrder[b.kind] ||
        (a.userId ?? 0) - (b.userId ?? 0) ||
        a.key.localeCompare(b.key),
    );

    const unchanged =
      next.length === sources.length &&
      next.every((source, index) => source === sources[index]);

    if (unchanged) return;

    sources = next;
    sourceListeners.forEach((listener) => listener());
  };

  // --- audio context -------------------------------------------------------

  const resumeOnGesture = () => {
    if (ctx && ctx.state === "suspended") void ctx.resume().catch(() => {});
  };

  const applySink = () => {
    if (!ctx || sinkId === undefined) return;
    if (typeof ctx.setSinkId !== "function") return;
    if (ctx.sinkId === sinkId) return;

    ctx.setSinkId(sinkId).catch((error: unknown) => {
      console.warn("[GainShark] could not switch output device", error);
    });
  };

  const getContext = () => {
    if (ctx) return ctx;

    try {
      ctx = new AudioContext({ latencyHint: "interactive" }) as TSinkContext;
    } catch (error) {
      console.warn("[GainShark] Web Audio is not available", error);

      return undefined;
    }

    window.addEventListener("pointerdown", resumeOnGesture, true);
    window.addEventListener("keydown", resumeOnGesture, true);

    applySink();

    return ctx;
  };

  // --- graph handling ------------------------------------------------------

  const applyGain = (item: TTracked) => {
    if (!item.graph || !ctx) return;

    const boost = getBoost(item.source.key) / 100;
    const target = item.hostMuted ? 0 : item.hostVolume * boost;

    item.graph.gain.gain.setTargetAtTime(
      target,
      ctx.currentTime,
      GAIN_SMOOTHING,
    );
  };

  const wire = (graph: TGraph, limited: boolean) => {
    if (!ctx) return;

    graph.gain.disconnect();
    graph.limiter.disconnect();

    if (limited) {
      graph.gain.connect(graph.limiter);
      graph.limiter.connect(ctx.destination);
    } else {
      graph.gain.connect(ctx.destination);
    }

    graph.limited = limited;
  };

  const teardown = (item: TTracked, restore: boolean) => {
    const graph = item.graph;

    if (!graph) return;

    item.graph = undefined;

    try {
      graph.source.disconnect();
      graph.gain.disconnect();
      graph.limiter.disconnect();
    } catch {
      // already disconnected
    }

    if (restore) {
      setNativeVolume(item.el, item.hostVolume);
      setNativeMuted(item.el, item.hostMuted);
    }
  };

  const build = (item: TTracked, stream: MediaStream) => {
    const context = getContext();

    if (!context) return;

    teardown(item, false);

    let source: MediaStreamAudioSourceNode;

    try {
      source = context.createMediaStreamSource(stream);
    } catch (error) {
      console.warn("[GainShark] could not boost", item.source.key, error);
      setNativeVolume(item.el, item.hostVolume);
      setNativeMuted(item.el, item.hostMuted);

      return;
    }

    const gain = context.createGain();
    const limiter = context.createDynamicsCompressor();

    // a brickwall-ish limiter: leaves normal speech alone, catches peaks
    limiter.threshold.value = -1;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.1;

    gain.gain.value = item.hostMuted ? 0 : item.hostVolume;
    source.connect(gain);

    const graph: TGraph = { stream, source, gain, limiter, limited: false };

    wire(graph, getSettings().limiter);
    item.graph = graph;

    // the element keeps playing, muted, so the remote track stays alive
    setNativeVolume(item.el, 1);
    setNativeMuted(item.el, true);

    const elementSink = (item.el as TSinkElement).sinkId;

    if (sinkId === undefined && typeof elementSink === "string") {
      sinkId = elementSink;
      applySink();
    }

    resumeOnGesture();
  };

  const refresh = (item: TTracked) => {
    const stream = nativeSrcObject(item.el);
    const wantsGraph =
      getBoost(item.source.key) > MIN_BOOST &&
      stream instanceof MediaStream &&
      stream.getAudioTracks().length > 0;

    if (!wantsGraph) {
      teardown(item, true);

      return;
    }

    if (!item.graph || item.graph.stream !== stream) {
      build(item, stream);
    }

    if (!item.graph) return;

    const limited = getSettings().limiter;

    if (item.graph.limited !== limited) wire(item.graph, limited);

    applyGain(item);
  };

  // --- element discovery ---------------------------------------------------

  const consider = (el: HTMLAudioElement) => {
    if (!saved || !el.isConnected || ignored.has(el)) return;

    const existing = tracked.get(el);

    if (existing) {
      refresh(existing);
      publishSources();

      return;
    }

    const source = classify(el);

    if (!source) {
      ignored.add(el);

      return;
    }

    const item: TTracked = {
      el,
      source,
      hostVolume: nativeVolume(el),
      hostMuted: nativeMuted(el),
    };

    tracked.set(el, item);
    refresh(item);
    publishSources();
  };

  const notice = (el: HTMLMediaElement) => {
    if (!(el instanceof HTMLAudioElement)) return;

    if (pending.size === 0) {
      queueMicrotask(() => {
        const elements = Array.from(pending);

        pending.clear();
        elements.forEach(consider);
      });
    }

    pending.add(el);
  };

  const sweep = () => {
    let changed = false;

    for (const [el, item] of tracked) {
      if (el.isConnected) continue;

      teardown(item, true);
      tracked.delete(el);
      changed = true;
    }

    if (changed) publishSources();
  };

  const scan = () => {
    sweep();
    document.querySelectorAll("audio").forEach((el) => {
      if (!tracked.has(el)) consider(el);
    });
    publishSources();
  };

  // --- prototype patching --------------------------------------------------

  const patch = () => {
    const volume = Object.getOwnPropertyDescriptor(proto, "volume");
    const muted = Object.getOwnPropertyDescriptor(proto, "muted");
    const srcObject = Object.getOwnPropertyDescriptor(proto, "srcObject");
    const setSinkId = Object.getOwnPropertyDescriptor(proto, "setSinkId");

    if (!volume?.get || !volume.set || !muted?.get || !muted.set) return false;
    if (!srcObject?.get || !srcObject.set) return false;

    saved = { volume, muted, srcObject, setSinkId };

    Object.defineProperty(proto, "volume", {
      configurable: true,
      enumerable: volume.enumerable,
      get(this: HTMLMediaElement) {
        const item = tracked.get(this as HTMLAudioElement);

        return item?.graph ? item.hostVolume : volume.get!.call(this);
      },
      set(this: HTMLMediaElement, value: number) {
        const item = tracked.get(this as HTMLAudioElement);

        if (item?.graph && Number.isFinite(value) && value >= 0 && value <= 1) {
          item.hostVolume = value;
          applyGain(item);

          return;
        }

        // invalid values fall through so the browser throws as usual
        volume.set!.call(this, value);

        if (item) {
          item.hostVolume = value;
        } else {
          notice(this);
        }
      },
    });

    Object.defineProperty(proto, "muted", {
      configurable: true,
      enumerable: muted.enumerable,
      get(this: HTMLMediaElement) {
        const item = tracked.get(this as HTMLAudioElement);

        return item?.graph ? item.hostMuted : muted.get!.call(this);
      },
      set(this: HTMLMediaElement, value: boolean) {
        const item = tracked.get(this as HTMLAudioElement);

        if (item?.graph) {
          item.hostMuted = !!value;
          applyGain(item);

          return;
        }

        muted.set!.call(this, value);

        if (item) {
          item.hostMuted = !!value;
        } else {
          notice(this);
        }
      },
    });

    Object.defineProperty(proto, "srcObject", {
      configurable: true,
      enumerable: srcObject.enumerable,
      get: srcObject.get,
      set(this: HTMLMediaElement, value: MediaProvider | null) {
        srcObject.set!.call(this, value);
        notice(this);
      },
    });

    if (typeof setSinkId?.value === "function") {
      const original = setSinkId.value as (id: string) => Promise<void>;

      Object.defineProperty(proto, "setSinkId", {
        ...setSinkId,
        value(this: HTMLMediaElement, id: string) {
          if (tracked.has(this as HTMLAudioElement)) {
            sinkId = id;
            applySink();
          }

          return original.call(this, id);
        },
      });
    }

    return true;
  };

  const unpatch = () => {
    if (!saved) return;

    Object.defineProperty(proto, "volume", saved.volume);
    Object.defineProperty(proto, "muted", saved.muted);
    Object.defineProperty(proto, "srcObject", saved.srcObject);

    if (saved.setSinkId) {
      Object.defineProperty(proto, "setSinkId", saved.setSinkId);
    }
  };

  // --- lifecycle -----------------------------------------------------------

  const start = () => {
    if (saved) return;

    if (!patch()) {
      console.warn("[GainShark] unsupported browser, boost disabled");

      return;
    }

    observer = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => mutation.removedNodes.length > 0)) {
        sweep();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    scanTimer = setInterval(scan, SCAN_INTERVAL_MS);

    unsubscribeSettings = subscribeSettings(() => {
      tracked.forEach(refresh);
    });

    scan();
  };

  const stop = () => {
    if (!saved) return;

    observer?.disconnect();
    observer = undefined;

    if (scanTimer) clearInterval(scanTimer);
    scanTimer = undefined;

    unsubscribeSettings?.();
    unsubscribeSettings = undefined;

    tracked.forEach((item) => teardown(item, true));
    tracked.clear();
    pending.clear();

    unpatch();
    saved = undefined;

    window.removeEventListener("pointerdown", resumeOnGesture, true);
    window.removeEventListener("keydown", resumeOnGesture, true);

    void ctx?.close().catch(() => {});
    ctx = undefined;
    sinkId = undefined;

    publishSources();
  };

  return {
    start,
    stop,
    isRunning: () => !!saved,
    getSources: () => sources,
    subscribeSources: (listener: () => void) => {
      sourceListeners.add(listener);

      return () => {
        sourceListeners.delete(listener);
      };
    },
  };
};

type TEngine = ReturnType<typeof createEngine>;

declare global {
  interface Window {
    __GAINSHARK_ENGINE__?: TEngine;
  }
}

/**
 * One engine per page. After a plugin update Sharkord imports the new bundle
 * next to the old one, so the new module stops its predecessor first.
 */
const getEngine = (): TEngine => {
  const previous = window.__GAINSHARK_ENGINE__;

  if (previous && previous !== engine) previous.stop();

  window.__GAINSHARK_ENGINE__ = engine;

  return engine;
};

const engine = createEngine();

export { getEngine };
export type { TEngine, TSource, TSourceKind };
