import { useRef, useState, useCallback } from "react";
import { Platform } from "react-native";

/**
 * A touch + mouse drag-sort hook for web.
 * Returns handlers to attach to each list item and ghost element info.
 *
 * Usage:
 *   const { getItemHandlers, ghostPos, ghostLabel, ghostSize, activeIndex, overActiveIndex } = useDragSort({ items, onReorder });
 *   items.map((item, index) => <View {...getItemHandlers(index, item.name)} key={item.id}>...</View>)
 *   // Render ghost card outside the list using ghostPos + ghostLabel + ghostSize
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
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [overActiveIndex, setOverActiveIndex] = useState<number | null>(null);
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null);
  const [ghostLabel, setGhostLabel] = useState<string>("");
  const [ghostSize, setGhostSize] = useState<{ width: number; height: number }>({ width: 200, height: 56 });
  const itemRefs = useRef<(HTMLElement | null)[]>([]);

  const finishDrag = useCallback(() => {
    if (dragIndex.current !== null && overIndex.current !== null && dragIndex.current !== overIndex.current) {
      const newList = [...items];
      const [moved] = newList.splice(dragIndex.current, 1);
      newList.splice(overIndex.current, 0, moved);
      onReorder(newList);
    }
    dragIndex.current = null;
    overIndex.current = null;
    setActiveIndex(null);
    setOverActiveIndex(null);
    setGhostPos(null);
  }, [items, onReorder]);

  const getItemHandlers = useCallback((index: number, label?: string) => {
    if (Platform.OS !== "web") return {};

    return {
      // @ts-ignore
      ref: (el: HTMLElement | null) => { itemRefs.current[index] = el; },
      // Touch events for mobile
      onTouchStart: (e: React.TouchEvent) => {
        dragIndex.current = index;
        overIndex.current = index;
        setActiveIndex(index);
        setOverActiveIndex(index);
        setGhostLabel(label ?? String(index + 1));
        const touch = e.touches[0];
        setGhostPos({ x: touch.clientX, y: touch.clientY });
        // Capture size of the dragged element
        const el = itemRefs.current[index];
        if (el) {
          const rect = el.getBoundingClientRect();
          setGhostSize({ width: rect.width, height: rect.height });
        }
      },
      onTouchMove: (e: React.TouchEvent) => {
        e.preventDefault();
        const touch = e.touches[0];
        setGhostPos({ x: touch.clientX, y: touch.clientY });
        // Find which item we're hovering over
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
      onTouchEnd: () => { finishDrag(); },
      // Mouse events for desktop
      onMouseDown: (e: React.MouseEvent) => {
        dragIndex.current = index;
        overIndex.current = index;
        setActiveIndex(index);
        setOverActiveIndex(index);
        setGhostLabel(label ?? String(index + 1));
        setGhostPos({ x: e.clientX, y: e.clientY });
        // Capture size of the dragged element
        const el = itemRefs.current[index];
        if (el) {
          const rect = el.getBoundingClientRect();
          setGhostSize({ width: rect.width, height: rect.height });
        }
        const onMouseMove = (ev: MouseEvent) => {
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

  return {
    getItemHandlers,
    activeIndex,
    overActiveIndex,
    ghostPos,
    ghostLabel,
    ghostSize,
  };
}
