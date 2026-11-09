package co.asistencia.oficina;

import android.Manifest;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import com.google.android.gms.location.Geofence;
import com.google.android.gms.location.GeofencingClient;
import com.google.android.gms.location.GeofencingRequest;
import com.google.android.gms.location.LocationServices;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/** Registra una geocerca por oficina; Android avisa al entrar aunque la app esté cerrada. */
final class Geofences {
    private Geofences() {}

    static boolean hasFine(Context ctx) {
        return ctx.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    static boolean hasBackground(Context ctx) {
        return Build.VERSION.SDK_INT < 29
                || ctx.checkSelfPermission(Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    static PendingIntent pendingIntent(Context ctx) {
        Intent i = new Intent(ctx, GeofenceReceiver.class);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
        return PendingIntent.getBroadcast(ctx, 0, i, flags);
    }

    static void register(Context ctx) {
        final Context app = ctx.getApplicationContext();
        if (!hasFine(app)) return;
        final List<Geofence> fences = new ArrayList<>();
        JSONArray offices = Prefs.array(app, Prefs.OFFICES);
        for (int i = 0; i < offices.length(); i++) {
            JSONObject o = offices.optJSONObject(i);
            if (o == null) continue;
            double lat = o.optDouble("lat", Double.NaN), lng = o.optDouble("lng", Double.NaN);
            if (Double.isNaN(lat) || Double.isNaN(lng)) continue;
            float radius = (float) Math.max(100, o.optDouble("radius", 200));
            String name = o.optString("name", "Oficina");
            if (name.length() > 90) name = name.substring(0, 90);
            fences.add(new Geofence.Builder()
                    .setRequestId(name)
                    .setCircularRegion(lat, lng, radius)
                    .setExpirationDuration(Geofence.NEVER_EXPIRE)
                    .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_ENTER | Geofence.GEOFENCE_TRANSITION_DWELL)
                    .setLoiteringDelay(60_000)
                    .build());
        }
        final GeofencingClient client = LocationServices.getGeofencingClient(app);
        final PendingIntent pi = pendingIntent(app);
        client.removeGeofences(pi).addOnCompleteListener(t -> {
            if (fences.isEmpty()) return;
            GeofencingRequest req = new GeofencingRequest.Builder()
                    .setInitialTrigger(GeofencingRequest.INITIAL_TRIGGER_ENTER)
                    .addGeofences(fences)
                    .build();
            try {
                client.addGeofences(req, pi);
            } catch (SecurityException ignored) {
                // sin permiso de ubicación
            }
        });
    }
}
