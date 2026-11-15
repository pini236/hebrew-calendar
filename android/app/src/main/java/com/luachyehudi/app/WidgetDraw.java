package com.luachyehudi.app;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;

/**
 * The two things a widget layout can't draw by itself, as small bitmaps:
 * the Hebrew date in Frank Ruhl Libre (a white mask; the layout tints it, so light and dark need one bitmap)
 * and the day's sky band. Both are a few hundred KB at most, far under the RemoteViews limit.
 */
final class WidgetDraw {

    private static Typeface dateFace;

    /** top of the Hebrew letters above the baseline, as a share of the em (Frank Ruhl Libre: 0.80) */
    private static final float ASCENT = 0.82f;
    /** the year is set smaller and lighter than the day and month, as in the app's header */
    private static final float YEAR_SIZE = 0.78f;
    private static final int YEAR_ALPHA = 158;

    private WidgetDraw() {}

    static Typeface dateFace(Context ctx) {
        if (dateFace == null) {
            try {
                dateFace = Typeface.createFromAsset(ctx.getAssets(), "fonts/widget_date.ttf");
            } catch (RuntimeException e) {
                dateFace = Typeface.create(Typeface.SERIF, Typeface.NORMAL);
            }
        }
        return dateFace;
    }

    /**
     * The Hebrew date, one line, em pixels tall (the layout's ImageView is 28dp: an em of 28dp).
     * Day and month opaque, the year (when given) lighter. White: the ImageView's colour filter colours it.
     */
    static Bitmap date(Context ctx, String dayMonth, String year, float em) {
        Paint dm = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.SUBPIXEL_TEXT_FLAG);
        dm.setTypeface(dateFace(ctx));
        dm.setTextSize(em);
        dm.setColor(0xFFFFFFFF);
        Paint yr = new Paint(dm);
        yr.setTextSize(em * YEAR_SIZE);
        yr.setAlpha(YEAR_ALPHA);

        boolean withYear = year != null && !year.isEmpty();
        float wDm = dm.measureText(dayMonth);
        float gap = withYear ? dm.measureText(" ") : 0;
        float wYr = withYear ? yr.measureText(year) : 0;
        int w = Math.max(1, (int) Math.ceil(wDm + gap + wYr) + 2);
        int h = Math.max(1, Math.round(em));
        Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(b);
        float base = em * ASCENT;
        // right to left: the day and month on the right, the year to their left.
        // Each part is one Hebrew run, so drawText lays it out right to left by itself.
        c.drawText(dayMonth, w - 1 - wDm, base, dm);
        if (withYear) c.drawText(year, 1, base, yr);
        return b;
    }

    /**
     * The day as one strip of sky colours, midnight to midnight, right to left (like the app's Today card):
     * thin light marks at sunrise and sunset, and "now" as a saffron tick. 10dp tall, the band 6dp of it.
     */
    static Bitmap sky(WidgetModel m, long now, int widthPx, float density) {
        int w = Math.max(8, widthPx);
        int h = Math.max(4, Math.round(10 * density));
        Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(b);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);

        int n = 48;
        int[] colors = new int[n + 1];
        float[] pos = new float[n + 1];
        for (int i = 0; i <= n; i++) {
            long at = m.midnight + Math.round(i / (double) n * 86400000d);
            colors[i] = skyMid(at, m.sky);
            pos[i] = i / (float) n;
        }
        float top = 2 * density;
        float bandH = 6 * density;
        p.setShader(new LinearGradient(w, 0, 0, 0, colors, pos, Shader.TileMode.CLAMP));
        c.drawRoundRect(new RectF(0, top, w, top + bandH), 3 * density, 3 * density, p);
        p.setShader(null);

        p.setColor(0x8CFFFFFF);
        float hair = Math.max(1f, density);
        for (long t : new long[] {m.sky[1], m.sky[2]}) {
            float x = (1 - m.frac(t)) * w;
            c.drawRect(x - hair / 2, top, x + hair / 2, top + bandH, p);
        }

        p.setColor(0xFFE3A73A);
        float tick = 2 * density;
        float x = Math.min(w - tick / 2, Math.max(tick / 2, (1 - m.frac(now)) * w));
        c.drawRoundRect(new RectF(x - tick / 2, 0, x + tick / 2, h), density, density, p);
        return b;
    }

    /* ---------------- the sky colours of src/lib/sky.ts (the middle colour of each stop) ---------------- */

    private static final int NIGHT = 0x0b1230;
    private static final int DAWN = 0x2d2a63;
    private static final int SUNRISE = 0x5f6fa8;
    private static final int MORNING = 0x3d86cf;
    private static final int NOON = 0x2f7bcb;
    private static final int AFTERNOON = 0x4d84bf;
    private static final int SUNSET = 0x7a4b78;
    private static final int DUSK = 0x272558;

    /** skyAt(now, t).background's middle colour, as the app's dayRibbon() samples it */
    static int skyMid(long now, long[] t) {
        double dawn = t[0];
        double rise = t[1];
        double set = t[2];
        double dusk = t[3];
        double hr = 3600000d;
        double[] at = {dawn - 0.5 * hr, dawn + (rise - dawn) * 0.45, rise, rise + 1.5 * hr, (rise + set) / 2, set - 1.6 * hr, set, set + (dusk - set) * 0.6, dusk + 0.6 * hr};
        int[] col = {NIGHT, DAWN, SUNRISE, MORNING, NOON, AFTERNOON, SUNSET, DUSK, NIGHT};
        int out = NIGHT;
        if (now > at[0] && now < at[at.length - 1]) {
            for (int i = 0; i < at.length - 1; i++) {
                if (now >= at[i] && now <= at[i + 1]) {
                    out = mix(col[i], col[i + 1], (now - at[i]) / (at[i + 1] - at[i]));
                    break;
                }
            }
        }
        return 0xFF000000 | out;
    }

    private static int mix(int a, int b, double f) {
        int r = (int) Math.round(((a >> 16) & 255) + (((b >> 16) & 255) - ((a >> 16) & 255)) * f);
        int g = (int) Math.round(((a >> 8) & 255) + (((b >> 8) & 255) - ((a >> 8) & 255)) * f);
        int bl = (int) Math.round((a & 255) + ((b & 255) - (a & 255)) * f);
        return (r << 16) | (g << 8) | bl;
    }
}
