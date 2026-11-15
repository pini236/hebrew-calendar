package com.luachyehudi.app;

import android.content.Context;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Receives the widget data (JSON, computed by the app) and refreshes every placed widget. */
@CapacitorPlugin(name = "LuachWidget")
public class WidgetBridgePlugin extends Plugin {

    @PluginMethod
    public void setData(PluginCall call) {
        String json = call.getString("json");
        if (json == null) {
            call.reject("json is missing");
            return;
        }
        Context ctx = getContext();
        ctx.getSharedPreferences(LuachWidgetProvider.PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(LuachWidgetProvider.KEY, json)
            .apply();
        LuachWidgetProvider.refreshAll(ctx);
        OmerWidgetProvider.refreshAll(ctx);
        call.resolve();
    }

    /** The launcher can add a widget for the app (Android 8+, and a launcher that supports it) */
    @PluginMethod
    public void canPin(PluginCall call) {
        JSObject r = new JSObject();
        r.put("value", OmerWidgetProvider.canPin(getContext()));
        call.resolve(r);
    }

    /** Ask the launcher to add the Omer widget; it shows its own confirmation */
    @PluginMethod
    public void pinOmer(PluginCall call) {
        JSObject r = new JSObject();
        boolean ok = false;
        try {
            ok = OmerWidgetProvider.requestPin(getContext());
        } catch (RuntimeException ignored) {
            // a launcher that refuses: the app shows how to add it by hand
        }
        r.put("value", ok);
        call.resolve(r);
    }
}
