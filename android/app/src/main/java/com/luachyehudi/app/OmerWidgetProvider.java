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
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.TypefaceSpan;
import android.util.SizeF;
import android.util.TypedValue;
import android.view.View;
import android.widget.RemoteViews;
import java.util.HashMap;
import java.util.Map;
import org.json.JSONObject;

/**
 * Home-screen widget for Sefirat HaOmer, a page of the same diary as the main widget.
 *
 * In the season: the day of the count large (Frank Ruhl Libre, as the main widget's date), its sefira, the count
 * in the user's nusach, and the 49 days as a 7×7 field (counted days in the diary's green, the day of now in
 * saffron with the silk ribbon on it, its week on a band, Lag BaOmer a small saffron dot). Before nightfall the
 * day's sky from dawn to the next count with "now" on it, and when that count begins; once the day is marked in
 * the app, "ספרתי". Outside the season: the title, when the count begins (ליל ט״ז בניסן and the date) and how many
 * days are left, over the field at rest; for two weeks after Shavuot, the season's summary.
 *
 * It reads the same JSON as the main widget (WidgetBridgePlugin.setData; the "om" block from src/lib/widget.ts and
 * the day's sky from "days"). OmerWidgetModel picks what to show now, OmerWidgetDraw draws the field and the sky,
 * WidgetDraw.date the large figure and the title. The widget wakes itself at the next nightfall, at dawn, at midnight
 * and every twenty minutes before nightfall (the sky's "now").
 *
 * Sizes: 2×2, 4×2, 5×2 and wider (the weeks named beside the field), 4×3 and taller. Android 12+ gets one layout per
 * size and the ribbon's frames placed on the day; older versions get the layout for the reported size and the still
 * ribbon drawn into the field.
 */
public class OmerWidgetProvider extends AppWidgetProvider {

    static final String ACTION_TICK = "com.luachyehudi.app.OMER_WIDGET_TICK";

    /* the sizes, smallest first: layout, the smallest size (dp) it is made for, its field's side (dp, 0 = fills) */
    private static final int S = 0, M = 1, W = 2, T = 3;
    private static final int[] LAYOUTS = {R.layout.omer_widget_s, R.layout.omer_widget_m, R.layout.omer_widget_w, R.layout.omer_widget_t};
    private static final float[][] SIZES = {{100, 100}, {200, 100}, {290, 100}, {200, 200}};
    private static final float[] FIELD_DP = {0, 106, 106, 138};
    /** the sky's width (dp) where it shows: under the field (4×2), under the field and its weeks (5×2), beside the day (4×3) */
    private static final float[] SKY_DP = {0, 106, 144, 130};
    /** the largest field and the bitmaps' scale: at most xxhdpi, sharp enough for discs and far under the RemoteViews limit */
    private static final float FIELD_MAX_DP = 138;
    private static final float MAX_SCALE = 2.625f;
    /** em of the large figures (dp), drawn once at the largest size; each layout's ImageView scales them */
    private static final float NUM_EM = 50, BIG_EM = 44, TITLE_EM = 21;

    private static final int PAPER = 0, EDGE = 1, INK = 2, MUTED = 3, DATE = 4, GREEN = 5, RIBBON = 6, FAINT = 7;
    private static final int[] COLOR_IDS = {
        R.color.widget_paper, R.color.widget_edge, R.color.widget_ink, R.color.widget_muted, R.color.widget_date, R.color.widget_green, R.color.widget_ribbon,
    };

    private static final int[] WEEK_IDS = {R.id.w_wk0, R.id.w_wk1, R.id.w_wk2, R.id.w_wk3, R.id.w_wk4, R.id.w_wk5, R.id.w_wk6};

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
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, OmerWidgetProvider.class));
        if (ids != null && ids.length > 0) update(ctx, mgr, ids);
    }

    /** The bitmaps of one moment, shared by every size (RemoteViews keeps one copy of each) */
    private static final class Art {
        Bitmap num;
        Bitmap title;
        Bitmap[] field;
        final Bitmap[] sky = new Bitmap[LAYOUTS.length];
    }

    static void update(Context ctx, AppWidgetManager mgr, int[] ids) {
        long now = System.currentTimeMillis();
        OmerWidgetModel m = null;
        try {
            String raw = ctx.getSharedPreferences(LuachWidgetProvider.PREFS, Context.MODE_PRIVATE).getString(LuachWidgetProvider.KEY, null);
            if (raw != null) m = OmerWidgetModel.from(new JSONObject(raw), now);
        } catch (Exception ignored) {
            // fall through to the "open the app" page
        }

        Palette pal = new Palette(ctx);
        float density = ctx.getResources().getDisplayMetrics().density;
        float scale = Math.min(density, MAX_SCALE);
        Art art = new Art();
        if (m != null) {
            boolean count = m.state == OmerWidgetModel.STATE_COUNT;
            art.num = WidgetDraw.date(ctx, m.num, null, (count ? NUM_EM : BIG_EM) * density);
            if (!count) art.title = WidgetDraw.date(ctx, m.sefira, null, TITLE_EM * density);
            art.field = OmerWidgetDraw.field(m, Math.round(FIELD_MAX_DP * scale));
            if (m.band != null) {
                for (int k = M; k <= T; k++) art.sky[k] = OmerWidgetDraw.sky(m.band, m.he, Math.round(SKY_DP[k] * density), density);
            }
        }

        for (int id : ids) {
            RemoteViews v;
            if (Build.VERSION.SDK_INT >= 31) {
                Map<SizeF, RemoteViews> map = new HashMap<>();
                for (int k = 0; k < LAYOUTS.length; k++) map.put(new SizeF(SIZES[k][0], SIZES[k][1]), build(ctx, k, m, pal, art));
                v = new RemoteViews(map);
            } else {
                v = build(ctx, pick(ctx, mgr.getAppWidgetOptions(id)), m, pal, art);
            }
            mgr.updateAppWidget(id, v);
        }
        schedule(ctx, m != null ? m.wake : now + 6 * 3600000L);
    }

    /** Before Android 12: the layout for the size the launcher reports (portrait: min width × max height) */
    private static int pick(Context ctx, Bundle o) {
        boolean land = ctx.getResources().getConfiguration().orientation == Configuration.ORIENTATION_LANDSCAPE;
        int w = land ? o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH) : o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH);
        int h = land ? o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT) : o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT);
        if (w <= 0 || h <= 0) return M;
        if (w >= SIZES[T][0] && h >= SIZES[T][1]) return T;
        if (w >= SIZES[W][0]) return W;
        return w >= SIZES[M][0] ? M : S;
    }

    private static RemoteViews build(Context ctx, int size, OmerWidgetModel m, Palette pal, Art art) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), LAYOUTS[size]);
        pal.set(v, R.id.w_paper, "setColorFilter", PAPER);
        pal.set(v, R.id.w_edge, "setColorFilter", EDGE);

        Intent open = new Intent(ctx, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        v.setOnClickPendingIntent(android.R.id.background, PendingIntent.getActivity(ctx, 2, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));

        if (m == null) {
            v.setViewVisibility(R.id.w_content, View.GONE);
            v.setViewVisibility(R.id.w_empty, View.VISIBLE);
            pal.set(v, R.id.w_empty, "setTextColor", INK);
            return v;
        }
        v.setViewVisibility(R.id.w_content, View.VISIBLE);
        v.setViewVisibility(R.id.w_empty, View.GONE);
        // the layouts are right to left; English reads left to right (the field is drawn mirrored to match)
        if (!m.he) v.setInt(R.id.w_content, "setLayoutDirection", View.LAYOUT_DIRECTION_LTR);

        boolean count = m.state == OmerWidgetModel.STATE_COUNT;
        boolean next = count && m.nextTime != null;
        // "ספרתי" once the day is marked, where the next count would be (before nightfall the next count wins)
        boolean done = count && m.done && !next;

        // the day (count) or the large figure (before and after), in Frank Ruhl Libre
        if (size == S) {
            show(v, R.id.w_num, count);
            show(v, R.id.w_bignum, !count);
            int fig = count ? R.id.w_num : R.id.w_bignum;
            v.setImageViewBitmap(fig, art.num);
            pal.set(v, fig, "setColorFilter", DATE);
            v.setContentDescription(fig, count ? m.num : m.pre + " " + m.num + " " + m.post);
            text(v, pal, R.id.w_sef, m.sefira, INK);
            show(v, R.id.w_post, !count && !m.post.isEmpty());
            if (!count) text(v, pal, R.id.w_post, m.post, MUTED);
        } else {
            boolean tall = size == T;
            show(v, tall ? R.id.w_head : R.id.w_num, count);
            if (!tall) show(v, R.id.w_sef, count);
            show(v, R.id.w_count, count);
            show(v, R.id.w_title, !count);
            show(v, R.id.w_start, !count);
            show(v, R.id.w_big, !count);
            if (count) {
                v.setImageViewBitmap(R.id.w_num, art.num);
                pal.set(v, R.id.w_num, "setColorFilter", DATE);
                v.setContentDescription(R.id.w_num, m.num);
                text(v, pal, R.id.w_sef, m.sefira, INK);
                text(v, pal, R.id.w_count, m.sub, MUTED);
            } else {
                v.setImageViewBitmap(R.id.w_title, art.title);
                pal.set(v, R.id.w_title, "setColorFilter", INK);
                v.setContentDescription(R.id.w_title, m.sefira);
                // 4×2 has room for the start on two lines: the night, then the date
                text(v, pal, R.id.w_start, size == M ? m.sub.replace(" · ", "\n") : m.sub, MUTED);
                v.setImageViewBitmap(R.id.w_bignum, art.num);
                pal.set(v, R.id.w_bignum, "setColorFilter", DATE);
                v.setContentDescription(R.id.w_bignum, m.num);
                show(v, R.id.w_pre, !m.pre.isEmpty());
                show(v, R.id.w_post, !m.post.isEmpty());
                text(v, pal, R.id.w_pre, m.pre, MUTED);
                text(v, pal, R.id.w_post, m.post, MUTED);
            }
        }

        // before nightfall: the sky to the next count, and its hour (2×2: the hour only)
        show(v, R.id.w_next, next);
        if (next) {
            text(v, pal, R.id.w_next_label, size == S ? m.nextShort : m.nextLabel, MUTED);
            text(v, pal, R.id.w_next_time, m.nextTime, INK);
            if (size != S) v.setImageViewBitmap(R.id.w_sky, art.sky[size]);
        }
        // "ספרתי": under the field (4×2, 5×2), beside the day (4×3), in the corner (2×2)
        show(v, R.id.w_done, done);
        if (done) {
            text(v, pal, R.id.w_done_text, m.doneText, GREEN);
            pal.set(v, R.id.w_done_dot, "setColorFilter", GREEN);
        }

        // the weeks, named beside the field (5×2, 4×3): the week of now in ink
        if (size == W || size == T) {
            for (int i = 0; i < 7; i++) {
                boolean on = m.week == i + 1;
                CharSequence label = m.weeks[i];
                if (on) {
                    SpannableString s = new SpannableString(m.weeks[i]);
                    s.setSpan(new TypefaceSpan("sans-serif-medium"), 0, s.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                    label = s;
                }
                v.setTextViewText(WEEK_IDS[i], label);
                pal.set(v, WEEK_IDS[i], "setTextColor", on ? INK : FAINT);
            }
        }

        // the field: three tinted masks, and the ribbon's frames on the day (Android 12+, the fixed-size fields)
        boolean frames = Build.VERSION.SDK_INT >= 31 && size != S;
        v.setImageViewBitmap(R.id.w_f_muted, art.field[OmerWidgetDraw.MUTED]);
        v.setImageViewBitmap(R.id.w_f_green, art.field[OmerWidgetDraw.GREEN]);
        v.setImageViewBitmap(R.id.w_f_ribbon, art.field[frames ? OmerWidgetDraw.RIBBON : OmerWidgetDraw.RIBBON_TAB]);
        pal.set(v, R.id.w_f_muted, "setColorFilter", MUTED);
        pal.set(v, R.id.w_f_green, "setColorFilter", GREEN);
        pal.set(v, R.id.w_f_ribbon, "setColorFilter", RIBBON);
        v.setContentDescription(R.id.w_field, count ? m.num + " · " + m.sefira + " · " + m.sub : m.sefira + " · " + m.sub);
        if (size != S) {
            float[] box = frames ? OmerWidgetDraw.ribbonBox(m, FIELD_DP[size]) : null;
            show(v, R.id.w_ribbon, box != null);
            if (box != null && Build.VERSION.SDK_INT >= 31) {
                int dip = TypedValue.COMPLEX_UNIT_DIP;
                v.setViewLayoutWidth(R.id.w_ribbon, box[2], dip);
                v.setViewLayoutHeight(R.id.w_ribbon, box[2], dip);
                v.setViewLayoutMargin(R.id.w_ribbon, RemoteViews.MARGIN_LEFT, box[0], dip);
                v.setViewLayoutMargin(R.id.w_ribbon, RemoteViews.MARGIN_TOP, box[1], dip);
            }
        }
        return v;
    }

    private static void show(RemoteViews v, int id, boolean on) {
        v.setViewVisibility(id, on ? View.VISIBLE : View.GONE);
    }

    private static void text(RemoteViews v, Palette pal, int id, CharSequence s, int color) {
        v.setTextViewText(id, s);
        pal.set(v, id, "setTextColor", color);
    }

    /** The widget's colours for light and dark (the same resources as the main widget), and the weeks' fainter grey */
    private static final class Palette {
        final int[] light = new int[COLOR_IDS.length + 1];
        final int[] dark = new int[COLOR_IDS.length + 1];
        final boolean night;

        /** the app's colour scheme ("light", "dark" or "auto" = the phone's), from the data the app pushes */
        final String theme;

        Palette(Context ctx) {
            Resources res = ctx.getResources();
            String t = "light";
            try {
                String raw = ctx.getSharedPreferences(LuachWidgetProvider.PREFS, Context.MODE_PRIVATE).getString(LuachWidgetProvider.KEY, null);
                if (raw != null) t = new JSONObject(raw).optString("theme", "light");
            } catch (Exception ignored) {
                // no data yet: light, as the app
            }
            theme = t;
            boolean phoneNight = (res.getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
            night = "dark".equals(theme) || ("auto".equals(theme) && phoneNight);
            Context l = mode(ctx, Configuration.UI_MODE_NIGHT_NO);
            Context d = mode(ctx, Configuration.UI_MODE_NIGHT_YES);
            for (int i = 0; i < COLOR_IDS.length; i++) {
                light[i] = l.getColor(COLOR_IDS[i]);
                dark[i] = d.getColor(COLOR_IDS[i]);
            }
            // the weeks' labels: the muted grey at 70%
            light[FAINT] = (light[MUTED] & 0x00FFFFFF) | 0xB3000000;
            dark[FAINT] = (dark[MUTED] & 0x00FFFFFF) | 0xB3000000;
        }

        private static Context mode(Context ctx, int night) {
            Configuration c = new Configuration(ctx.getResources().getConfiguration());
            c.uiMode = (c.uiMode & ~Configuration.UI_MODE_NIGHT_MASK) | night;
            return ctx.createConfigurationContext(c);
        }

        void set(RemoteViews v, int id, String method, int key) {
            // the app's scheme wins; only "auto" lets the launcher switch with the phone (Android 12+)
            if ("auto".equals(theme) && Build.VERSION.SDK_INT >= 31) v.setColorInt(id, method, light[key], dark[key]);
            else v.setInt(id, method, night ? dark[key] : light[key]);
        }
    }

    private static PendingIntent tickIntent(Context ctx) {
        Intent i = new Intent(ctx, OmerWidgetProvider.class).setAction(ACTION_TICK);
        return PendingIntent.getBroadcast(ctx, 3, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /** Non-waking alarm, as the main widget: delivered when the phone is next in use */
    private static void schedule(Context ctx, long at) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.set(AlarmManager.RTC, at, tickIntent(ctx));
    }

    /** Android 8+: ask the launcher to add this widget (it shows its own confirmation) */
    static boolean requestPin(Context ctx) {
        if (Build.VERSION.SDK_INT < 26) return false;
        AppWidgetManager mgr = ctx.getSystemService(AppWidgetManager.class);
        if (mgr == null || !mgr.isRequestPinAppWidgetSupported()) return false;
        return mgr.requestPinAppWidget(new ComponentName(ctx, OmerWidgetProvider.class), null, null);
    }

    static boolean canPin(Context ctx) {
        if (Build.VERSION.SDK_INT < 26) return false;
        AppWidgetManager mgr = ctx.getSystemService(AppWidgetManager.class);
        return mgr != null && mgr.isRequestPinAppWidgetSupported();
    }
}
