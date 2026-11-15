package com.luachyehudi.app;

import java.util.Calendar;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * What the Omer widget shows at a given moment, from the "om" block of the JSON the app precomputes
 * (src/lib/widget.ts widgetOmer). A line-for-line port of omerWidgetModel() there, which the tests
 * (scripts/test-widget.ts) check; keep the two in step.
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

    private static final long HOUR = 3600000L;

    int state;
    /** the day shown: 1–49 (49 after the count), 0 before it */
    int n;
    /** "ל״ג" ("" before the count) */
    String num;
    /** "הוד שבהוד", or "ספירת העומר" before the count */
    String sefira;
    /** "4 שבועות ו־5 ימים" · "תתחיל בעוד 12 ימים" · "ספרתם 47 מתוך 49" */
    String sub;
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

        OmerWidgetModel m = new OmerWidgetModel();
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
        m.wake = wake;

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

        if (n == 0) {
            // days from today to the evening the count begins
            Calendar e = Calendar.getInstance();
            e.setTimeInMillis(t[0]);
            e.set(Calendar.HOUR_OF_DAY, 0);
            e.set(Calendar.MINUTE, 0);
            e.set(Calendar.SECOND, 0);
            e.set(Calendar.MILLISECOND, 0);
            long days = Math.round((e.getTimeInMillis() - midnight) / 86400000d);
            m.state = STATE_BEFORE;
            m.n = 0;
            m.num = "";
            m.sefira = "ספירת העומר";
            m.sub = days <= 0 ? "מתחילה הלילה" : days == 1 ? "מתחילה מחר בערב" : "תתחיל בעוד " + days + " ימים";
            m.week = 0;
            return m;
        }
        m.sefira = sw.getString((n - 1) % 7) + " " + sp.getString((n - 1) / 7);
        if (after) {
            m.state = STATE_AFTER;
            m.n = 49;
            m.num = gem(49);
            m.sub = first != 0 ? "ספרתם " + counted + " מתוך 49" : "הספירה הושלמה";
            m.week = 0;
            return m;
        }
        m.state = STATE_COUNT;
        m.n = n;
        m.num = gem(n);
        m.sub = weeks(n);
        m.week = (n - 1) / 7 + 1;
        return m;
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

    /** "4 שבועות ו־5 ימים", as omerWeeksHe() */
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
