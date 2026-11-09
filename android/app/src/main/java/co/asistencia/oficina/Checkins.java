package co.asistencia.oficina;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;

/** Registra que hoy se llegó a la oficina (una vez por día). */
final class Checkins {
    private static final String CHANNEL = "asistencia";

    private Checkins() {}

    static synchronized void record(Context ctx, String place) {
        String today = LocalDate.now().toString();
        if (today.equals(Prefs.str(ctx, Prefs.LAST_DATE))) return; // ya marcado hoy

        JSONObject c = new JSONObject();
        try {
            c.put("date", today);
            c.put("place", place);
            c.put("time", Instant.now().toString());
        } catch (JSONException ignored) {
        }
        Prefs.get(ctx).edit().putString(Prefs.LAST_DATE, today).apply();
        append(ctx, Prefs.PENDING_WEB, c);
        if (!Prefs.str(ctx, Prefs.SYNC_URL).isEmpty()) {
            append(ctx, Prefs.PENDING_UPLOAD, c);
            SyncJob.schedule(ctx);
        }
        notify(ctx, "🏢 Oficina marcada",
                place + " · " + LocalTime.now().format(DateTimeFormatter.ofPattern("HH:mm")));
    }

    /** Entrega a la interfaz las marcas pendientes y las borra. */
    static synchronized String take(Context ctx) {
        JSONArray arr = Prefs.array(ctx, Prefs.PENDING_WEB);
        Prefs.putArray(ctx, Prefs.PENDING_WEB, new JSONArray());
        return arr.toString();
    }

    /** La interfaz avisa que hoy ya está marcado (p. ej. por GPS con la app abierta). */
    static synchronized void markedToday(Context ctx) {
        Prefs.get(ctx).edit().putString(Prefs.LAST_DATE, LocalDate.now().toString()).apply();
    }

    private static void append(Context ctx, String key, JSONObject item) {
        JSONArray arr = Prefs.array(ctx, key);
        arr.put(item);
        Prefs.putArray(ctx, key, arr);
    }

    static void notify(Context ctx, String title, String text) {
        if (Build.VERSION.SDK_INT >= 33
                && ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Asistencia", NotificationManager.IMPORTANCE_DEFAULT));
        PendingIntent open = PendingIntent.getActivity(ctx, 0,
                new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification n = new Notification.Builder(ctx, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat)
                .setContentTitle(title)
                .setContentText(text)
                .setContentIntent(open)
                .setAutoCancel(true)
                .build();
        nm.notify(1, n);
    }
}
