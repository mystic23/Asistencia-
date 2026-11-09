package co.asistencia.oficina;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.net.Uri;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/** Envía las marcas a tu Google Sheets (Apps Script) cuando hay internet; reintenta si falla. */
public class SyncJob extends JobService {
    private static final int JOB_ID = 93;

    static void schedule(Context ctx) {
        JobScheduler js = ctx.getSystemService(JobScheduler.class);
        js.schedule(new JobInfo.Builder(JOB_ID, new ComponentName(ctx, SyncJob.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setBackoffCriteria(30_000, JobInfo.BACKOFF_POLICY_EXPONENTIAL)
                .setPersisted(true)
                .build());
    }

    @Override
    public boolean onStartJob(JobParameters params) {
        new Thread(() -> jobFinished(params, !uploadAll(getApplicationContext()))).start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return true;
    }

    /** @return true si ya no queda nada pendiente. */
    static boolean uploadAll(Context ctx) {
        String base = Prefs.str(ctx, Prefs.SYNC_URL), token = Prefs.str(ctx, Prefs.SYNC_TOKEN);
        if (base.isEmpty() || token.isEmpty()) {
            Prefs.putArray(ctx, Prefs.PENDING_UPLOAD, new JSONArray());
            return true;
        }
        JSONArray pending = Prefs.array(ctx, Prefs.PENDING_UPLOAD);
        JSONArray left = new JSONArray();
        for (int i = 0; i < pending.length(); i++) {
            JSONObject c = pending.optJSONObject(i);
            if (c == null) continue;
            String url = Uri.parse(base).buildUpon()
                    .appendQueryParameter("token", token)
                    .appendQueryParameter("action", "checkin")
                    .appendQueryParameter("date", c.optString("date"))
                    .appendQueryParameter("place", c.optString("place"))
                    .build().toString();
            if (!get(url)) left.put(c);
        }
        synchronized (Checkins.class) {
            // Conserva lo que llegó mientras se enviaba.
            JSONArray now = Prefs.array(ctx, Prefs.PENDING_UPLOAD);
            for (int i = pending.length(); i < now.length(); i++) left.put(now.opt(i));
            Prefs.putArray(ctx, Prefs.PENDING_UPLOAD, left);
        }
        return left.length() == 0;
    }

    private static boolean get(String url) {
        HttpURLConnection con = null;
        try {
            con = (HttpURLConnection) new URL(url).openConnection();
            con.setConnectTimeout(20_000);
            con.setReadTimeout(30_000);
            con.setInstanceFollowRedirects(true);
            if (con.getResponseCode() != 200) return false;
            try (InputStream in = con.getInputStream()) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[4096];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                return new JSONObject(out.toString(StandardCharsets.UTF_8.name())).optBoolean("ok");
            }
        } catch (Exception e) {
            return false;
        } finally {
            if (con != null) con.disconnect();
        }
    }
}
