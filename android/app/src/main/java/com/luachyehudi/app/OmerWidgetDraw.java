package com.luachyehudi.app;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;

/**
 * The Omer widget's 7×7 field, as three white masks the layout tints (so light and dark need one set,
 * and Android 12+ switches them with the phone, like the rest of the widget):
 *   MUTED: the empty days (a thin ring), the days that went by unmarked (a faint disc), a missed day
 *          (a ring and a dot), and the band behind the week of the day shown
 *   DATE:  the counted days (the diary's green; Shabbat and Yom Tov taken as counted, lighter)
 *   RIBBON: the day of now (a saffron ring, filled softly until it is counted)
 * Geometry as the HTML twin (OmerWidgetMock, .ow-field): a square of side B, cells of B / 8.82,
 * gaps of 0.26 cell, half a gap round the band. Day 1 at the top right (Hebrew reads right to left).
 */
final class OmerWidgetDraw {

    static final int MUTED = 0;
    static final int DATE = 1;
    static final int RIBBON = 2;

    private OmerWidgetDraw() {}

    static Bitmap[] field(OmerWidgetModel m, int sizePx, float density) {
        int b = Math.max(16, sizePx);
        Bitmap[] out = new Bitmap[3];
        Canvas[] cv = new Canvas[3];
        for (int i = 0; i < 3; i++) {
            out[i] = Bitmap.createBitmap(b, b, Bitmap.Config.ARGB_8888);
            cv[i] = new Canvas(out[i]);
        }
        float c = b / 8.82f;
        float g = c * 0.26f;
        float o = g / 2f;
        float r = c / 2f;
        float hair = Math.max(1f, density);
        float ring = 1.5f * density;

        Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        fill.setColor(0xFFFFFFFF);
        fill.setStyle(Paint.Style.FILL);
        Paint stroke = new Paint(fill);
        stroke.setStyle(Paint.Style.STROKE);

        // the band behind the week of the day shown
        if (m.week > 0) {
            float top = o + (m.week - 1) * (c + g) - g / 2f;
            fill.setAlpha(Math.round(0.11f * 255));
            cv[MUTED].drawRoundRect(new RectF(0, top, b, top + c + g), (c + g) / 2f, (c + g) / 2f, fill);
        }

        for (int k = 0; k < 49; k++) {
            int row = k / 7;
            int col = k % 7;
            float cx = b - o - col * (c + g) - r;
            float cy = o + row * (c + g) + r;
            switch (m.cells[k]) {
                case OmerWidgetModel.FUTURE:
                    stroke.setStrokeWidth(hair);
                    stroke.setAlpha(Math.round(0.42f * 255));
                    cv[MUTED].drawCircle(cx, cy, r - hair / 2f, stroke);
                    break;
                case OmerWidgetModel.MISSED:
                    stroke.setStrokeWidth(hair);
                    stroke.setAlpha(Math.round(0.42f * 255));
                    cv[MUTED].drawCircle(cx, cy, r - hair / 2f, stroke);
                    fill.setAlpha(Math.round(0.75f * 255));
                    cv[MUTED].drawCircle(cx, cy, c * 0.12f, fill);
                    break;
                case OmerWidgetModel.PASSED:
                    fill.setAlpha(Math.round(0.18f * 255));
                    cv[MUTED].drawCircle(cx, cy, r, fill);
                    break;
                case OmerWidgetModel.ASSUMED:
                    fill.setAlpha(Math.round(0.4f * 255));
                    cv[DATE].drawCircle(cx, cy, r, fill);
                    break;
                case OmerWidgetModel.COUNTED:
                    fill.setAlpha(255);
                    cv[DATE].drawCircle(cx, cy, r, fill);
                    break;
                case OmerWidgetModel.TODAY:
                    fill.setAlpha(Math.round(0.26f * 255));
                    cv[RIBBON].drawCircle(cx, cy, r, fill);
                    stroke.setStrokeWidth(ring);
                    stroke.setAlpha(255);
                    cv[RIBBON].drawCircle(cx, cy, r - ring / 2f, stroke);
                    break;
                case OmerWidgetModel.TODAY_COUNTED:
                    fill.setAlpha(255);
                    cv[DATE].drawCircle(cx, cy, r, fill);
                    // a saffron ring just outside the green, with a hair of paper between
                    stroke.setStrokeWidth(1.25f * density);
                    stroke.setAlpha(255);
                    cv[RIBBON].drawCircle(cx, cy, r + 1.4f * density, stroke);
                    break;
                default:
                    break;
            }
        }
        return out;
    }
}
