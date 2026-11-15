package com.luachyehudi.app;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * What the Omer widget shows at a given moment, from the JSON the app precomputes (src/lib/widget.ts:
 * the "om" block, widgetOmer, and the day's sky from "days"). A line-for-line port of omerWidgetModel()
 * there, which the tests (scripts/test-widget.ts) check; keep the two in step.
 */
final class OmerWidgetModel {

    static final int STATE_BEFORE = 0;
    static final int STATE_COUNT = 1;
    static final int STATE_AFTER = 2;

    /* the cells, as CELL in widget.ts */
    static final int FUTURE = 0;
    static final int COUNTED = 1;
    static final int MISSED = 2;
    static final int PASSED = 3;
    static final int TODAY = 4;
    static final int TODAY_COUNTED = 5;
    static final int ASSUMED = 6;

    /** Lag BaOmer: its cell has a small saffron dot */
    static final int LAG_BAOMER = 33;

    private static final long HOUR = 3600000L;

    int state;
    /** Hebrew: right to left, gematria; English: left to right, digits */
    boolean he;
    /** the day shown: 1–49 (49 after the count), 0 before it */
    int n;
    /** the large figure in Frank Ruhl Libre: the day ("ל״ג" / "33"); before and after: "158", "הלילה", "43" */
    String num;
    /** count: "הוד שבהוד"; before and after: "ספירת העומר" */
    String sefira;
    /** count: the count in the nusach; before: "ליל ט״ז בניסן · 22 באפריל"; after: "הספירה הושלמה" */
    String sub;
    /** before and after: the words around the large figure ("בעוד" 158 "ימים") */
    String pre = "";
    String post = "";
    /** the day of now is marked as counted in the app */
    boolean done;
    String doneText;
    /** before nightfall: the next count; nextTime == null when there is none (and no sky) */
    String nextLabel;
    String nextShort;
    String nextTime;
    /** the sky from dawn to the next count: from, to, sunrise, sunset, now (epoch ms) */
    long[] band;
    /** the weeks' labels (the seven sefirot) */
    final String[] weeks = new String[7];
    final int[] cells = new int[49];
    /** the week of the day shown (1–7), 0 for none */
    int week;
    long wake;

    static OmerWidgetModel from(JSONObject data, long now) throws Exception {
        JSONObject om = data.optJSONObject("om");
        if (om == null) return null;
        JSONArray ta = om.getJSONArray("t");
        if (ta.length() != 50) return null;
        long[] t = new long[50];
        for (int i = 0; i < 50; i++) t[i] = ta.getLong(i);
        long c = om.optLong("c", 0);
        long f = om.optLong("f", 0);
        JSONArray sw = om.getJSONArray("sw");
        JSONArray sp = om.getJSONArray("sp");
        JSONArray ct = om.optJSONArray("ct");
        String st = om.optString("st", "");
        String tz = data.optString("tz", "Asia/Jerusalem");

        OmerWidgetModel m = new OmerWidgetModel();
        m.he = !"en".equals(om.optString("l", "he"));
        boolean he = m.he;
        int n = 0;
        while (n < 49 && t[n] <= now) n++;
        boolean after = now >= t[49];

        Calendar cal = Calendar.getInstance();
        cal.setTimeInMillis(now);
        cal.set(Calendar.HOUR_OF_DAY, 0);
        cal.set(Calendar.MINUTE, 0);
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);
        long midnight = cal.getTimeInMillis();
        cal.add(Calendar.DAY_OF_YEAR, 1);
        long nextMidnight = cal.getTimeInMillis();
        long wake = Math.min(now + 6 * HOUR, nextMidnight + 5000);
        for (long x : t) {
            if (x > now) {
                wake = Math.min(wake, x + 1000);
                break;
            }
        }

        int first = 0;
        int counted = 0;
        for (int k = 1; k <= 49; k++) {
            if (bit(c, k)) {
                counted++;
                if (first == 0) first = k;
            }
        }
        for (int k = 1; k <= 49; k++) {
            boolean ck = bit(c, k);
            int cell;
            if (n == 0 || k > n) cell = n == 0 && k == 1 ? TODAY : FUTURE;
            else if (k == n && !after) cell = ck ? TODAY_COUNTED : TODAY;
            else if (ck) cell = COUNTED;
            else if (first == 0 || k < first) cell = PASSED;
            else cell = bit(f, k) ? ASSUMED : MISSED;
            m.cells[k - 1] = cell;
        }
        for (int i = 0; i < 7; i++) m.weeks[i] = sw.getString(i);
        String title = he ? "ספירת העומר" : "Sefirat HaOmer";
        m.doneText = he ? "ספרתי" : "Counted";
        m.wake = wake;

        if (n == 0) {
            // days from today to the evening the count begins
            Calendar e = Calendar.getInstance();
            e.setTimeInMillis(t[0]);
            e.set(Calendar.HOUR_OF_DAY, 0);
            e.set(Calendar.MINUTE, 0);
            e.set(Calendar.SECOND, 0);
            e.set(Calendar.MILLISECOND, 0);
            long days = Math.round((e.getTimeInMillis() - midnight) / 86400000d);
            if (days <= 0) {
                m.num = he ? "הלילה" : "Tonight";
            } else if (days == 1) {
                m.num = he ? "מחר" : "Tomorrow";
                m.post = he ? "בערב" : "evening";
            } else if (days == 2 && he) {
                m.pre = "בעוד";
                m.num = "יומיים";
            } else {
                m.pre = he ? "בעוד" : "in";
                m.num = String.valueOf(days);
                m.post = he ? "ימים" : "days";
            }
            // tonight: the hour instead of the date ("ליל ט״ז בניסן · 19:51")
            int dot = st.indexOf(" · ");
            m.sub = days <= 0 && dot >= 0 ? st.substring(0, dot) + " · " + hhmm(t[0], tz) : st;
            m.state = STATE_BEFORE;
            m.n = 0;
            m.sefira = title;
            m.week = 0;
            return m;
        }
        if (after) {
            // the summary: how many days were marked here, or (for someone who doesn't mark them) the whole count
            if (first != 0) {
                m.num = String.valueOf(counted);
                m.post = he ? "מתוך 49" : "of 49";
                m.sub = he ? "הספירה הושלמה" : "The count is complete";
            } else {
                m.num = he ? gem(49) : "49";
                m.sub = he ? "שבע שבתות תמימות" : "Seven complete weeks";
            }
            m.state = STATE_AFTER;
            m.n = 49;
            m.sefira = title;
            m.week = 0;
            return m;
        }

        // the count of now began at nightfall (t[n-1]); the next one begins at the coming nightfall (t[n])
        if (n < 49) {
            long[] sk = todaySky(data, now);
            if (sk != null) {
                long dawn = sk[0];
                long end = t[n];
                // (after nightfall the next count is tomorrow's: no band until tomorrow's dawn)
                if (now >= dawn && now < end && end - dawn < 20 * HOUR) {
                    // before nightfall: the day's sky from dawn to the next count, "now" moving toward it
                    m.nextLabel = he ? "הספירה הבאה" : "Next count";
                    m.nextShort = he ? "הבאה" : "Next";
                    m.nextTime = hhmm(end, tz);
                    m.band = new long[] {dawn, end, sk[1], sk[2], now};
                    m.wake = Math.min(m.wake, now + 20 * 60000L);
                } else if (now < dawn) {
                    m.wake = Math.min(m.wake, dawn + 1000);
                }
            }
        }
        m.state = STATE_COUNT;
        m.n = n;
        m.num = he ? gem(n) : String.valueOf(n);
        m.sefira = sw.getString((n - 1) % 7) + " " + sp.getString((n - 1) / 7);
        m.sub = ct != null && ct.length() >= n ? ct.getString(n - 1) : he ? weeks(n) : "";
        m.done = m.cells[n - 1] == TODAY_COUNTED;
        m.week = (n - 1) / 7 + 1;
        return m;
    }

    /** today's dawn, sunrise, sunset, dusk from the main widget's days (null when the app hasn't pushed today) */
    private static long[] todaySky(JSONObject data, long now) throws Exception {
        JSONArray days = data.optJSONArray("days");
        if (days == null) return null;
        String key = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date(now));
        for (int i = 0; i < days.length(); i++) {
            JSONObject d = days.getJSONObject(i);
            if (!key.equals(d.optString("d"))) continue;
            JSONArray sk = d.optJSONArray("sk");
            if (sk == null || sk.length() != 4) return null;
            return new long[] {sk.getLong(0), sk.getLong(1), sk.getLong(2), sk.getLong(3)};
        }
        return null;
    }

    /** "19:58" in the place's time zone, as hhmm() in widget.ts */
    static String hhmm(long t, String tz) {
        SimpleDateFormat f = new SimpleDateFormat("HH:mm", Locale.US);
        f.setTimeZone(TimeZone.getTimeZone(tz));
        return f.format(new Date(t));
    }

    private static boolean bit(long mask, int k) {
        return ((mask >> (k - 1)) & 1L) == 1L;
    }

    /** Gematria for 1–49 ("ט״ו", "ל״ג", "ז׳"), as omerGem() */
    static String gem(int n) {
        String[] tens = {"", "י", "כ", "ל", "מ"};
        String[] ones = {"", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"};
        String s = tens[n / 10] + ones[n % 10];
        if (n == 15) s = "טו";
        if (n == 16) s = "טז";
        return s.length() == 1 ? s + "׳" : s.substring(0, s.length() - 1) + "״" + s.substring(s.length() - 1);
    }

    /** "4 שבועות ו־5 ימים", as omerWeeksHe() (older data without the count lines) */
    static String weeks(int n) {
        int w = n / 7;
        int d = n % 7;
        String days = d == 1 ? "יום אחד" : d + " ימים";
        if (w == 0) return days;
        String weeks = w == 1 ? "שבוע אחד" : w + " שבועות";
        if (d == 0) return weeks;
        return d == 1 ? weeks + " ויום אחד" : weeks + " ו־" + d + " ימים";
    }
}
