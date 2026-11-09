package co.asistencia.oficina;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import com.google.android.gms.location.Geofence;
import com.google.android.gms.location.GeofencingEvent;

import java.util.List;

/** Android lo llama al entrar a una oficina, incluso con la app cerrada. */
public class GeofenceReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        GeofencingEvent ev = GeofencingEvent.fromIntent(intent);
        if (ev == null || ev.hasError()) return;
        int t = ev.getGeofenceTransition();
        if (t != Geofence.GEOFENCE_TRANSITION_ENTER && t != Geofence.GEOFENCE_TRANSITION_DWELL) return;
        List<Geofence> list = ev.getTriggeringGeofences();
        String place = list != null && !list.isEmpty() ? list.get(0).getRequestId() : "Oficina";
        Checkins.record(ctx, place);
    }
}
