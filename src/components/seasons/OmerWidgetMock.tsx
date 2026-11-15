/**
 * The Omer home-screen widget, drawn in HTML: the live preview on the introduction screen and the
 * design previews (design/omer). Same sizes in dp (1 dp = 1 CSS px), same colours as
 * android/app/src/main/res/values{,-night}/widget_colors.xml, same field geometry as
 * OmerWidgetDraw.java, and the same decisions: omerWidgetModel() in src/lib/widget.ts, which
 * OmerWidgetModel.java mirrors line for line.
 */
import type { CSSProperties } from 'react';
import { CELL, type OmerWidgetModel } from '../../lib/widget';
import './omer.css';

const KIND = ['future', 'counted', 'missed', 'passed', 'today', 'today-counted', 'assumed'];

export function OmerWidgetMock({ m, size = 'm', theme, ribbon }: { m: OmerWidgetModel; size?: 's' | 'm'; theme?: 'light' | 'dark'; ribbon?: string }) {
  const rows = Array.from({ length: 7 }, (_, w) => m.cells.slice(w * 7, w * 7 + 7));
  return (
    <div className={`ow ow-${size} ${theme ? `ow-${theme}` : ''}`} dir="rtl" lang="he" role="img" aria-label={`${m.num ? m.num + ' · ' : ''}${m.sefira} · ${m.sub}`}>
      {ribbon && <img className="ow-ribbon" src={ribbon} alt="" />}
      {!ribbon && <i className="ow-ribbon ow-ribbon-css" aria-hidden="true" />}
      <div className="ow-text">
        {m.num ? <b className="ow-num">{m.num}</b> : <b className="ow-title">{m.sefira}</b>}
        {m.num && <span className="ow-sef">{m.sefira}</span>}
        {(size === 'm' || !m.num) && <span className="ow-sub">{m.sub}</span>}
      </div>
      <div className="ow-field">
        {rows.map((r, w) => (
          <div key={w} className={`ow-row ${m.week === w + 1 ? 'wk' : ''}`}>
            {r.map((c, i) => (
              <i key={i} className={`ow-c ${KIND[c]}`} style={{ '--k': w * 7 + i } as CSSProperties} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export { CELL };
