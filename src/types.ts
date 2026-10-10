/**
 * GainShark has no commands or actions. Everything happens in the browser,
 * so the contract stays empty.
 */
type TPlugin = {
  actions: Record<never, never>;
  commands: Record<never, never>;
};

export type { TPlugin };
