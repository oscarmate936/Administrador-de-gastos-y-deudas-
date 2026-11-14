package sv.misfinanzas.app;

import android.content.Context;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Recibe de la app los textos del widget, los guarda en el celular y redibuja el widget. */
@CapacitorPlugin(name = "Widget")
public class WidgetPlugin extends Plugin {

    @PluginMethod
    public void actualizar(PluginCall llamada) {
        Context contexto = getContext();
        Boolean oculto = llamada.getBoolean("oculto", false);
        contexto
            .getSharedPreferences(WidgetLibre.PREFERENCIAS, Context.MODE_PRIVATE)
            .edit()
            .putString("etiqueta", llamada.getString("etiqueta", "Mis Finanzas"))
            .putString("monto", llamada.getString("monto"))
            .putString("detalle", llamada.getString("detalle", ""))
            .putBoolean("oculto", oculto != null && oculto)
            .apply();
        WidgetLibre.actualizarTodos(contexto);
        llamada.resolve();
    }
}
