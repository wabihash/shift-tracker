import { useEffect, useRef, type RefObject } from "react";

export interface ClickOutsideOptions {
  enabled?: boolean;
  closeOnEscape?: boolean;
}

/** Close a transient surface on outside mouse/touch input or Escape. */
export function useClickOutside(
  refs: readonly RefObject<HTMLElement | null>[],
  onOutside: () => void,
  { enabled = true, closeOnEscape = true }: ClickOutsideOptions = {},
): void {
  const refsRef = useRef(refs);
  const callbackRef = useRef(onOutside);
  refsRef.current = refs;
  callbackRef.current = onOutside;

  useEffect(() => {
    if (!enabled) return;

    const isInside = (target: EventTarget | null) =>
      target instanceof Node && refsRef.current.some((ref) => ref.current?.contains(target));
    const handlePointer = (event: MouseEvent | TouchEvent) => {
      if (!isInside(event.target)) callbackRef.current();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (closeOnEscape && event.key === "Escape") callbackRef.current();
    };

    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("touchstart", handlePointer, { passive: true });
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("touchstart", handlePointer);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [enabled, closeOnEscape]);
}
