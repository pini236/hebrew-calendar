package com.luachivri.app;

import android.content.Context;
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
        call.resolve();
    }
}
