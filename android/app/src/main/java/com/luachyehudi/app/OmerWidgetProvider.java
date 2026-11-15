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
import android.util.SizeF;
import android.view.View;
import android.widget.RemoteViews;
import java.util.HashMap;
import java.util.Map;
import org.json.JSONObject;

/**
 * Home-screen widget for Sefirat HaOmer: the day of the count large (Frank Ruhl Libre, as the main
 * widget's date), its sefira, and the 49 days as a 7×7 field: counted days filled, the day of now in
 * saffron, its week on a band. Outside the season: "ספירת העומר תתחיל בעוד N ימים", and for two weeks
 * after Shavuot the season's summary.
 *
 * It reads the same JSON as the main widget (WidgetBridgePlugin.setData; the "om" block from
 * src/lib/widget.ts): when each count begins (nightfall, so the day turns at tzeit) and what the user
 * marked in the app. OmerWidgetModel picks what to show now; OmerWidgetDraw draws the field.
 * The widget wakes itself at the next nightfall and at midnight.
 */
public class OmerWidgetProvider extends AppWidgetProvider {

    static final String ACTION_TICK = "com.luachyehudi.app.OMER_WIDGET_TICK";

    /* the sizes: 2×2 (the number above the field) and 4×2 and up (side by side) */
    private static final int S = 0, M = 1;
    private static final int[] LAYOUTS = {R.layout.omer_widget_s, R.layout.omer_widget_m};
    private static final float[][] SIZES = {{100, 100}, {200, 100}};
    /** the field's side in the larger layout (dp); the small one shows the same bitmap smaller */
    private static final float FIELD_DP = 118f;

    private static final int PAPER = 0, EDGE = 1, INK = 2, MUTED = 3, DATE = 4, RIBBON = 5;
    private static final int[] COLOR_IDS = {
        R.color.widget_paper, R.color.widget_edge, R.color.widget_ink, R.color.widget_muted, R.color.widget_date, R.color.widget_ribbon,
    };

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
        Bitmap num = null;
        Bitmap[] field = null;
        if (m != null) {
            if (!m.num.isEmpty()) num = WidgetDraw.date(ctx, m.num, null, 46 * density);
            // at most 2.75× (xxhdpi): sharp enough for a field of small discs, and well under the RemoteViews limit
            field = OmerWidgetDraw.field(m, Math.round(FIELD_DP * Math.min(density, 2.75f)), Math.min(density, 2.75f));
        }

        for (int id : ids) {
            RemoteViews v;
            if (Build.VERSION.SDK_INT >= 31) {
                Map<SizeF, RemoteViews> map = new HashMap<>();
                for (int k = 0; k < LAYOUTS.length; k++) map.put(new SizeF(SIZES[k][0], SIZES[k][1]), build(ctx, k, m, pal, num, field));
                v = new RemoteViews(map);
            } else {
                v = build(ctx, pick(ctx, mgr.getAppWidgetOptions(id)), m, pal, num, field);
            }
            mgr.updateAppWidget(id, v);
        }
        schedule(ctx, m != null ? m.wake : now + 6 * 3600000L);
    }

    /** Before Android 12: the layout for the width the launcher reports */
    private static int pick(Context ctx, Bundle o) {
        boolean land = ctx.getResources().getConfiguration().orientation == Configuration.ORIENTATION_LANDSCAPE;
        int w = land ? o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH) : o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH);
        if (w <= 0) return M;
        return w >= SIZES[M][0] ? M : S;
    }

    private static RemoteViews build(Context ctx, int size, OmerWidgetModel m, Palette pal, Bitmap num, Bitmap[] field) {
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

        // the number of the day (a bitmap in the date font), or the title before the count
        boolean hasNum = num != null;
        v.setViewVisibility(R.id.w_num, hasNum ? View.VISIBLE : View.GONE);
        v.setViewVisibility(R.id.w_title, hasNum ? View.GONE : View.VISIBLE);
        if (hasNum) {
            v.setImageViewBitmap(R.id.w_num, num);
            pal.set(v, R.id.w_num, "setColorFilter", DATE);
            v.setContentDescription(R.id.w_num, m.num);
            v.setTextViewText(R.id.w_sef, m.sefira);
            pal.set(v, R.id.w_sef, "setTextColor", INK);
        } else {
            v.setTextViewText(R.id.w_title, m.sefira);
            pal.set(v, R.id.w_title, "setTextColor", DATE);
        }
        v.setViewVisibility(R.id.w_sef, hasNum ? View.VISIBLE : View.GONE);
        // the small size has room for the sub line only before the count
        boolean sub = size == M || !hasNum;
        v.setViewVisibility(R.id.w_sub, sub ? View.VISIBLE : View.GONE);
        if (sub) {
            v.setTextViewText(R.id.w_sub, m.sub);
            pal.set(v, R.id.w_sub, "setTextColor", MUTED);
        }

        // the field: three tinted masks
        v.setImageViewBitmap(R.id.w_f_muted, field[OmerWidgetDraw.MUTED]);
        v.setImageViewBitmap(R.id.w_f_date, field[OmerWidgetDraw.DATE]);
        v.setImageViewBitmap(R.id.w_f_ribbon, field[OmerWidgetDraw.RIBBON]);
        pal.set(v, R.id.w_f_muted, "setColorFilter", MUTED);
        pal.set(v, R.id.w_f_date, "setColorFilter", DATE);
        pal.set(v, R.id.w_f_ribbon, "setColorFilter", RIBBON);
        v.setContentDescription(R.id.w_field, m.state == OmerWidgetModel.STATE_COUNT ? m.num + " · " + m.sub : m.sub);
        return v;
    }

    /** The widget's colours for light and dark (the same resources as the main widget) */
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

        void set(RemoteViews v, int id, String method, int key) {
            if (Build.VERSION.SDK_INT >= 31) v.setColorInt(id, method, light[key], dark[key]);
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
