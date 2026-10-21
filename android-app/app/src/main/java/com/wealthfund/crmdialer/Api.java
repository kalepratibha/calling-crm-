package com.wealthfund.crmdialer;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/** Tiny HTTP helper for the CRM server (no external libraries). */
final class Api {
    static class AuthException extends Exception {}

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("crm", Context.MODE_PRIVATE); }

    static JSONObject get(Context c, String path) throws Exception { return call(c, "GET", path, null, true); }

    static JSONObject post(Context c, String path, String json, boolean auth) throws Exception {
        return call(c, "POST", path, json, auth);
    }

    private static JSONObject call(Context c, String method, String path, String body, boolean auth) throws Exception {
        SharedPreferences p = prefs(c);
        URL url = new URL(p.getString("server", "") + path);
        HttpURLConnection h = (HttpURLConnection) url.openConnection();
        try {
            h.setConnectTimeout(5000);
            h.setReadTimeout(8000);
            h.setRequestMethod(method);
            if (auth) h.setRequestProperty("Authorization", "Bearer " + p.getString("token", ""));
            if (body != null) {
                h.setDoOutput(true);
                h.setRequestProperty("Content-Type", "application/json");
                try (OutputStream o = h.getOutputStream()) { o.write(body.getBytes("UTF-8")); }
            }
            int code = h.getResponseCode();
            InputStream in = code >= 400 ? h.getErrorStream() : h.getInputStream();
            String txt = in == null ? "" : read(in);
            if (code == 401 && auth) throw new AuthException();
            JSONObject json;
            try { json = new JSONObject(txt.isEmpty() ? "{}" : txt); } catch (Exception e) { json = new JSONObject(); }
            if (code >= 400) throw new IOException(json.optString("message", "Server error " + code));
            return json;
        } finally {
            h.disconnect();
        }
    }

    private static String read(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[4096];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        in.close();
        return out.toString("UTF-8");
    }
}
