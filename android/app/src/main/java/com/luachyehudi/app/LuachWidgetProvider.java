package com.luachyehudi.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.content.res.Resources;
import android.graphics.Bitmap;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.util.SizeF;
import android.view.View;
import android.widget.RemoteViews;
import java.util.Calendar;
import java.util.HashMap;
import java.util.Map;
import org.json.JSONObject;

/**
 * Home-screen widget: a page of the diary. The Hebrew date (it turns at sunset) set in Frank Ruhl Libre
 * under the saffron ribbon, the Gregorian date, the day's sky with "now" on it, the next zman with a live
 * countdown, the coming Shabbat or Yom Tov, and in the tall size the day's zmanim.
 *
 * All values are precomputed by the app (src/lib/widget.ts); WidgetModel picks what to show now and
 * WidgetDraw draws the two bitmaps. The widget wakes itself at the next boundary (a zman, sunset,
 * candle lighting, midnight) and every quarter of an hour for the sky's "now".
 *
 * Sizes: Android 12+ gets one layout per size and the launcher picks; older versions get the layout
 * that fits the size the launcher reports. Colours are set in code for light and dark together
 * (setColorInt on Android 12+), so the page and its text always change together.
 */
public class LuachWidgetProvider extends AppWidgetProvider {

    static final String PREFS = "luach_widget";
    static final String KEY = "data";
    static final String ACTION_TICK = "com.luachyehudi.app.WIDGET_TICK";
    private static final long HALF_HOUR = 30L * 60L * 1000L;

    /* the sizes, smallest first: layout, and the smallest size (dp) it is made for */
    private static final int XS = 0, S = 1, M_SHORT = 2, M = 3, L = 4;
    private static final int[] LAYOUTS = {R.layout.widget_xs, R.layout.widget_s, R.layout.widget_m_short, R.layout.widget_m, R.layout.widget_l};
    private static final float[][] SIZES = {{100, 100}, {100, 140}, {200, 100}, {200, 140}, {200, 230}};

    /* colours, in values/widget_colors.xml and values-night */
    private static final int PAPER = 0, EDGE = 1, LINE = 2, INK = 3, MUTED = 4, DATE = 5, RIBBON_INK = 6, CHAG = 7;
    private static final int[] COLOR_IDS = {
        R.color.widget_paper, R.color.widget_edge, R.color.widget_line, R.color.widget_ink,
        R.color.widget_muted, R.color.widget_date, R.color.widget_ribbon_ink, R.color.widget_chag,
    };

    private static final int[] SLOT = {R.id.w_s0, R.id.w_s1, R.id.w_s2, R.id.w_s3, R.id.w_s4, R.id.w_s5, R.id.w_s6, R.id.w_s7, R.id.w_s8, R.id.w_s9};
    private static final int[] SLOT_TAB = {R.id.w_t0, R.id.w_t1, R.id.w_t2, R.id.w_t3, R.id.w_t4, R.id.w_t5, R.id.w_t6, R.id.w_t7, R.id.w_t8, R.id.w_t9};
    private static final int[] SLOT_NAME = {R.id.w_n0, R.id.w_n1, R.id.w_n2, R.id.w_n3, R.id.w_n4, R.id.w_n5, R.id.w_n6, R.id.w_n7, R.id.w_n8, R.id.w_n9};
    private static final int[] SLOT_TIME = {R.id.w_v0, R.id.w_v1, R.id.w_v2, R.id.w_v3, R.id.w_v4, R.id.w_v5, R.id.w_v6, R.id.w_v7, R.id.w_v8, R.id.w_v9};

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        update(ctx, mgr, ids);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context ctx, AppWidgetManager mgr, int id, Bundle options) {
        update(ctx, mgr, new int[] {id});
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        super.onReceive(ctx, intent);
        String a = intent.getAction();
        if (ACTION_TICK.equals(a) || Intent.ACTION_TIMEZONE_CHANGED.equals(a) || Intent.ACTION_TIME_CHANGED.equals(a)) {
            refreshAll(ctx);
        }
    }

    @Override
    public void onDisabled(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(tickIntent(ctx));
    }

    static void refreshAll(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, LuachWidgetProvider.class));
        if (ids != null && ids.length > 0) update(ctx, mgr, ids);
    }

    static void update(Context ctx, AppWidgetManager mgr, int[] ids) {
        long now = System.currentTimeMillis();
        WidgetModel m = null;
        try {
            String raw = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null);
            if (raw != null) m = WidgetModel.from(new JSONObject(raw), now);
        } catch (Exception ignored) {
            // fall through to the "open the app" page
        }

        Palette pal = new Palette(ctx);
        float density = ctx.getResources().getDisplayMetrics().density;
        Bitmap dateFull = null;
        Bitmap dateShort = null;
        if (m != null) {
            float em = 28 * density;
            dateFull = WidgetDraw.date(ctx, m.dayMonth, m.year, em);
            dateShort = WidgetDraw.date(ctx, m.dayMonth, null, em);
        }

        for (int id : ids) {
            Bundle o = mgr.getAppWidgetOptions(id);
            Bitmap sky = null;
            if (m != null && m.sky != null) {
                int maxW = Math.max(o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH), o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH));
                if (maxW <= 0) maxW = 250;
                sky = WidgetDraw.sky(m, now, Math.min(1400, Math.round((maxW - 32) * density)), density);
            }
            RemoteViews v;
            if (Build.VERSION.SDK_INT >= 31) {
                Map<SizeF, RemoteViews> map = new HashMap<>();
                for (int k = 0; k < LAYOUTS.length; k++) {
                    map.put(new SizeF(SIZES[k][0], SIZES[k][1]), build(ctx, k, m, now, pal, dateFull, dateShort, sky));
                }
                v = new RemoteViews(map);
            } else {
                v = build(ctx, pick(ctx, o), m, now, pal, dateFull, dateShort, sky);
            }
            mgr.updateAppWidget(id, v);
        }

        long wake = m != null ? m.wake : now + HALF_HOUR;
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(now);
        c.add(Calendar.DAY_OF_YEAR, 1);
        c.set(Calendar.HOUR_OF_DAY, 0);
        c.set(Calendar.MINUTE, 0);
        c.set(Calendar.SECOND, 5);
        schedule(ctx, Math.min(wake, c.getTimeInMillis()));
    }

    /** Before Android 12: the layout for the size the launcher reports (portrait: min width × max height) */
    private static int pick(Context ctx, Bundle o) {
        boolean land = ctx.getResources().getConfiguration().orientation == Configuration.ORIENTATION_LANDSCAPE;
        int w = land ? o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH) : o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH);
        int h = land ? o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT) : o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT);
        if (w <= 0 || h <= 0) return M;
        int best = XS;
        for (int k = 0; k < SIZES.length; k++) {
            if (w >= SIZES[k][0] && h >= SIZES[k][1]) best = k;
        }
        return best;
    }

    private static RemoteViews build(Context ctx, int size, WidgetModel m, long now, Palette pal, Bitmap dateFull, Bitmap dateShort, Bitmap sky) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), LAYOUTS[size]);
        pal.set(v, R.id.w_paper, "setColorFilter", PAPER);
        pal.set(v, R.id.w_edge, "setColorFilter", EDGE);

        Intent open = new Intent(ctx, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        v.setOnClickPendingIntent(android.R.id.background, PendingIntent.getActivity(ctx, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));

        if (m == null) {
            v.setViewVisibility(R.id.w_content, View.GONE);
            v.setViewVisibility(R.id.w_empty, View.VISIBLE);
            pal.set(v, R.id.w_empty, "setTextColor", INK);
            return v;
        }
        v.setViewVisibility(R.id.w_content, View.VISIBLE);
        v.setViewVisibility(R.id.w_empty, View.GONE);
        boolean small = size == XS || size == S;

        // the Hebrew date
        v.setImageViewBitmap(R.id.w_date, small ? dateShort : dateFull);
        pal.set(v, R.id.w_date, "setColorFilter", DATE);
        v.setContentDescription(R.id.w_date, m.year.isEmpty() ? m.dayMonth : m.dayMonth + " " + m.year);

        // the Gregorian date, and beside it the day's label, the city or "אור ליום …"
        if (size == S) {
            int dot = m.greg.indexOf(" · ");
            v.setTextViewText(R.id.w_greg, m.eve ? m.side : dot >= 0 ? m.greg.substring(dot + 3) : m.greg);
            pal.set(v, R.id.w_greg, "setTextColor", MUTED);
            pal.set(v, R.id.w_rule, "setBackgroundColor", LINE);
        } else if (size == M || size == L) {
            v.setTextViewText(R.id.w_greg, m.greg);
            pal.set(v, R.id.w_greg, "setTextColor", MUTED);
            boolean em = m.sideKind == WidgetModel.SIDE_LABEL || m.sideKind == WidgetModel.SIDE_CHAG;
            v.setViewVisibility(R.id.w_side, em ? View.GONE : View.VISIBLE);
            v.setViewVisibility(R.id.w_side_em, em ? View.VISIBLE : View.GONE);
            v.setTextViewText(em ? R.id.w_side_em : R.id.w_side, m.side);
            pal.set(v, R.id.w_side, "setTextColor", MUTED);
            pal.set(v, R.id.w_side_em, "setTextColor", m.sideKind == WidgetModel.SIDE_CHAG ? CHAG : INK);
            if (sky != null) {
                v.setImageViewBitmap(R.id.w_sky, sky);
                v.setViewVisibility(R.id.w_sky, View.VISIBLE);
            } else {
                v.setViewVisibility(R.id.w_sky, View.INVISIBLE);
            }
            pal.set(v, R.id.w_vrule, "setBackgroundColor", LINE);
        }

        // the next zman, with a live countdown
        boolean hasNext = m.nextAt > 0;
        for (int id : new int[] {R.id.w_next_name, R.id.w_next_time, R.id.w_count}) v.setViewVisibility(id, hasNext ? View.VISIBLE : View.GONE);
        if (hasNext) {
            v.setTextViewText(R.id.w_next_name, m.nextName);
            v.setTextViewText(R.id.w_next_time, m.nextTime);
            v.setChronometer(R.id.w_count, SystemClock.elapsedRealtime() + (m.nextAt - now), ctx.getString(R.string.widget_count), true);
            v.setChronometerCountDown(R.id.w_count, true);
            pal.set(v, R.id.w_next_name, "setTextColor", MUTED);
            pal.set(v, R.id.w_next_time, "setTextColor", INK);
            pal.set(v, R.id.w_count, "setTextColor", RIBBON_INK);
        }

        // the coming Shabbat or Yom Tov: candle lighting and havdalah
        if (!small) {
            boolean hasHoly = m.holyName != null;
            v.setViewVisibility(R.id.w_holy, hasHoly ? View.VISIBLE : View.GONE);
            if (size == M) v.setViewVisibility(R.id.w_vrule, hasHoly ? View.VISIBLE : View.GONE);
            if (hasHoly) {
                v.setTextViewText(R.id.w_holy_name, m.holyName);
                v.setTextViewText(R.id.w_in_time, m.holyIn);
                v.setTextViewText(R.id.w_out_time, m.holyOut);
                v.setViewVisibility(R.id.w_candle, m.candlesToday ? View.VISIBLE : View.GONE);
                pal.set(v, R.id.w_candle, "setColorFilter", RIBBON_INK);
                pal.set(v, R.id.w_holy_name, "setTextColor", MUTED);
                pal.set(v, R.id.w_in_label, "setTextColor", MUTED);
                pal.set(v, R.id.w_out_label, "setTextColor", MUTED);
                pal.set(v, R.id.w_in_time, "setTextColor", m.candlesToday ? RIBBON_INK : m.inside ? MUTED : INK);
                pal.set(v, R.id.w_out_time, "setTextColor", INK);
            }
        }

        // the day's zmanim (tall size): past ones quiet, the next one under the small ribbon
        if (size == L) {
            for (int i = 0; i < SLOT.length; i++) {
                if (i >= m.list.size()) {
                    v.setViewVisibility(SLOT[i], View.GONE);
                    continue;
                }
                int st = m.listState.get(i);
                v.setViewVisibility(SLOT[i], View.VISIBLE);
                v.setTextViewText(SLOT_NAME[i], m.list.get(i)[0]);
                v.setTextViewText(SLOT_TIME[i], m.list.get(i)[1]);
                int col = st == WidgetModel.PAST ? MUTED : st == WidgetModel.NEXT ? RIBBON_INK : INK;
                pal.set(v, SLOT_NAME[i], "setTextColor", col);
                pal.set(v, SLOT_TIME[i], "setTextColor", col);
                v.setViewVisibility(SLOT_TAB[i], st == WidgetModel.NEXT ? View.VISIBLE : View.INVISIBLE);
            }
        }
        return v;
    }

    /** The widget's colours for light and dark, from the colour resources */
    private static final class Palette {
        final int[] light = new int[COLOR_IDS.length];
        final int[] dark = new int[COLOR_IDS.length];
        final boolean night;

        Palette(Context ctx) {
            Resources res = ctx.getResources();
            night = (res.getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
            Context l = mode(ctx, Configuration.UI_MODE_NIGHT_NO);
            Context d = mode(ctx, Configuration.UI_MODE_NIGHT_YES);
            for (int i = 0; i < COLOR_IDS.length; i++) {
                light[i] = l.getColor(COLOR_IDS[i]);
                dark[i] = d.getColor(COLOR_IDS[i]);
            }
        }

        private static Context mode(Context ctx, int night) {
            Configuration c = new Configuration(ctx.getResources().getConfiguration());
            c.uiMode = (c.uiMode & ~Configuration.UI_MODE_NIGHT_MASK) | night;
            return ctx.createConfigurationContext(c);
        }

        /**
         * Android 12+: both colours, and the launcher switches with the phone's dark mode.
         * Before: the colour of the current mode for every view at once, so the page never mixes the two
         * (a switch shows on the next refresh, at most a quarter of an hour later).
         */
        void set(RemoteViews v, int id, String method, int key) {
            if (Build.VERSION.SDK_INT >= 31) v.setColorInt(id, method, light[key], dark[key]);
            else v.setInt(id, method, night ? dark[key] : light[key]);
        }
    }

    private static PendingIntent tickIntent(Context ctx) {
        Intent i = new Intent(ctx, LuachWidgetProvider.class).setAction(ACTION_TICK);
        return PendingIntent.getBroadcast(ctx, 1, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /** Non-waking alarm: delivered when the phone is next in use, which is when a widget matters. */
    private static void schedule(Context ctx, long at) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.set(AlarmManager.RTC, at, tickIntent(ctx));
    }
}
