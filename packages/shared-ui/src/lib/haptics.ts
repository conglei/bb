export type HapticKind =
  | "selection"
  | "impact-light"
  | "impact-medium"
  | "impact-heavy"
  | "success"
  | "warning"
  | "error";

export type HapticHandler = (kind: HapticKind) => void;

const HAPTIC_HANDLER_KEY = Symbol.for("bb.haptics.v1");

export function registerHapticHandler(handler: HapticHandler | null): void {
  Reflect.set(globalThis, HAPTIC_HANDLER_KEY, handler);
}

export function triggerHaptic(kind: HapticKind): boolean {
  const handler: unknown = Reflect.get(globalThis, HAPTIC_HANDLER_KEY);
  if (typeof handler !== "function") return false;
  (handler as HapticHandler)(kind);
  return true;
}
