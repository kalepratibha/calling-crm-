package com.wealthfund.crmdialer;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

/** One screen: server address + same mobile number / password as on the PC, then Start. */
public class MainActivity extends Activity {
    private EditText server, phone, password, otp;
    private Button verifyBtn;
    private int challengeId = 0;
    private String pendingPhone = "";
    private TextView status, who;
    private final Handler ui = new Handler(Looper.getMainLooper());

    private final Runnable refresh = new Runnable() {
        @Override public void run() {
            status.setText(DialService.running ? "● " + DialService.status : "○ Not running — sign in below and press Start");
            ui.postDelayed(this, 1000);
        }
    };

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        SharedPreferences p = Api.prefs(this);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(20);
        root.setPadding(pad, pad, pad, pad);

        TextView title = text("CRM Dialer", 24, true);
        root.addView(title);
        root.addView(text("PC pe Call dabaya ki ya phone ka dial pad number ke saath khulega. Call khatam hone par PC pe popup aayega.", 13, false));

        status = text("", 15, true);
        status.setPadding(0, dp(14), 0, dp(6));
        root.addView(status);
        who = text("", 13, false);
        root.addView(who);

        root.addView(label("CRM server address"));
        server = input(p.getString("server", "http://192.168.1.109:5000"), InputType.TYPE_TEXT_VARIATION_URI);
        root.addView(server);
        root.addView(label("Mobile number (same as PC login)"));
        phone = input(p.getString("phone", ""), InputType.TYPE_CLASS_PHONE);
        root.addView(phone);
        root.addView(label("Password"));
        password = input("", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        root.addView(password);

        Button start = button("Sign in & Start");
        start.setOnClickListener(v -> signIn());
        root.addView(start);

        // Shown only when this phone is new for the account: the admin tells the 6-digit OTP (asked once)
        otp = input("", InputType.TYPE_CLASS_NUMBER);
        otp.setHint("6-digit OTP (ask your admin)");
        otp.setVisibility(View.GONE);
        root.addView(otp);
        verifyBtn = button("Verify OTP & Start");
        verifyBtn.setVisibility(View.GONE);
        verifyBtn.setOnClickListener(v -> verifyOtp());
        root.addView(verifyBtn);
        Button stopBtn = button("Stop");
        stopBtn.setOnClickListener(v -> {
            p.edit().putBoolean("active", false).apply();
            stopService(new Intent(this, DialService.class));
        });
        root.addView(stopBtn);

        root.addView(label("One-time permissions (needed for reliable dial pad + call end)"));
        Button perm = button("1. Allow phone state, call log & notifications");
        perm.setOnClickListener(v -> askPermissions());
        root.addView(perm);
        Button overlay = button("2. Allow display over other apps");
        overlay.setOnClickListener(v -> startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getPackageName()))));
        root.addView(overlay);
        Button battery = button("3. Do not optimise battery");
        battery.setOnClickListener(v -> {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm.isIgnoringBatteryOptimizations(getPackageName())) Toast.makeText(this, "Already allowed", Toast.LENGTH_SHORT).show();
            else startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getPackageName())));
        });
        root.addView(battery);

        ScrollView sv = new ScrollView(this);
        sv.addView(root);
        setContentView(sv);
    }

    @Override protected void onResume() {
        super.onResume();
        SharedPreferences p = Api.prefs(this);
        who.setText(p.getString("token", "").isEmpty() ? "" : "Signed in as " + p.getString("name", "") + " (" + p.getString("phone", "") + ")");
        ui.post(refresh);
    }

    @Override protected void onPause() { super.onPause(); ui.removeCallbacks(refresh); }

    private void askPermissions() {
        if (Build.VERSION.SDK_INT >= 33) requestPermissions(new String[]{Manifest.permission.READ_PHONE_STATE, Manifest.permission.READ_CALL_LOG, Manifest.permission.POST_NOTIFICATIONS}, 1);
        else requestPermissions(new String[]{Manifest.permission.READ_PHONE_STATE, Manifest.permission.READ_CALL_LOG}, 1);
    }

    private void signIn() {
        String url = server.getText().toString().trim();
        if (!url.startsWith("http")) url = "http://" + url;
        while (url.endsWith("/")) url = url.substring(0, url.length() - 1);
        final String serverUrl = url;
        final String ph = phone.getText().toString().replaceAll("\\D", "");
        final String pw = password.getText().toString();
        if (ph.isEmpty() || pw.isEmpty()) { toast("Enter mobile number and password"); return; }

        Api.prefs(this).edit().putString("server", serverUrl).apply();
        new Thread(() -> {
            try {
                JSONObject body = new JSONObject().put("phone", ph).put("password", pw).put("panel", "executive").put("device_id", deviceId());
                JSONObject r = Api.post(this, "/api/auth/login", body.toString(), false);
                if (r.optBoolean("otp_required")) {
                    challengeId = r.optInt("challenge_id");
                    pendingPhone = ph;
                    runOnUiThread(() -> {
                        otp.setVisibility(View.VISIBLE);
                        verifyBtn.setVisibility(View.VISIBLE);
                        otp.requestFocus();
                        toast("New phone: enter the OTP your admin gives you (valid " + r.optInt("ttl_min", 10) + " min)");
                    });
                    return;
                }
                completeLogin(r, ph);
            } catch (Exception e) {
                runOnUiThread(() -> toast("Sign-in failed: " + e.getMessage()));
            }
        }).start();
    }

    private void verifyOtp() {
        final String code = otp.getText().toString().replaceAll("\\D", "");
        if (code.length() != 6) { toast("Enter the 6-digit OTP"); return; }
        new Thread(() -> {
            try {
                JSONObject body = new JSONObject().put("challenge_id", challengeId).put("code", code).put("device_id", deviceId());
                JSONObject r = Api.post(this, "/api/auth/verify-otp", body.toString(), false);
                runOnUiThread(() -> { otp.setText(""); otp.setVisibility(View.GONE); verifyBtn.setVisibility(View.GONE); });
                completeLogin(r, pendingPhone);
            } catch (Exception e) {
                runOnUiThread(() -> toast("OTP failed: " + e.getMessage()));
            }
        }).start();
    }

    private void completeLogin(JSONObject r, String ph) throws Exception {
        JSONObject u = r.getJSONObject("user");
        Api.prefs(this).edit().putString("token", r.getString("token")).putString("phone", ph)
                .putString("name", u.optString("name")).putBoolean("active", true).apply();
        runOnUiThread(() -> {
            askPermissionsIfNeeded();
            startForegroundService(new Intent(this, DialService.class));
            password.setText("");
            who.setText("Signed in as " + u.optString("name") + " (" + ph + ")");
            toast("Started");
        });
    }

    // Random id of this phone. The server remembers it after the OTP, so the OTP is asked only once per phone.
    private String deviceId() {
        SharedPreferences p = Api.prefs(this);
        String id = p.getString("device_id", "");
        if (id.length() < 16) { id = java.util.UUID.randomUUID().toString(); p.edit().putString("device_id", id).apply(); }
        return id;
    }

    private void askPermissionsIfNeeded() {
        if (checkSelfPermission(Manifest.permission.READ_PHONE_STATE) != android.content.pm.PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(Manifest.permission.READ_CALL_LOG) != android.content.pm.PackageManager.PERMISSION_GRANTED) askPermissions();
    }

    // ---- tiny UI helpers
    private int dp(int v) { return (int) (v * getResources().getDisplayMetrics().density); }
    private void toast(String s) { Toast.makeText(this, s, Toast.LENGTH_LONG).show(); }
    private TextView text(String s, int sp, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s); t.setTextSize(sp);
        if (bold) t.setTypeface(null, android.graphics.Typeface.BOLD);
        return t;
    }
    private TextView label(String s) { TextView t = text(s, 12, true); t.setPadding(0, dp(14), 0, dp(2)); return t; }
    private EditText input(String value, int type) {
        EditText e = new EditText(this);
        e.setText(value); e.setSingleLine(true); e.setInputType(type);
        return e;
    }
    private Button button(String s) {
        Button b = new Button(this);
        b.setText(s); b.setAllCaps(false);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(8);
        b.setLayoutParams(lp);
        b.setGravity(Gravity.CENTER);
        return b;
    }
}
