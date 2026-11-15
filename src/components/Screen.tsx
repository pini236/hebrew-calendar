import { useEffect, useRef, type ReactNode } from 'react';
import { tr } from '../lib/i18n';
import { Icon } from './Icon';

/**
 * A pushed full-height screen (location, notifications, go-to-date, event editor).
 * It slides over the tabs with a back button; Escape and the phone's back gesture close it.
 */
export function Screen({ title, onClose, children, action }: { title: string; onClose: () => void; children: ReactNode; action?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.({ preventScroll: true });
    };
  }, [onClose]);
  return (
    <div className="screen" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
      <header className="screen-bar">
        <button className="icon-btn" onClick={onClose} aria-label={tr('חזרה', 'Back')}>
          <Icon name="back" size={22} />
        </button>
        <h2>{title}</h2>
        <div className="screen-action">{action}</div>
      </header>
      <div className="screen-body">{children}</div>
    </div>
  );
}
