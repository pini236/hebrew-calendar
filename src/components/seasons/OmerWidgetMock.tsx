/**
 * The Omer home-screen widget, drawn in HTML: the live preview on the introduction screen and the
 * design previews (design/omer). The same sizes in dp (1 dp = 1 CSS px), the same colours as
 * android/app/src/main/res/values{,-night}/widget_colors.xml, the same layouts as res/layout/omer_widget_*.xml
 * (each box below is a LinearLayout there), and the same bitmaps: the large figure and the title in
 * Frank Ruhl Libre with the baseline at 0.82 em, the field and the sky (omerWidgetDraw.ts, the twin of
 * OmerWidgetDraw.java). The decisions are omerWidgetModel() in src/lib/widget.ts, which OmerWidgetModel.java
 * mirrors line for line.
 */
import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import type { OmerWidgetModel } from '../../lib/widget';
import { GREEN, MUTED, RIBBON, drawField, drawSky, ribbonBox, tint } from './omerWidgetDraw';
import './omer.css';

export type OmerWidgetSize = 's' | 'm' | 'w' | 't';

/** dp: the weeks' labels beside the field, and the gap after them */
const WEEKS_W = 38;

/** dp: the field's side, the large figure's em, the title's em (OmerWidgetProvider.FIELD_DP and the layouts) */
export const OW_SIZES: Record<OmerWidgetSize, { w: number; h: number; field: number; em: number; bigEm: number; titleEm: number; labels: boolean }> = {
  s: { w: 117, h: 166, field: 84, em: 34, bigEm: 30, titleEm: 15, labels: false },
  m: { w: 250, h: 166, field: 106, em: 46, bigEm: 38, titleEm: 20, labels: false },
  w: { w: 316, h: 166, field: 106, em: 50, bigEm: 44, titleEm: 21, labels: true },
  t: { w: 250, h: 258, field: 138, em: 50, bigEm: 44, titleEm: 21, labels: true },
};

const PALETTE = {
  light: { paper: '#faf6ec', edge: '#dfdcd2', ink: '#1d1c19', muted: '#6c685f', date: '#1e5a45', green: '#1e5a45', ribbon: '#e3a73a', ribbonInk: '#8a5807' },
  dark: { paper: '#1b1a18', edge: '#353331', ink: '#eeebe4', muted: '#9a958b', date: '#f3ecdd', green: '#79c9a6', ribbon: '#e2ae4c', ribbonInk: '#ebbd62' },
};

/** the widget's own font file (assets/fonts/widget_date.ttf) where the page declares it (the previews), else the app's */
const FACE = "WDate, 'Geresh Serif', 'Frank Ruhl Libre', serif";

/** WidgetDraw.date: one line of Frank Ruhl Libre, em tall, the baseline at 0.82 em */
function Serif({ text, em, color, he, className, baseline }: { text: string; em: number; color: string; he: boolean; className?: string; baseline?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const cv = ref.current!;
    const dpr = window.devicePixelRatio || 1;
    let live = true;
    const draw = () => {
      if (!live) return;
      const k = cv.getContext('2d')!;
      k.font = `500 ${em * dpr}px ${FACE}`;
      const w = Math.ceil(k.measureText(text).width) + 2 * dpr;
      cv.width = w;
      cv.height = Math.round(em * dpr);
      cv.style.width = `${w / dpr}px`;
      k.font = `500 ${em * dpr}px ${FACE}`;
      k.direction = he ? 'rtl' : 'ltr';
      k.textAlign = 'left';
      k.fillStyle = color;
      k.fillText(text, dpr, em * dpr * 0.82);
    };
    draw();
    document.fonts.load(`500 ${em}px ${FACE}`, text).then(draw, () => {});
    document.fonts.ready.then(draw, () => {});
    return () => {
      live = false;
    };
  }, [text, em, color, he]);
  // `baseline`: in a row aligned on the baseline, the figure's own baseline (0.82 em) sits on the words' (android:baseline)
  return <canvas ref={ref} className={className} aria-hidden="true" style={baseline ? { marginBottom: -0.18 * em } : undefined} />;
}

/** A one-line TextView with autoSizeTextType="uniform" (steps of 1sp, down to `min`), as the layouts set the sefira */
function Fit({ text, max, min, className }: { text: string; max: number; min: number; className: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current!;
    let size = max;
    el.style.fontSize = `${size}px`;
    const fit = () => {
      while (size > min && el.scrollWidth > el.clientWidth + 0.5) el.style.fontSize = `${--size}px`;
    };
    fit();
    document.fonts.ready.then(fit, () => {});
  }, [text, max, min]);
  return (
    <span ref={ref} className={`${className} ow-fit`}>
      {text}
    </span>
  );
}

function Field({ m, f, tab, pal }: { m: OmerWidgetModel; f: number; tab: boolean; pal: (typeof PALETTE)['light'] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const dpr = Math.max(2, window.devicePixelRatio || 1);
    const b = Math.round(f * dpr);
    const masks = drawField(m, b, tab);
    const cv = ref.current!;
    cv.width = cv.height = b;
    const k = cv.getContext('2d')!;
    k.clearRect(0, 0, b, b);
    k.drawImage(tint(masks[MUTED], pal.muted), 0, 0);
    k.drawImage(tint(masks[GREEN], pal.green), 0, 0);
    k.drawImage(tint(masks[RIBBON], pal.ribbon), 0, 0);
  }, [m, f, tab, pal]);
  return <canvas ref={ref} style={{ width: f, height: f }} aria-hidden="true" />;
}

function Sky({ band, he, w, ribbon }: { band: NonNullable<OmerWidgetModel['band']>; he: boolean; w: number; ribbon: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const dpr = Math.max(2, window.devicePixelRatio || 1);
    // w = 0: as wide as its column (match_parent)
    const width = w || ref.current!.parentElement!.clientWidth;
    const cv = drawSky(band, he, width * dpr, dpr, ribbon);
    cv.style.width = `${width}px`;
    cv.style.height = '10px';
    cv.style.display = 'block';
    ref.current!.replaceChildren(cv);
  }, [band, he, w, ribbon]);
  return <div ref={ref} className="ow-sky" />;
}

/**
 * `ribbon`: the URL of the ribbon's first frame (res/drawable-nodpi/widget_ribbon_f00.png), placed on the day as
 * Android 12+ places the frames; without it the still ribbon is drawn into the field, as on older Android and in 2×2.
 */
export function OmerWidgetMock({ m, size = 'm', theme = 'light', ribbon }: { m: OmerWidgetModel; size?: OmerWidgetSize; theme?: 'light' | 'dark'; ribbon?: string }) {
  const L = OW_SIZES[size];
  const pal = PALETTE[theme];
  const count = m.state === 'count';
  const frames = !!ribbon && size !== 's';
  const box = frames ? ribbonBox(m, L.field) : null;
  const label = count ? `${m.num} · ${m.sefira} · ${m.sub}` : `${m.sefira} · ${m.pre} ${m.num} ${m.post} · ${m.sub}`;

  const field = (
    <div className="ow-fieldwrap">
      {L.labels && (
        <div className="ow-weeks" style={{ height: L.field }}>
          {m.weeks.map((w, i) => (
            <span key={i} className={m.week === i + 1 ? 'on' : ''}>
              {w}
            </span>
          ))}
        </div>
      )}
      <div className="ow-field" style={{ width: L.field, height: L.field }}>
        <Field m={m} f={L.field} tab={!frames} pal={pal} />
        {box && <img className="ow-tab" src={ribbon} alt="" style={{ left: box.left, top: box.top, width: box.size, height: box.size }} />}
      </div>
    </div>
  );
  const fieldW = L.field + (L.labels ? WEEKS_W : 0);
  const skyW = size === 't' ? 0 : fieldW;
  const next = m.next && m.band && (
    <div className="ow-next" style={{ width: skyW || undefined }}>
      <Sky band={m.band} he={m.he} w={skyW} ribbon={pal.ribbon} />
      <div className="ow-next-row">
        <span className="ow-next-l">{m.next.label}</span>
        <span className="ow-next-t">{m.next.time}</span>
      </div>
    </div>
  );
  const done = count && m.done && <span className="ow-done">{m.doneText}</span>;
  const big = (
    <div className="ow-big">
      {m.pre && <span className="ow-big-w">{m.pre}</span>}
      <Serif text={m.num} em={L.bigEm} color={pal.date} he={m.he} className="ow-big-n" baseline />
      {m.post && <span className="ow-big-w">{m.post}</span>}
    </div>
  );
  const head = (
    <>
      <Serif text={m.sefira} em={L.titleEm} color={pal.ink} he={m.he} className="ow-title" />
      <span className="ow-start">{size === 'm' ? m.sub.replace(' · ', '\n') : m.sub}</span>
    </>
  );

  const style = {
    width: L.w,
    height: L.h,
    '--ow-paper': pal.paper,
    '--ow-edge': pal.edge,
    '--ow-ink': pal.ink,
    '--ow-muted': pal.muted,
    '--ow-green': pal.green,
    '--ow-ribbon': pal.ribbon,
    '--ow-ribbon-ink': pal.ribbonInk,
  } as CSSProperties;

  let body;
  if (size === 's') {
    // 2×2: the figure and one line above, the field below
    body = (
      <div className="ow-col">
        <div className="ow-top">
          <Serif text={m.num} em={count ? L.em : L.bigEm} color={pal.date} he={m.he} className="ow-num" />
          <span className="ow-sp" />
          {count && m.next ? (
            <div className="ow-s-next">
              <span className="ow-next-l">{m.next.short}</span>
              <span className="ow-next-t">{m.next.time}</span>
            </div>
          ) : count ? (
            done
          ) : (
            <span className="ow-big-w">{m.post}</span>
          )}
        </div>
        <Fit text={m.sefira} max={12} min={9} className="ow-sef" />
        <span className="ow-sp" />
        {field}
      </div>
    );
  } else if (size === 't') {
    // 4×3: the day and its count across the top, the field, the sky to the next count
    body = count ? (
      <div className="ow-col">
        <div className="ow-head">
          <Serif text={m.num} em={L.em} color={pal.date} he={m.he} className="ow-num" />
          <div className="ow-text">
            <Fit text={m.sefira} max={14} min={10} className="ow-sef" />
            <span className="ow-sp" />
            {next ?? done}
          </div>
        </div>
        <span className="ow-count">{m.sub}</span>
        <span className="ow-sp" />
        <div className="ow-center">{field}</div>
        <span className="ow-sp" />
      </div>
    ) : (
      <div className="ow-col">
        <div className="ow-text">{head}</div>
        <span className="ow-sp" />
        <div className="ow-center">{field}</div>
        <span className="ow-sp" />
        {big}
      </div>
    );
  } else {
    // 4×2 and 5×2: the text beside the field
    body = (
      <div className="ow-row">
        {count ? (
          <div className="ow-text">
            <Serif text={m.num} em={L.em} color={pal.date} he={m.he} className="ow-num" />
            <Fit text={m.sefira} max={14} min={10} className="ow-sef" />
            <span className="ow-count">{m.sub}</span>
          </div>
        ) : (
          <div className="ow-text">
            {head}
            <span className="ow-sp" />
            {big}
          </div>
        )}
        <div className="ow-left">
          {field}
          {next ?? (done && <div className="ow-status">{done}</div>)}
        </div>
      </div>
    );
  }

  return (
    <div className={`ow ow-${size} ow-${m.state}`} dir={m.he ? 'rtl' : 'ltr'} lang={m.he ? 'he' : 'en'} role="img" aria-label={label} style={style}>
      {body}
    </div>
  );
}
