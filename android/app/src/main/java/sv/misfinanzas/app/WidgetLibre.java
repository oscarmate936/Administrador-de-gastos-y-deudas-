package sv.misfinanzas.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.widget.RemoteViews;

/**
 * Widget de la pantalla principal: lo libre para gastar (o el disponible) y un
 * botón para registrar un gasto. La app guarda los textos con WidgetPlugin cada
 * vez que cambian sus datos; con el bloqueo activo la cifra se oculta.
 */
public class WidgetLibre extends AppWidgetProvider {

    static final String PREFERENCIAS = "misfinanzas_widget";

    @Override
    public void onUpdate(Context contexto, AppWidgetManager manejador, int[] ids) {
        for (int id : ids) {
            dibujar(contexto, manejador, id);
        }
    }

    /** Vuelve a dibujar todos los widgets que la persona tenga puestos. */
    static void actualizarTodos(Context contexto) {
        AppWidgetManager manejador = AppWidgetManager.getInstance(contexto);
        int[] ids = manejador.getAppWidgetIds(new ComponentName(contexto, WidgetLibre.class));
        for (int id : ids) {
            dibujar(contexto, manejador, id);
        }
    }

    static void dibujar(Context contexto, AppWidgetManager manejador, int id) {
        SharedPreferences datos = contexto.getSharedPreferences(PREFERENCIAS, Context.MODE_PRIVATE);
        boolean oculto = datos.getBoolean("oculto", false);
        String monto = datos.getString("monto", null);

        RemoteViews vista = new RemoteViews(contexto.getPackageName(), R.layout.widget_libre);
        vista.setTextViewText(R.id.widget_etiqueta, datos.getString("etiqueta", "Mis Finanzas"));
        if (oculto) {
            vista.setTextViewText(R.id.widget_monto, "• • • •");
            vista.setTextViewText(R.id.widget_detalle, "Abre la app con tu PIN para ver la cifra");
        } else if (monto == null) {
            vista.setTextViewText(R.id.widget_monto, "—");
            vista.setTextViewText(R.id.widget_detalle, "Abre la app una vez para ver tu saldo");
        } else {
            vista.setTextViewText(R.id.widget_monto, monto);
            vista.setTextViewText(R.id.widget_detalle, datos.getString("detalle", ""));
        }

        int banderas = PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT;

        Intent abrir = new Intent(contexto, MainActivity.class);
        abrir.setAction(Intent.ACTION_MAIN);
        abrir.addCategory(Intent.CATEGORY_LAUNCHER);
        abrir.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        vista.setOnClickPendingIntent(R.id.widget_raiz, PendingIntent.getActivity(contexto, 0, abrir, banderas));

        Intent gasto = new Intent(Intent.ACTION_VIEW, Uri.parse("misfinanzas://agregar/gasto"), contexto, MainActivity.class);
        gasto.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        vista.setOnClickPendingIntent(R.id.widget_gasto, PendingIntent.getActivity(contexto, 1, gasto, banderas));

        manejador.updateAppWidget(id, vista);
    }
}
