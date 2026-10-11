type TFiber = { memoizedProps?: unknown; return?: TFiber | null };

/**
 * Walks up React's internal fiber tree from a DOM element and returns the
 * first component props that match. This is how GainShark learns which user
 * or stream a piece of Sharkord's UI belongs to.
 */
const findFiberProps = (
  el: Element,
  match: (props: Record<string, unknown>) => boolean,
  maxDepth = 25,
): Record<string, unknown> | undefined => {
  const fiberKey = Object.keys(el).find((key) =>
    key.startsWith("__reactFiber$"),
  );

  if (!fiberKey) return undefined;

  let fiber = (el as unknown as Record<string, TFiber | undefined>)[fiberKey];

  for (let depth = 0; fiber && depth < maxDepth; depth++) {
    const props = fiber.memoizedProps;

    if (props && typeof props === "object") {
      const record = props as Record<string, unknown>;

      if (match(record)) return record;
    }

    fiber = fiber.return ?? undefined;
  }

  return undefined;
};

export { findFiberProps };
