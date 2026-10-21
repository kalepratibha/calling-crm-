package com.wealthfund.crmdialer;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** After the phone restarts, resume listening if the executive was signed in. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (Api.prefs(context).getBoolean("active", false)) {
            try { context.startForegroundService(new Intent(context, DialService.class)); } catch (Exception ignored) { }
        }
    }
}
