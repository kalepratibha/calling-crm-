package com.wealthfund.crmdialer;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.SystemClock;
import android.database.Cursor;
import android.provider.CallLog;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.telephony.PhoneStateListener;
import android.telephony.TelephonyCallback;
import android.telephony.TelephonyManager;

import org.json.JSONObject;

/**
 * Foreground service:
 *  1. asks the CRM server every 2 seconds "did the PC press Call?"  -> opens the phone's DIAL PAD with the number
 *  2. watches the phone's real call state: dialing started (OFFHOOK) -> PC timer restarts,
 *     call finished (IDLE) -> PC gets "call ended" and shows the pop-up with the exact duration.
 */
public class DialService extends Service {
    static final String CH_SERVICE = "crm_service", CH_DIAL = "crm_dial";
    static volatile boolean running = false;
    static volatile String status = "Not running";

    private volatile boolean stop = false;
    private Thread worker;
    private PowerManager.WakeLock wakeLock;
    private TelephonyManager tm;
    private PhoneStateListener legacyListener;
    private Object modernCallback;

    // call tracking
    private volatile String armedNumber = null;   // number just sent to the dial pad
    private volatile long armedAt = 0;
    private volatile boolean offhookSeen = false;

    @Override public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onCreate() {
        super.onCreate();
        NotificationManager nm = getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel(CH_SERVICE, "CRM connection", NotificationManager.IMPORTANCE_LOW));
        NotificationChannel dial = new NotificationChannel(CH_DIAL, "Call from CRM", NotificationManager.IMPORTANCE_HIGH);
        dial.enableVibration(true);
        nm.createNotificationChannel(dial);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Notification n = serviceNotification("Connecting to CRM…");
        if (Build.VERSION.SDK_INT >= 34) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        else startForeground(1, n);

        if (!running) {
            running = true;
            stop = false;
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "crmdialer:poll");
            wakeLock.acquire();
            registerCallState();
            worker = new Thread(this::loop, "crm-poll");
            worker.start();
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        stop = true;
        running = false;
        status = "Stopped";
        if (worker != null) worker.interrupt();
        unregisterCallState();
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        super.onDestroy();
    }

    // ---------------------------------------------------------------- polling the CRM server
    private void loop() {
        long after = -1; // -1 = first poll: just remember the latest id, ignore old requests
        while (!stop) {
            try {
                String path = "/api/phone/poll?after=" + (after < 0 ? "9007199254740991" : String.valueOf(after));
                JSONObject r = Api.get(this, path);
                setStatus("Connected — waiting for a call from your PC");
                long latest = r.optLong("latest", 0);
                if (after < 0 || latest < after) {
                    after = latest;
                } else if (!r.isNull("dial")) {
                    JSONObject d = r.getJSONObject("dial");
                    after = d.optLong("id", after);
                    onDial(d.optString("number"), d.optString("name"));
                }
            } catch (Api.AuthException e) {
                setStatus("Login expired — open the app and sign in again");
                Api.prefs(this).edit().putBoolean("active", false).apply();
                stopSelf();
                return;
            } catch (InterruptedException e) {
                return;
            } catch (Exception e) {
                setStatus("Cannot reach the CRM — same Wi-Fi? PC on? (retrying)");
            }
            try { Thread.sleep(2000); } catch (InterruptedException e) { return; }
        }
    }

    private void setStatus(String s) {
        if (s.equals(status)) return;
        status = s;
        getSystemService(NotificationManager.class).notify(1, serviceNotification(s));
    }

    // ---------------------------------------------------------------- open the dial pad
    private void onDial(String number, String name) {
        armedNumber = number;
        armedAt = System.currentTimeMillis();
        offhookSeen = false;

        Intent dialIntent = new Intent(Intent.ACTION_DIAL, Uri.fromParts("tel", number, null));
        dialIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent pi = PendingIntent.getActivity(this, 2, dialIntent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        if (v != null) v.vibrate(VibrationEffect.createWaveform(new long[]{0, 250, 120, 250}, -1));

        // Fallback: heads-up notification — one tap opens the dial pad (always works)
        Notification.Builder nb = new Notification.Builder(this, CH_DIAL)
                .setSmallIcon(android.R.drawable.sym_action_call)
                .setContentTitle("Call " + (name.isEmpty() ? "client" : name))
                .setContentText(number + " — tap to open the dial pad")
                .setCategory(Notification.CATEGORY_CALL)
                .setAutoCancel(true)
                .setTimeoutAfter(120000)
                .setContentIntent(pi)
                .setFullScreenIntent(pi, true);
        getSystemService(NotificationManager.class).notify(2, nb.build());

        // Direct: opens the dial pad by itself (needs "Display over other apps" to be allowed)
        try { startActivity(dialIntent); } catch (Exception ignored) { }
        setStatus("Dial pad opened for " + number);
    }

    // ---------------------------------------------------------------- real call state
    private void registerCallState() {
        if (checkSelfPermission(Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED) return;
        tm = (TelephonyManager) getSystemService(Context.TELEPHONY_SERVICE);
        try {
            if (Build.VERSION.SDK_INT >= 31) {
                modernCallback = new ModernCallback();
                tm.registerTelephonyCallback(getMainExecutor(), (TelephonyCallback) modernCallback);
            } else {
                legacyListener = new PhoneStateListener() {
                    @Override public void onCallStateChanged(int state, String phoneNumber) { handleState(state); }
                };
                tm.listen(legacyListener, PhoneStateListener.LISTEN_CALL_STATE);
            }
        } catch (Exception ignored) { }
    }

    private void unregisterCallState() {
        try {
            if (tm == null) return;
            if (Build.VERSION.SDK_INT >= 31) { if (modernCallback != null) tm.unregisterTelephonyCallback((TelephonyCallback) modernCallback); }
            else if (legacyListener != null) tm.listen(legacyListener, PhoneStateListener.LISTEN_NONE);
        } catch (Exception ignored) { }
    }

    @android.annotation.TargetApi(31)
    private class ModernCallback extends TelephonyCallback implements TelephonyCallback.CallStateListener {
        @Override public void onCallStateChanged(int state) { handleState(state); }
    }

    private void handleState(int state) {
        if (state == TelephonyManager.CALL_STATE_OFFHOOK) {
            // dialing started for the number the PC sent -> PC timer restarts from this moment
            if (armedNumber != null && !offhookSeen && System.currentTimeMillis() - armedAt < 5 * 60_000L) {
                offhookSeen = true;
                setStatus("On call — " + armedNumber);
                cancelDialNotification();                 // nothing should pop up on the mobile
                async("/api/phone/dialing", SystemClock.elapsedRealtime());
            }
        } else if (state == TelephonyManager.CALL_STATE_IDLE) {
            // call finished -> PC shows the "Call ended" pop-up with the duration
            if (offhookSeen) {
                offhookSeen = false;
                final String num = armedNumber;
                final long armed = armedAt;
                armedNumber = null;
                setStatus("Call finished — details are open on your PC");
                cancelDialNotification();
                reportEnd(num, armed, SystemClock.elapsedRealtime());
            }
        }
    }

    /**
     * Call finished. The phone's own call log has the exact talk time (counted from the moment the other side
     * answered, 0 if it was not answered). We read it and send it with "call ended"; the PC pop-up then shows
     * that exact duration. If the call log cannot be read, the server falls back to dial-time → end-time.
     */
    private void reportEnd(String number, long armedWall, long eventAt) {
        new Thread(() -> {
            long talk = -1;
            if (checkSelfPermission(Manifest.permission.READ_CALL_LOG) == PackageManager.PERMISSION_GRANTED) {
                for (int i = 0; i < 8 && talk < 0; i++) {       // Android writes the log entry a moment after the call ends
                    try { Thread.sleep(700); } catch (InterruptedException e) { break; }
                    talk = lastOutgoingTalkSec(number, armedWall);
                }
            }
            for (int i = 0; i < 5; i++) {
                try {
                    String body = "{\"ago_ms\":" + (SystemClock.elapsedRealtime() - eventAt) + (talk >= 0 ? ",\"talk_sec\":" + talk : "") + "}";
                    Api.post(this, "/api/phone/ended", body, true);
                    return;
                } catch (Exception e) {
                    try { Thread.sleep(1500); } catch (InterruptedException ie) { return; }
                }
            }
        }).start();
    }

    private long lastOutgoingTalkSec(String number, long sinceWall) {
        String want = number == null ? "" : number.replaceAll("\\D", "");
        if (want.length() > 10) want = want.substring(want.length() - 10);
        try (Cursor c = getContentResolver().query(CallLog.Calls.CONTENT_URI,
                new String[]{CallLog.Calls.NUMBER, CallLog.Calls.DATE, CallLog.Calls.DURATION},
                CallLog.Calls.TYPE + "=? AND " + CallLog.Calls.DATE + ">=?",
                new String[]{String.valueOf(CallLog.Calls.OUTGOING_TYPE), String.valueOf(sinceWall - 15000)},
                CallLog.Calls.DATE + " DESC")) {
            while (c != null && c.moveToNext()) {
                String n = c.getString(0) == null ? "" : c.getString(0).replaceAll("\\D", "");
                if (want.isEmpty() || n.endsWith(want)) return c.getLong(2);   // DURATION = talk seconds
            }
        } catch (Exception ignored) { }
        return -1;
    }

    private void cancelDialNotification() {
        try { getSystemService(NotificationManager.class).cancel(2); } catch (Exception ignored) { }
    }

    // eventAt = SystemClock.elapsedRealtime() at the real moment (dialing / call end).
    // We send "ago_ms" so the server back-dates it exactly, whatever the network delay or retries.
    private void async(String path, long eventAt) {
        new Thread(() -> {
            for (int i = 0; i < 5; i++) {   // retry if Wi-Fi blinks
                try {
                    String body = "{\"ago_ms\":" + (SystemClock.elapsedRealtime() - eventAt) + "}";
                    Api.post(this, path, body, true);
                    return;
                } catch (Exception e) {
                    try { Thread.sleep(1500); } catch (InterruptedException ie) { return; }
                }
            }
        }).start();
    }

    private Notification serviceNotification(String text) {
        PendingIntent open = PendingIntent.getActivity(this, 1, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Builder(this, CH_SERVICE)
                .setSmallIcon(android.R.drawable.sym_action_call)
                .setContentTitle("CRM Dialer")
                .setContentText(text)
                .setOngoing(true)
                .setContentIntent(open)
                .build();
    }
}
