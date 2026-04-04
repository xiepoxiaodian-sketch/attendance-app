import { useRef, useState, useCallback } from "react";
import { Platform } from "react-native";

/**
 * A touch + mouse drag-sort hook for web.
 * - Long press (500ms) to activate drag on touch devices
 * - Mouse: long press (300ms) to activate drag
 *
 * Ghost card positioning strategy:
 * - ghostLeft = card's rect.left (fixed horizontal, matches card column exactly)
 * - ghostTop  = clientY - cursorOffsetInCard (vertical follows cursor, offset from card top)
 * - Both use position:fixed in the rendered ghost card
 *
 * Why not use rect.top for ghostTop?
 * - React Native Web's ScrollView adds transform:translateZ(0) which breaks position:fixed
 *   relative-to-viewport behaviour for children. Using clientY directly avoids this.
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

  // At drag start: record card's left edge and the cursor's offset from card top
  const cardLeft = useRef<number>(0);
  const cursorOffsetInCard = useRef<number>(0); // clientY - card.rect.top at drag start

  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [overActiveIndex, setOverActiveIndex] = useState<number | null>(null);
  const [ghostLeft, setGhostLeft] = useState<number>(0);
  const [ghostTop, setGhostTop] = useState<number>(0);
  const [ghostVisible, setGhostVisible] = useState(false);
  const [ghostLabel, setGhostLabel] = useState<string>("");
  const [ghostSize, setGhostSize] = useState<{ width: number; height: number }>({ width: 200, height: 56 });

  // itemRefs stores the CARD element (not the handle)
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
    setGhostVisible(false);
  }, [items, onReorder]);

  const activateDrag = useCallback((index: number, label: string | undefined, clientX: number, clientY: number) => {
    isDragging.current = true;
    dragIndex.current = index;
    overIndex.current = index;
    setActiveIndex(index);
    setOverActiveIndex(index);
    setGhostLabel(label ?? String(index + 1));

    const cardEl = itemRefs.current[index];
    if (cardEl) {
      const rect = cardEl.getBoundingClientRect();
      cardLeft.current = rect.left;
      cursorOffsetInCard.current = clientY - rect.top; // how far from card top the cursor is
      setGhostSize({ width: rect.width, height: rect.height });
      setGhostLeft(rect.left);
      setGhostTop(clientY - cursorOffsetInCard.current); // = rect.top at start
    }
    setGhostVisible(true);
    startPos.current = { x: clientX, y: clientY };
  }, []);

  const updateGhostPos = useCallback((clientY: number) => {
    // left stays fixed at card's left edge
    // top = clientY - cursorOffsetInCard (so cursor stays at same relative position in card)
    setGhostTop(clientY - cursorOffsetInCard.current);
  }, []);

  /**
   * Returns a ref callback to attach to the CARD element.
   */
  const getCardRef = useCallback((index: number) => {
    if (Platform.OS !== "web") return undefined;
    // @ts-ignore
    return (el: HTMLElement | null) => { itemRefs.current[index] = el; };
  }, []);

  /**
   * Returns event handlers to attach to the drag HANDLE element (☰ icon).
   * Does NOT include ref.
   */
  const getHandleHandlersOnly = useCallback((index: number, label?: string) => {
    if (Platform.OS !== "web") return {};

    return {
      // ── Touch: long press 500ms to start drag ──────────────────────────────
      onTouchStart: (e: React.TouchEvent) => {
        e.stopPropagation();
        const touch = e.touches[0];
        startPos.current = { x: touch.clientX, y: touch.clientY };

        longPressTimer.current = setTimeout(() => {
          activateDrag(index, label, touch.clientX, touch.clientY);
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
          activateDrag(index, label, e.clientX, e.clientY);
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
  }, [activateDrag, updateGhostPos, finishDrag]);

  // Legacy combined handler for backward compat
  const getHandleHandlers = useCallback((index: number, label?: string) => {
    return {
      ref: getCardRef(index),
      ...getHandleHandlersOnly(index, label),
    };
  }, [getCardRef, getHandleHandlersOnly]);

  const getItemHandlers = getHandleHandlers;

  // Expose ghostPos as {x, y} for backward compat, and ghostOffset as {x:0, y:0}
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
