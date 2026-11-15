package com.luachyehudi.app;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * What the widget shows at a given moment, from the JSON the app precomputes (src/lib/widget.ts).
 * A line-for-line port of widgetModel() there, which the tests (scripts/test-widget.ts) check;
 * keep the two in step.
 */
final class WidgetModel {

    static final int SIDE_CITY = 0;
    static final int SIDE_NIGHT = 1;
    static final int SIDE_LABEL = 2;
    static final int SIDE_CHAG = 3;

    static final int PAST = 0;
    static final int NEXT = 1;
    static final int FUTURE = 2;

    static final int LIST_SLOTS = 10;
    private static final long HOUR = 3600000L;

    /** "ה׳ כסלו" and "תשפ״ז" */
    String dayMonth;
    String year;
    boolean eve;
    /** "יום ראשון · 15 בנובמבר" */
    String greg;
    String side;
    int sideKind;
    String city;

    /** the next zman; nextAt == 0 when there is none */
    String nextName;
    String nextTime;
    long nextAt;

    /** the coming Shabbat / Yom Tov; holyName == null when there is none */
    String holyName;
    String holyIn;
    String holyOut;
    boolean candlesToday;
    boolean inside;

    boolean listTomorrow;
    final List<String[]> list = new ArrayList<>();
    final List<Integer> listState = new ArrayList<>();

    /** dawn, sunrise, sunset, dusk of the day (epoch ms) and the device's midnight */
    long[] sky;
    long midnight;

    long wake;

    static WidgetModel from(JSONObject data, long now) throws Exception {
        JSONArray days = data.getJSONArray("days");
        String key = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date(now));
        int idx = -1;
        for (int i = 0; i < days.length(); i++) {
            if (key.equals(days.getJSONObject(i).getString("d"))) {
                idx = i;
                break;
            }
        }
        if (idx < 0) return null;
        JSONObject day = days.getJSONObject(idx);
        JSONObject after = idx + 1 < days.length() ? days.getJSONObject(idx + 1) : null;
        WidgetModel m = new WidgetModel();

        long ss = day.getLong("ss");
        m.eve = now >= ss;
        String heb = m.eve ? day.getString("he") : day.getString("h");
        int cut = heb.lastIndexOf(' ');
        m.dayMonth = cut > 0 ? heb.substring(0, cut) : heb;
        m.year = cut > 0 ? heb.substring(cut + 1) : "";
        m.greg = day.getString("g");
        m.city = data.optString("city", "");

        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(now);
        c.set(Calendar.HOUR_OF_DAY, 0);
        c.set(Calendar.MINUTE, 0);
        c.set(Calendar.SECOND, 0);
        c.set(Calendar.MILLISECOND, 0);
        m.midnight = c.getTimeInMillis();
        c.add(Calendar.DAY_OF_YEAR, 1);
        long nextMidnight = c.getTimeInMillis();

        // the coming Shabbat / Yom Tov (shown when its candles are within a week)
        JSONObject w = null;
        JSONArray hol = data.optJSONArray("hol");
        if (hol != null) {
            for (int i = 0; i < hol.length(); i++) {
                JSONObject x = hol.getJSONObject(i);
                if (x.getLong("h") > now && x.getLong("c") - now < 7 * 24 * HOUR) {
                    w = x;
                    break;
                }
            }
        }

        m.side = m.city;
        m.sideKind = SIDE_CITY;
        String label = day.optString("l", "");
        if (m.eve) {
            m.side = day.optString("o", "");
            m.sideKind = SIDE_NIGHT;
        } else if (!label.isEmpty() && !(w != null && w.getString("n").contains(label))) {
            m.side = label;
            m.sideKind = day.optInt("y", 0) == 1 ? SIDE_CHAG : SIDE_LABEL;
        }

        JSONArray z = day.getJSONArray("z");
        JSONArray za = after != null ? after.getJSONArray("z") : null;
        JSONObject upcoming = firstAfter(z, now);
        if (upcoming == null && za != null) upcoming = firstAfter(za, now);
        boolean todayLeft = firstAfter(z, now) != null;
        JSONArray src = todayLeft || za == null ? z : za;
        m.listTomorrow = src != z;
        int from = Math.max(0, src.length() - LIST_SLOTS);
        boolean marked = false;
        for (int i = from; i < src.length(); i++) {
            JSONObject x = src.getJSONObject(i);
            m.list.add(new String[] {x.getString("n"), x.getString("s")});
            boolean past = x.getLong("t") <= now;
            if (!past && !marked) {
                m.listState.add(NEXT);
                marked = true;
            } else {
                m.listState.add(past ? PAST : FUTURE);
            }
        }

        long wake = Math.min(now + 15 * 60000L, nextMidnight + 5000);
        if (upcoming != null) {
            m.nextName = upcoming.getString("n");
            m.nextTime = upcoming.getString("s");
            m.nextAt = upcoming.getLong("t");
            wake = Math.min(wake, m.nextAt + 1000);
        }
        if (!m.eve) wake = Math.min(wake, ss + 1000);
        if (w != null) {
            long cn = w.getLong("c");
            long hv = w.getLong("h");
            m.holyName = w.getString("n");
            m.holyIn = w.getString("cs");
            String hw = w.optString("hw", "");
            m.holyOut = hw.isEmpty() ? w.getString("hs") : hw + " " + w.getString("hs");
            m.candlesToday = cn > now && cn < nextMidnight;
            m.inside = cn <= now;
            wake = Math.min(wake, (cn > now ? cn : hv) + 1000);
        }
        m.wake = wake;

        JSONArray sk = day.optJSONArray("sk");
        if (sk != null && sk.length() == 4) {
            m.sky = new long[] {sk.getLong(0), sk.getLong(1), sk.getLong(2), sk.getLong(3)};
        }
        return m;
    }

    /** fraction of the device's day (0 = midnight) */
    float frac(long t) {
        return Math.min(1f, Math.max(0f, (t - midnight) / (24f * HOUR)));
    }

    private static JSONObject firstAfter(JSONArray z, long now) throws Exception {
        for (int i = 0; i < z.length(); i++) {
            JSONObject o = z.getJSONObject(i);
            if (o.getLong("t") > now) return o;
        }
        return null;
    }
}
