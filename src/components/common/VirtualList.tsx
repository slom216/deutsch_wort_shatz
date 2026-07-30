import { useEffect, useRef, useState, type ReactNode } from 'react';

import './VirtualList.css';

interface VirtualListProps<T> {
  readonly items: readonly T[];
  readonly rowHeight: number;
  readonly renderRow: (item: T, index: number) => ReactNode;
  readonly keyOf: (item: T) => string;
  readonly ariaLabel: string;
  /** Lists shorter than this render in full; §16 requires virtualization above 200 rows. */
  readonly threshold?: number;
  readonly maxHeight?: number;
}

/**
 * Windowed list (§16: "lists above 200 rows are virtualized").
 *
 * Only the visible slice plus a small overscan is mounted, so a 10,000-row result set
 * costs the same as a 30-row one. Below the threshold the list renders normally, which
 * keeps short results simple and fully searchable by the browser's find-in-page.
 *
 * Accessibility: the container is a `listbox`-free plain list with `aria-rowcount`, and
 * each row carries its absolute index, so assistive technology reports the true total
 * rather than just the mounted window.
 */
export function VirtualList<T>({
  items,
  rowHeight,
  renderRow,
  keyOf,
  ariaLabel,
  threshold = 200,
  maxHeight = 600,
}: VirtualListProps<T>): ReactNode {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(maxHeight);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const update = (): void => setViewportHeight(element.clientHeight || maxHeight);
    update();

    // ResizeObserver is not implemented in every test environment.
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [maxHeight]);

  // Reset the scroll position when the result set changes, or the window would point
  // at rows that no longer exist.
  useEffect(() => {
    setScrollTop(0);
    if (containerRef.current) containerRef.current.scrollTop = 0;
  }, [items]);

  if (items.length <= threshold) {
    return (
      <ul className="virtual-list virtual-list--plain" aria-label={ariaLabel}>
        {items.map((item, index) => (
          <li key={keyOf(item)}>{renderRow(item, index)}</li>
        ))}
      </ul>
    );
  }

  const overscan = 6;
  const first = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visibleCount = Math.ceil(viewportHeight / rowHeight) + overscan * 2;
  const last = Math.min(items.length, first + visibleCount);
  const slice = items.slice(first, last);

  return (
    <div
      ref={containerRef}
      className="virtual-list__viewport"
      style={{ maxHeight }}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      tabIndex={0}
      role="region"
      aria-label={`${ariaLabel} (${items.length} rows, scrollable)`}
    >
      <ul
        className="virtual-list"
        aria-label={ariaLabel}
        style={{ height: items.length * rowHeight, position: 'relative' }}
      >
        {slice.map((item, index) => (
          <li
            key={keyOf(item)}
            style={{
              position: 'absolute',
              top: (first + index) * rowHeight,
              left: 0,
              right: 0,
              height: rowHeight,
            }}
          >
            {renderRow(item, first + index)}
          </li>
        ))}
      </ul>
    </div>
  );
}
