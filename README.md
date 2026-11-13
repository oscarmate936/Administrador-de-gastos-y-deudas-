# Mis Finanzas

App para llevar el control de ingresos, gastos, tarjetas de crédito y préstamos.
Pensada para El Salvador (dólares, Banco Agrícola y Davivienda).

El mismo código sale en dos formas:

- **APK para Android**, empaquetado con Capacitor.
- **App web instalable (PWA)**, que se abre en el navegador y se puede agregar a
  la pantalla de inicio.

En ambas funciona sin conexión y **los datos se guardan solo en el dispositivo**;
no hay servidor ni cuentas.

## Qué hace hoy

- Registrar pagos recibidos (sin día fijo) y otros ingresos.
- Registrar gastos por categoría; el disponible se va restando.
- Resumen "desde tu último pago": gastado, porcentaje del pago, promedio por día
  y gasto por categoría.
- Historial por mes, con edición y borrado.
- Categorías personalizables.
- Tarjetas de crédito: fecha de corte y último día de pago, saldo, crédito
  disponible, pago de contado pendiente, estimado del próximo estado de cuenta,
  compras en cuotas y pagos.
- Préstamos: saldo, próxima cuota, tiempo restante, fecha de término, intereses
  por pagar, cuotas y abonos extra con separación de capital e intereses, y
  simulador de abono extra.
- Próximos pagos de tarjetas y préstamos, y cuánto queda libre después de
  apartar lo que vence en 15 días.
- Importar estados de cuenta en PDF de tarjetas de Davivienda y Banco Agrícola:
  lee el resumen (corte, último día de pago, pago de contado, pago mínimo,
  saldo, límite, disponible, tasa) y los movimientos, comprueba que sumen lo
  mismo que los totales del banco, detecta los ya registrados y sugiere
  categorías. La lectura ocurre en el dispositivo con PDF.js; el archivo no se
  envía a ningún servidor.
- Respaldo: exportar todos los datos a un archivo y restaurarlos.

Las compras con tarjeta aumentan la deuda de la tarjeta y no bajan el
disponible; el disponible baja cuando se registra el pago de la tarjeta.

## Plan

Hecho: base, ingresos y gastos, tarjetas, préstamos e importación de estados de
cuenta de tarjetas en PDF. Lo que sigue (proteger los datos, recordatorios, más
estados de cuenta, costo de las deudas y plan de pago, comodidad y fotos) está
en [docs/PLAN.md](docs/PLAN.md).

## Desarrollo

Requiere Node 22.

```bash
npm install
npm run dev      # servidor de desarrollo
npm test         # pruebas de la lógica
npm run build    # revisa tipos y genera dist/
npm run preview  # sirve dist/ para probar la app instalable
```

## Compilar el APK

Requiere JDK 21 y el SDK de Android (plataforma 36 y build-tools 36.0.0), con
`ANDROID_HOME` apuntando al SDK.

```bash
npm run apk
# resultado: android/app/build/outputs/apk/debug/app-debug.apk
```

`npm run build:android` solo actualiza el proyecto de `android/` con la versión
web más reciente, sin compilar.

El APK de depuración se firma con una llave que cada computadora genera por su
cuenta. Android no deja instalar una actualización firmada con otra llave: hay
que desinstalar, y eso borra los datos. Antes de usar la app con datos reales
conviene firmar siempre con una misma llave propia.

## Estructura

- `src/db.ts`: base de datos local (IndexedDB con Dexie) y tipos.
- `src/lib/`: lógica sin interfaz (dinero en centavos, fechas, resúmenes, tarjetas y préstamos, respaldo), con pruebas.
- `src/pantallas/`: Inicio, Movimientos, Deudas (con el detalle de cada tarjeta y préstamo) y Ajustes.
- `src/componentes/`: formularios y piezas compartidas.
- `src/lib/estados/`: lectura de estados de cuenta en PDF. `ejemplos.ts` imita la
  posición del texto de cada banco con datos inventados para las pruebas.
- `src/lib/nativo.ts`: lo que cambia dentro del APK (botón Atrás, compartir el respaldo).
- `android/`: proyecto de Android generado por Capacitor.

## Publicación

`.github/workflows/publicar.yml` corre las pruebas y publica `dist/` en GitHub
Pages con cada cambio en `main`. Requiere activar Pages una vez en
Settings → Pages → Source: **GitHub Actions**.

No subas estados de cuenta ni respaldos a este repositorio: es público. Las
pruebas usan solo datos inventados.
