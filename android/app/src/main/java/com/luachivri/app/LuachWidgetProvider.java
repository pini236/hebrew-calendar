package com.luachivri.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.SystemClock;
import android.view.View;
import android.widget.RemoteViews;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Home-screen widget: Hebrew date (switches at sunset), the next zman with a live countdown,
 * and the coming Shabbat. All values are precomputed by the app (see src/lib/widget.ts);
 * the widget only picks the current day and wakes itself up at the next boundary.
 */
public class LuachWidgetProvider extends AppWidgetProvider {

    static final String PREFS = "luach_widget";
    static final String KEY = "data";
    static final String ACTION_TICK = "com.luachivri.app.WIDGET_TICK";
    private static final long HALF_HOUR = 30L * 60L * 1000L;

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        update(ctx, mgr, ids);
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
        long wake = now + HALF_HOUR;
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_luach);
        boolean shown = false;

        try {
            String raw = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null);
            if (raw != null) {
                JSONObject data = new JSONObject(raw);
                JSONArray days = data.getJSONArray("days");
                String key = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date(now));
                int idx = -1;
                for (int i = 0; i < days.length(); i++) {
                    if (key.equals(days.getJSONObject(i).getString("d"))) {
                        idx = i;
                        break;
                    }
                }
                if (idx >= 0) {
                    JSONObject day = days.getJSONObject(idx);
                    long sunset = day.getLong("ss");
                    boolean eve = now >= sunset;

                    v.setTextViewText(R.id.w_hebrew, eve ? day.getString("he") : day.getString("h"));
                    v.setTextViewText(R.id.w_greg, day.getString("g"));
                    v.setTextViewText(R.id.w_city, data.optString("city", ""));
                    v.setViewVisibility(R.id.w_eve, eve ? View.VISIBLE : View.GONE);

                    String label = day.optString("l", "");
                    v.setTextViewText(R.id.w_label, label);
                    v.setViewVisibility(R.id.w_label, label.isEmpty() ? View.GONE : View.VISIBLE);

                    // next zman: today's list, then tomorrow's
                    JSONObject next = firstAfter(day.getJSONArray("z"), now);
                    if (next == null && idx + 1 < days.length()) next = firstAfter(days.getJSONObject(idx + 1).getJSONArray("z"), now);
                    if (next != null) {
                        long t = next.getLong("t");
                        v.setTextViewText(R.id.w_next_name, next.getString("n"));
                        v.setTextViewText(R.id.w_next_time, next.getString("s"));
                        v.setChronometer(R.id.w_count, SystemClock.elapsedRealtime() + (t - now), null, true);
                        v.setChronometerCountDown(R.id.w_count, true);
                        v.setViewVisibility(R.id.w_next_row, View.VISIBLE);
                        wake = Math.min(wake, t + 1000);
                    } else {
                        v.setViewVisibility(R.id.w_next_row, View.GONE);
                    }
                    if (!eve) wake = Math.min(wake, sunset + 1000);

                    String sh = day.optString("sh", "");
                    v.setTextViewText(R.id.w_shabbat, sh);
                    v.setViewVisibility(R.id.w_shabbat, sh.isEmpty() ? View.GONE : View.VISIBLE);
                    v.setViewVisibility(R.id.w_empty, View.GONE);
                    v.setViewVisibility(R.id.w_content, View.VISIBLE);
                    shown = true;
                }
            }
        } catch (Exception ignored) {
            // fall through to the "open the app" state
        }

        if (!shown) {
            v.setViewVisibility(R.id.w_content, View.GONE);
            v.setViewVisibility(R.id.w_empty, View.VISIBLE);
        }

        // wake up at the next midnight at the latest (new Gregorian day)
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(now);
        c.add(Calendar.DAY_OF_YEAR, 1);
        c.set(Calendar.HOUR_OF_DAY, 0);
        c.set(Calendar.MINUTE, 0);
        c.set(Calendar.SECOND, 5);
        wake = Math.min(wake, c.getTimeInMillis());

        Intent open = new Intent(ctx, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(ctx, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        v.setOnClickPendingIntent(R.id.w_root, pi);

        mgr.updateAppWidget(ids, v);
        schedule(ctx, wake);
    }

    private static JSONObject firstAfter(JSONArray z, long now) throws Exception {
        for (int i = 0; i < z.length(); i++) {
            JSONObject o = z.getJSONObject(i);
            if (o.getLong("t") > now) return o;
        }
        return null;
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
