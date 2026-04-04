import { useRef, useState, useCallback } from "react";
import { Platform } from "react-native";

/**
 * A touch + mouse drag-sort hook for web.
 *
 * Key design:
 * - Hook accepts a `getId` function to extract a unique string ID from each item.
 * - itemRefMap: Map<string, HTMLElement> keyed by unique item ID (never by index).
 * - During drag-over detection, we iterate items via `items.map(getId)` — no indexToId mapping needed.
 *   This prevents index collisions when the same hook renders items across multiple visual groups
 *   (e.g., shift cards appearing in both "內場" and "外場" groups where each group starts at index 0).
 *
 * Ghost card positioning:
 * - Uses fixed full-screen overlay + absolute inner card
 * - ghostLeft = card rect.left (fixed horizontal)
 * - ghostTop  = clientY - cursorOffsetInCard (vertical follows cursor)
 */
export function useDragSort<T>({
  items,
  onReorder,
  getId,
}: {
  items: T[];
  onReorder: (newItems: T[]) => void;
  getId: (item: T) => string;
}) {
  const dragIndex = useRef<number | null>(null);
  const overIndex = useRef<number | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDragging = useRef(false);
  const startPos = useRef<{ x: number; y: number } | null>(null);

  // At drag start: cursor offset from card top
  const cursorOffsetInCard = useRef<number>(0);

  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [overActiveIndex, setOverActiveIndex] = useState<number | null>(null);
  const [ghostLeft, setGhostLeft] = useState<number>(0);
  const [ghostTop, setGhostTop] = useState<number>(0);
  const [ghostVisible, setGhostVisible] = useState(false);
  const [ghostLabel, setGhostLabel] = useState<string>("");
  const [ghostSize, setGhostSize] = useState<{ width: number; height: number }>({ width: 200, height: 56 });

  // itemRefMap: keyed by unique item ID — never by array index
  const itemRefMap = useRef<Map<string, HTMLElement>>(new Map());

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
    setGhostVisible(false);
  }, [items, onReorder]);

  const activateDrag = useCallback((index: number, id: string, label: string | undefined, clientX: number, clientY: number) => {
    isDragging.current = true;
    dragIndex.current = index;
    overIndex.current = index;
    setActiveIndex(index);
    setOverActiveIndex(index);
    setGhostLabel(label ?? String(index + 1));

    const cardEl = itemRefMap.current.get(id);
    if (cardEl) {
      const rect = cardEl.getBoundingClientRect();
      cursorOffsetInCard.current = clientY - rect.top;
      setGhostSize({ width: rect.width, height: rect.height });
      setGhostLeft(rect.left);
      setGhostTop(clientY - cursorOffsetInCard.current); // = rect.top at start
    }
    setGhostVisible(true);
    startPos.current = { x: clientX, y: clientY };
  }, []);

  const updateGhostPos = useCallback((clientY: number) => {
    setGhostTop(clientY - cursorOffsetInCard.current);
  }, []);

  /**
   * Detect which item index the cursor is over, using items.map(getId) — no indexToId needed.
   */
  const detectOverIndex = useCallback((clientY: number) => {
    const orderedIds = items.map(getId);
    for (let i = 0; i < orderedIds.length; i++) {
      const el = itemRefMap.current.get(orderedIds[i]);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (clientY >= rect.top && clientY <= rect.bottom) {
        overIndex.current = i;
        setOverActiveIndex(i);
        break;
      }
    }
  }, [items, getId]);

  /**
   * Returns a ref callback to attach to the CARD element.
   * @param id - unique string ID of the item (e.g. String(shift.id))
   */
  const getCardRef = useCallback((id: string) => {
    if (Platform.OS !== "web") return undefined;
    // @ts-ignore
    return (el: HTMLElement | null) => {
      if (el) {
        itemRefMap.current.set(id, el);
      }
    };
  }, []);

  /**
   * Returns event handlers to attach to the drag HANDLE element (☰ icon).
   * @param index - position in the items array (localShifts index)
   * @param id - unique string ID of the item
   * @param label - display label for ghost card
   */
  const getHandleHandlersOnly = useCallback((index: number, id: string, label?: string) => {
    if (Platform.OS !== "web") return {};

    return {
      // ── Touch: long press 500ms to start drag ──────────────────────────────
      onTouchStart: (e: React.TouchEvent) => {
        e.stopPropagation();
        const touch = e.touches[0];
        startPos.current = { x: touch.clientX, y: touch.clientY };

        longPressTimer.current = setTimeout(() => {
          activateDrag(index, id, label, touch.clientX, touch.clientY);
          if (typeof navigator !== "undefined" && (navigator as any).vibrate) {
            (navigator as any).vibrate(30);
          }
        }, 500);
      },
      onTouchMove: (e: React.TouchEvent) => {
        const touch = e.touches[0];
        if (!isDragging.current && startPos.current) {
          const dx = Math.abs(touch.clientX - startPos.current.x);
          const dy = Math.abs(touch.clientY - startPos.current.y);
          if (dx > 8 || dy > 8) {
            if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
            return;
          }
        }
        if (!isDragging.current) return;
        e.preventDefault();
        updateGhostPos(touch.clientY);
        detectOverIndex(touch.clientY);
      },
      onTouchEnd: () => {
        if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
        finishDrag();
      },
      onTouchCancel: () => {
        if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
        finishDrag();
      },

      // ── Mouse: long press 300ms to start drag ─────────────────────────────
      onMouseDown: (e: React.MouseEvent) => {
        e.stopPropagation();
        startPos.current = { x: e.clientX, y: e.clientY };

        longPressTimer.current = setTimeout(() => {
          activateDrag(index, id, label, e.clientX, e.clientY);
        }, 300);

        const onMouseMove = (ev: MouseEvent) => {
          if (!isDragging.current && startPos.current) {
            const dx = Math.abs(ev.clientX - startPos.current.x);
            const dy = Math.abs(ev.clientY - startPos.current.y);
            if (dx > 5 || dy > 5) {
              if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
            }
          }
          if (!isDragging.current) return;
          updateGhostPos(ev.clientY);
          detectOverIndex(ev.clientY);
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
  }, [activateDrag, updateGhostPos, detectOverIndex, finishDrag]);

  // Legacy combined handler for backward compat (uses String(index) as id)
  const getHandleHandlers = useCallback((index: number, label?: string) => {
    const id = String(index);
    return {
      ref: getCardRef(id),
      ...getHandleHandlersOnly(index, id, label),
    };
  }, [getCardRef, getHandleHandlersOnly]);

  const getItemHandlers = getHandleHandlers;

  // Expose ghostPos as {x, y} for backward compat
  const ghostPos = ghostVisible ? { x: ghostLeft, y: ghostTop } : null;
  const ghostOffset = { x: 0, y: 0 };

  return {
    getItemHandlers,
    getHandleHandlers,
    getCardRef,
    getHandleHandlersOnly,
    activeIndex,
    overActiveIndex,
    ghostPos,
    ghostLeft,
    ghostTop,
    ghostVisible,
    ghostLabel,
    ghostSize,
    ghostOffset,
    isDragging: isDragging.current,
  };
}
