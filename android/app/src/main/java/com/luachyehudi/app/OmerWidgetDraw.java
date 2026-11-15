package com.luachyehudi.app;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Shader;

/**
 * The Omer widget's bitmaps. The 7×7 field as white masks the layout tints (so one set serves light and
 * dark, and Android 12+ can switch them with the phone, like the rest of the widget):
 *   MUTED:  the empty days (a thin ring, dimmer before the season), a day that went by unmarked (a faint
 *           disc), a missed day (a ring and a dot), and the band behind the week of the day shown
 *   GREEN:  the counted days (the diary's green; Shabbat and Yom Tov taken as counted, lighter)
 *   RIBBON: the day of now (a saffron ring, filled softly until it is counted, or a ring round the green),
 *           Lag BaOmer's small dot, and (where no frames play) the ribbon itself, at rest on the day
 * and the sky from dawn to the next count. The large figure and the title are WidgetDraw.date.
 * The HTML twin is src/components/seasons/omerWidgetDraw.ts: the same geometry and alphas, line for line.
 * Geometry: a square of side B, cells of B / 8.82, gaps of 0.26 cell, half a gap round the band.
 * Day 1 at the top right in Hebrew (right to left), at the top left in English.
 */
final class OmerWidgetDraw {

    static final int MUTED = 0;
    static final int GREEN = 1;
    static final int RIBBON = 2;
    /** RIBBON with the still ribbon drawn on the day */
    static final int RIBBON_TAB = 3;

    private OmerWidgetDraw() {}

    /** the cell's diameter for a field of side b */
    static float cell(float b) {
        return b / 8.82f;
    }

    /** the centre of day k (1–49) in a field of side b: {x, y} */
    static float[] center(float b, int k, boolean rtl) {
        float c = cell(b);
        float g = c * 0.26f;
        float o = g / 2f;
        float r = c / 2f;
        int row = (k - 1) / 7;
        int col = (k - 1) % 7;
        float x = o + col * (c + g) + r;
        return new float[] {rtl ? b - x : x, o + row * (c + g) + r};
    }

    /** the day the ribbon marks: the count of now, day 1 before the count, none (0) after it */
    static int ribbonDay(OmerWidgetModel m) {
        if (m.state == OmerWidgetModel.STATE_AFTER) return 0;
        return m.state == OmerWidgetModel.STATE_BEFORE ? 1 : m.n;
    }

    /**
     * Where the ribbon's frames go in a field of side f dp: {left, top, size} in dp, or null.
     * The frames are 22×22 with a 10×18 ribbon hanging from 2 down, centred; scaled so the ribbon is
     * about a cell long, its top just above the cell's (as ribbonBox in omerWidgetDraw.ts).
     */
    static float[] ribbonBox(OmerWidgetModel m, float f) {
        int day = ribbonDay(m);
        if (day == 0) return null;
        float c = cell(f);
        float r = c / 2f;
        float[] p = center(f, day, m.he);
        float s = c * 0.92f / 18f;
        float box = 22f * s;
        return new float[] {p[0] - box / 2f, Math.max(0f, p[1] - r - c * 0.06f - 2f * s), box};
    }

    /** the four masks (MUTED, GREEN, RIBBON, RIBBON_TAB), b px square */
    static Bitmap[] field(OmerWidgetModel m, int sizePx) {
        int b = Math.max(16, sizePx);
        Bitmap[] out = new Bitmap[4];
        Canvas[] cv = new Canvas[4];
        for (int i = 0; i < 3; i++) {
            out[i] = Bitmap.createBitmap(b, b, Bitmap.Config.ARGB_8888);
            cv[i] = new Canvas(out[i]);
        }
        float c = cell(b);
        float g = c * 0.26f;
        float o = g / 2f;
        float r = c / 2f;
        float hair = c * 0.075f;
        float ring = c * 0.11f;
        boolean before = m.state == OmerWidgetModel.STATE_BEFORE;

        Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        fill.setColor(0xFFFFFFFF);
        fill.setStyle(Paint.Style.FILL);
        Paint stroke = new Paint(fill);
        stroke.setStyle(Paint.Style.STROKE);

        // the band behind the week of the day shown
        if (m.week > 0) {
            float top = o + (m.week - 1) * (c + g) - g / 2f;
            fill.setAlpha(a(0.11f));
            cv[MUTED].drawRoundRect(new RectF(0, top, b, top + c + g), (c + g) / 2f, (c + g) / 2f, fill);
        }

        for (int k = 1; k <= 49; k++) {
            float[] p = center(b, k, m.he);
            float x = p[0];
            float y = p[1];
            int cell = m.cells[k - 1];
            switch (cell) {
                case OmerWidgetModel.FUTURE:
                    ring(cv[MUTED], stroke, before ? 0.34f : 0.42f, hair, x, y, r - hair / 2f);
                    break;
                case OmerWidgetModel.MISSED:
                    ring(cv[MUTED], stroke, 0.42f, hair, x, y, r - hair / 2f);
                    disc(cv[MUTED], fill, 0.75f, x, y, c * 0.12f);
                    break;
                case OmerWidgetModel.PASSED:
                    disc(cv[MUTED], fill, 0.18f, x, y, r);
                    break;
                case OmerWidgetModel.ASSUMED:
                    disc(cv[GREEN], fill, 0.4f, x, y, r);
                    break;
                case OmerWidgetModel.COUNTED:
                    disc(cv[GREEN], fill, 1f, x, y, r);
                    break;
                case OmerWidgetModel.TODAY:
                    disc(cv[RIBBON], fill, 0.24f, x, y, r);
                    ring(cv[RIBBON], stroke, 1f, ring, x, y, r - ring / 2f);
                    break;
                case OmerWidgetModel.TODAY_COUNTED:
                    disc(cv[GREEN], fill, 1f, x, y, r);
                    // a saffron ring just outside the green, with a hair of paper between
                    ring(cv[RIBBON], stroke, 1f, c * 0.09f, x, y, r + c * 0.1f);
                    break;
                default:
                    break;
            }
            // Lag BaOmer, quietly: a small saffron dot in its cell (not under the ribbon)
            if (k == OmerWidgetModel.LAG_BAOMER && cell != OmerWidgetModel.TODAY && cell != OmerWidgetModel.TODAY_COUNTED) {
                disc(cv[RIBBON], fill, before ? 0.7f : 1f, x, y, c * 0.13f);
            }
        }

        // the same RIBBON mask with the ribbon at rest on the day (2×2, and before Android 12, where no frames play)
        out[RIBBON_TAB] = out[RIBBON].copy(Bitmap.Config.ARGB_8888, true);
        int day = ribbonDay(m);
        if (day > 0) {
            float[] p = center(b, day, m.he);
            float w = c * 0.5f;
            float top = p[1] - r - c * 0.06f;
            float len = c * 0.92f;
            Path tab = new Path();
            tab.moveTo(p[0] - w / 2f, top);
            tab.lineTo(p[0] + w / 2f, top);
            tab.lineTo(p[0] + w / 2f, top + len);
            tab.lineTo(p[0], top + len - w * 0.5f);
            tab.lineTo(p[0] - w / 2f, top + len);
            tab.close();
            fill.setAlpha(255);
            new Canvas(out[RIBBON_TAB]).drawPath(tab, fill);
        }
        return out;
    }

    private static int a(float alpha) {
        return Math.round(alpha * 255);
    }

    private static void disc(Canvas cv, Paint p, float alpha, float x, float y, float rad) {
        p.setAlpha(a(alpha));
        cv.drawCircle(x, y, rad, p);
    }

    private static void ring(Canvas cv, Paint p, float alpha, float width, float x, float y, float rad) {
        p.setAlpha(a(alpha));
        p.setStrokeWidth(width);
        cv.drawCircle(x, y, rad, p);
    }

    /**
     * The day from dawn to the next count in the sky's colours (WidgetDraw.skyMid), in the reading direction
     * (dawn at the start): light hairlines at sunrise and sunset, "now" as a saffron tick. 10dp tall, the band 6dp.
     * band = {from, to, sunrise, sunset, now}.
     */
    static Bitmap sky(long[] band, boolean rtl, int widthPx, float density) {
        int w = Math.max(8, widthPx);
        int h = Math.max(4, Math.round(10 * density));
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        long from = band[0];
        long to = band[1];
        double span = Math.max(1, to - from);
        long[] sk = {from, band[2], band[3], to};

        int n = 32;
        int[] colors = new int[n + 1];
        float[] pos = new float[n + 1];
        for (int i = 0; i <= n; i++) {
            colors[i] = WidgetDraw.skyMid(from + Math.round(i / (double) n * span), sk);
            pos[i] = i / (float) n;
        }
        float top = 2 * density;
        float bandH = 6 * density;
        p.setShader(new LinearGradient(rtl ? w : 0, 0, rtl ? 0 : w, 0, colors, pos, Shader.TileMode.CLAMP));
        c.drawRoundRect(new RectF(0, top, w, top + bandH), 3 * density, 3 * density, p);
        p.setShader(null);

        p.setColor(0x8CFFFFFF);
        float hair = Math.max(1f, density);
        for (long t : new long[] {band[2], band[3]}) {
            float x = x(t, from, span, rtl, w);
            c.drawRect(x - hair / 2, top, x + hair / 2, top + bandH, p);
        }

        p.setColor(0xFFE3A73A);
        float tick = 2 * density;
        float x = Math.min(w - tick / 2, Math.max(tick / 2, x(band[4], from, span, rtl, w)));
        c.drawRoundRect(new RectF(x - tick / 2, 0, x + tick / 2, h), density, density, p);
        return bmp;
    }

    private static float x(long t, long from, double span, boolean rtl, int w) {
        float f = (float) Math.min(1, Math.max(0, (t - from) / span));
        return rtl ? (1 - f) * w : f * w;
    }
}
