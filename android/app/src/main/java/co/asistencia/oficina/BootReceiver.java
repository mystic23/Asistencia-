package co.asistencia.oficina;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Las geocercas se borran al reiniciar el celular o actualizar la app: se vuelven a registrar. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        Geofences.register(ctx);
        if (Prefs.array(ctx, Prefs.PENDING_UPLOAD).length() > 0) SyncJob.schedule(ctx);
    }
}
