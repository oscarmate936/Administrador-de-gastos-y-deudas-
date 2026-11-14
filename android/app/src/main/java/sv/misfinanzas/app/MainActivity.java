package sv.misfinanzas.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // El complemento propio del widget se registra antes de iniciar Capacitor.
        registerPlugin(WidgetPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
