import { useRef, useState, useCallback } from "react";
import { Platform } from "react-native";

/**
 * A touch + mouse drag-sort hook for web.
 * - Long press (500ms) to activate drag on touch devices
 * - Mouse: long press (300ms) to activate drag
 * - Ghost card uses fixed positioning to follow finger/cursor accurately
 * - Ghost card anchors to the point where the user pressed (not centered)
 *
 * Usage:
 *   const { getCardRef, getHandleHandlers, ghostPos, ghostOffset, ghostLabel, ghostSize, activeIndex, overActiveIndex } = useDragSort({ items, onReorder });
 *   // Attach getCardRef to the card element (for size/position detection)
 *   // Attach getHandleHandlers to the drag handle element (☰ icon) for events only
 */
export function useDragSort<T>({
  items,
  onReorder,
}: {
  items: T[];
  onReorder: (newItems: T[]) => void;
}) {
  const dragIndex = useRef<number | null>(null);
  const overIndex = useRef<number | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDragging = useRef(false);
  const startPos = useRef<{ x: number; y: number } | null>(null);

  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [overActiveIndex, setOverActiveIndex] = useState<number | null>(null);
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null);
  const [ghostLabel, setGhostLabel] = useState<string>("");
  const [ghostSize, setGhostSize] = useState<{ width: number; height: number }>({ width: 200, height: 56 });
  // Offset from card's top-left corner to the press point
  const [ghostOffset, setGhostOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  // itemRefs stores the CARD element (not the handle), for accurate rect detection
  const itemRefs = useRef<(HTMLElement | null)[]>([]);

  const finishDrag = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (isDragging.current && dragIndex.current !== null && overIndex.current !== null && dragIndex.current !== overIndex.current) {
      const newList = [...items];
      const [moved] = newList.splice(dragIndex.current, 1);
      newList.splice(overIndex.current, 0, moved);
      onReorder(newList);
    }
    dragIndex.current = null;
    overIndex.current = null;
    isDragging.current = false;
    startPos.current = null;
    setActiveIndex(null);
    setOverActiveIndex(null);
    setGhostPos(null);
  }, [items, onReorder]);

  /**
   * Returns a ref callback to attach to the CARD element.
   * This stores the card's DOM element for size/position detection.
   */
  const getCardRef = useCallback((index: number) => {
    if (Platform.OS !== "web") return undefined;
    // @ts-ignore
    return (el: HTMLElement | null) => { itemRefs.current[index] = el; };
  }, []);

  /**
   * Returns event handlers to attach to the drag HANDLE element (☰ icon).
   * Does NOT include ref — attach getCardRef separately to the card.
   */
  const getHandleHandlers = useCallback((index: number, label?: string) => {
    if (Platform.OS !== "web") return {};

    return {
      // ── Touch: long press 500ms to start drag ──────────────────────────────
      onTouchStart: (e: React.TouchEvent) => {
        e.stopPropagation();
        const touch = e.touches[0];
        startPos.current = { x: touch.clientX, y: touch.clientY };

        longPressTimer.current = setTimeout(() => {
          isDragging.current = true;
          dragIndex.current = index;
          overIndex.current = index;
          setActiveIndex(index);
          setOverActiveIndex(index);
          setGhostLabel(label ?? String(index + 1));
          setGhostPos({ x: touch.clientX, y: touch.clientY });
          // Use CARD rect (itemRefs) for accurate size and offset calculation
          const cardEl = itemRefs.current[index];
          if (cardEl) {
            const rect = cardEl.getBoundingClientRect();
            setGhostSize({ width: rect.width, height: rect.height });
            setGhostOffset({
              x: touch.clientX - rect.left,
              y: touch.clientY - rect.top,
            });
          }
          // Haptic feedback if available
          if (typeof navigator !== "undefined" && (navigator as any).vibrate) {
            (navigator as any).vibrate(30);
          }
        }, 500);
      },
      onTouchMove: (e: React.TouchEvent) => {
        const touch = e.touches[0];
        // Cancel long press if moved too much before activation
        if (!isDragging.current && startPos.current) {
          const dx = Math.abs(touch.clientX - startPos.current.x);
          const dy = Math.abs(touch.clientY - startPos.current.y);
          if (dx > 8 || dy > 8) {
            if (longPressTimer.current) {
              clearTimeout(longPressTimer.current);
              longPressTimer.current = null;
            }
            return;
          }
        }
        if (!isDragging.current) return;
        e.preventDefault();
        setGhostPos({ x: touch.clientX, y: touch.clientY });
        // Detect which card we're hovering over using card rects
        const elements = itemRefs.current;
        for (let i = 0; i < elements.length; i++) {
          const el = elements[i];
          if (!el) continue;
          const rect = el.getBoundingClientRect();
          if (touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
            overIndex.current = i;
            setOverActiveIndex(i);
            break;
          }
        }
      },
      onTouchEnd: () => {
        if (longPressTimer.current) {
          clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
        }
        finishDrag();
      },
      onTouchCancel: () => {
        if (longPressTimer.current) {
          clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
        }
        finishDrag();
      },

      // ── Mouse: long press 300ms to start drag ─────────────────────────────
      onMouseDown: (e: React.MouseEvent) => {
        e.stopPropagation();
        startPos.current = { x: e.clientX, y: e.clientY };

        longPressTimer.current = setTimeout(() => {
          isDragging.current = true;
          dragIndex.current = index;
          overIndex.current = index;
          setActiveIndex(index);
          setOverActiveIndex(index);
          setGhostLabel(label ?? String(index + 1));
          setGhostPos({ x: e.clientX, y: e.clientY });
          // Use CARD rect (itemRefs) for accurate size and offset calculation
          const cardEl = itemRefs.current[index];
          if (cardEl) {
            const rect = cardEl.getBoundingClientRect();
            setGhostSize({ width: rect.width, height: rect.height });
            setGhostOffset({
              x: e.clientX - rect.left,
              y: e.clientY - rect.top,
            });
          }
        }, 300);

        const onMouseMove = (ev: MouseEvent) => {
          if (!isDragging.current && startPos.current) {
            const dx = Math.abs(ev.clientX - startPos.current.x);
            const dy = Math.abs(ev.clientY - startPos.current.y);
            if (dx > 5 || dy > 5) {
              if (longPressTimer.current) {
                clearTimeout(longPressTimer.current);
                longPressTimer.current = null;
              }
            }
          }
          if (!isDragging.current) return;
          setGhostPos({ x: ev.clientX, y: ev.clientY });
          const elements = itemRefs.current;
          for (let i = 0; i < elements.length; i++) {
            const elItem = elements[i];
            if (!elItem) continue;
            const rect = elItem.getBoundingClientRect();
            if (ev.clientY >= rect.top && ev.clientY <= rect.bottom) {
              overIndex.current = i;
              setOverActiveIndex(i);
              break;
            }
          }
        };
        const onMouseUp = () => {
          finishDrag();
          window.removeEventListener("mousemove", onMouseMove);
          window.removeEventListener("mouseup", onMouseUp);
        };
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
      },
    };
  }, [finishDrag]);

  // Keep backward compat
  const getItemHandlers = getHandleHandlers;

  // Legacy combined handler (ref + events) — kept for backward compat but ref is now a no-op
  const getHandleHandlersLegacy = useCallback((index: number, label?: string) => {
    return {
      ref: getCardRef(index),
      ...getHandleHandlers(index, label),
    };
  }, [getCardRef, getHandleHandlers]);

  return {
    getItemHandlers,
    getHandleHandlers: getHandleHandlersLegacy,
    getCardRef,
    getHandleHandlersOnly: getHandleHandlers,
    activeIndex,
    overActiveIndex,
    ghostPos,
    ghostLabel,
    ghostSize,
    ghostOffset,
    isDragging: isDragging.current,
  };
}
