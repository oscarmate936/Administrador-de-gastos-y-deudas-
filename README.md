# Mis Finanzas

App para llevar el control de ingresos, gastos, tarjetas de crédito y préstamos.
Pensada para El Salvador (dólares, Banco Agrícola y Davivienda).

El mismo código sale en dos formas:

- **APK para Android**, empaquetado con Capacitor.
- **App web instalable (PWA)**, que se abre en el navegador y se puede agregar a
  la pantalla de inicio.

En ambas funciona sin conexión y **los datos se guardan solo en el dispositivo**;
no hay servidor ni cuentas.

## Cómo está organizada

- **Inicio:** lo libre para gastar, el asistente, lo que requiere atención
  (pagos que vencen, gastos por confirmar, límites, respaldo), el resumen del
  mes y los últimos movimientos. El engranaje abre **Ajustes**.
- **Movimientos:** la lista por día, con búsqueda y filtros.
- **Botón + (centro):** gasto, ingreso, pago de deuda, foto de ticket, estado de
  cuenta en PDF, captura de préstamo y nuevas tarjetas o préstamos.
- **Deudas:** total, lo que vence en 30 días y las tarjetas y préstamos.
- **Análisis:** gráficas, en qué gastas con sus límites, el costo de las deudas
  y el plan para salir de ellas.

## Qué hace

**Día a día**
- Pagos recibidos sin día fijo, otros ingresos y gastos por categoría.
- Disponible, lo que queda libre después de apartar los pagos de los próximos
  15 días, y resumen desde el último pago.
- Gastos que se repiten cada mes, propuestos en Inicio para confirmar.
- Límites de gasto por categoría con avisos al 80% y al 100%.
- Leer tickets y capturas de la app del banco con la cámara (en el dispositivo,
  sin internet) para llenar el gasto.
- Asistente en Inicio (sin IA, con reglas, en el dispositivo) para registrar con
  una frase escrita o dictada: "gasté 12.50 en almuerzo con la Visa ayer",
  "pagué 100 a la Mastercard" o "me pagaron 450". Si se le escribe una pregunta
  ("¿cuánto debo?") también la responde.

**Más rápido y más claro (1.5 a 1.9)**
- Teclado propio para el monto, con sumas; categorías y tarjetas ordenadas por uso, y
  la app recuerda la categoría y la tarjeta de cada comercio.
- Deshacer al guardar, editar o borrar; deslizar un movimiento para editarlo o borrarlo.
- Atajos al mantener presionado el ícono (gasto, ticket, pago) y widget de Android
  con lo libre para gastar.
- Inicio: cuánto puedes gastar por día, hasta cuándo te alcanza, gráfica de ritmo,
  «Próximos pagos» (el mínimo de cada tarjeta y la cuota de cada préstamo pendientes
  del mes, con el total), primeros pasos y secciones que se pueden ocultar u ordenar.
- Deudas: camino a «libre de deudas» con metas, calendario de pagos, cuánto ahorras
  pagando un poco más, costo de pagar solo el mínimo y explicación de cada término.
- Análisis: comparación con el mes anterior, gastos fijos y variables, y el detalle
  de cada categoría.
- Letra grande y vibración opcionales.

**Deudas**
- Tarjetas de crédito: corte, último día de pago, saldo, crédito disponible,
  pago de contado y mínimo, próximo estado de cuenta, compras en cuotas y pagos.
- Préstamos: próxima cuota, tiempo restante, fecha de término, intereses,
  cuotas y abonos extra con capital e intereses, y simulador de abono.
- Importar estados de cuenta en PDF de tarjetas de Davivienda y Banco Agrícola.
- Préstamos desde una o varias capturas de la app del banco (Banco Agrícola y BAC):
  se crea el préstamo o se ajusta uno existente (saldo, cuota, tasa, próxima cuota,
  seguros y otros cargos) sin borrar los pagos. Con el desglose de la cuota, el pago
  usa el capital exacto del banco.
- Intereses por día desde el último pago (como los cobran los bancos) y seguros que
  bajan con el saldo: la fecha de término coincide con la del banco. Con el desglose
  de la captura se deduce la fecha del último pago.
- Los seguros y otros cargos de la cuota no se cuentan como capital ni como intereses.
- Pagos parciales: se suman hasta completar la cuota.
- Tarjetas: si pasa el último día de pago sin pagar el total, se suman intereses estimados
  hasta importar el siguiente estado de cuenta. Las devoluciones del estado de cuenta bajan
  la deuda sin restar del disponible.
- Compras a plazos y extrafinanciamiento (Davivienda): se leen del estado de
  cuenta, se suman a la deuda total y cada corte cobra su cuota en la tarjeta.
- Cuánto cuestan las deudas (intereses, comisiones, IVA, avances de efectivo).
- Plan para salir de deudas (avalancha o bola de nieve) comparado con pagar
  solo los mínimos.

**Avisos y análisis**
- Recordatorios en el celular: último día de pago, cuotas, corte, estado de
  cuenta listo, actualizar préstamos cada mes, resumen del mes y respaldo.
- «Ya pagué» en el aviso de pago: registra el pago exacto sin abrir el formulario
  (con deshacer); en tarjetas, «Pagué el total» o «Pagué el mínimo»; «Otro monto» abre el
  formulario. «Probar un aviso» en Recordatorios comprueba que lleguen.
- Resumen del mes que terminó en Inicio la primera semana del mes.
- Gráficas de ingresos y salidas, deuda total por mes y gasto por categoría.
- Búsqueda y filtros en todos los movimientos; exportar a CSV (Excel).

**Seguridad y respaldo**
- Bloqueo con PIN y huella; contenido oculto en las apps recientes.
- Respaldo cifrado con contraseña, copia automática diaria y aviso semanal.
- Respaldo automático cifrado cada día en Documentos/MisFinanzas (queda aunque se
  borre la app) y «Guardar en Drive» con un toque desde el aviso semanal. Su contraseña
  no va a la copia de seguridad de Google.

**Ahorro**
- Fondo de emergencia con meta sugerida (un mes de gastos): lo apartado sigue en la
  cuenta pero no cuenta como libre para gastar.

Las compras con tarjeta aumentan la deuda de la tarjeta y no bajan el
disponible; el disponible baja cuando se registra el pago de la tarjeta.

## Plan

Todas las fases de [docs/PLAN.md](docs/PLAN.md) están hechas, salvo la parte de
la fase 3 que depende de estados de cuenta de ejemplo (préstamos y compras a
plazos).

## Desarrollo

Requiere Node 22.

```bash
npm install
npm run dev      # servidor de desarrollo
npm test         # pruebas de la lógica
npm run build    # copia el lector de tickets, revisa tipos y genera dist/
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
- `src/pantallas/`: Inicio, Movimientos, Deudas (con el detalle de cada tarjeta y préstamo), Análisis y Ajustes.
- `src/componentes/Simbolo.tsx`: los íconos de línea y las insignias de color; `Agregar.tsx`: la hoja del botón +.
- `src/componentes/`: formularios y piezas compartidas.
- `src/lib/estados/`: lectura de estados de cuenta en PDF. `ejemplos.ts` imita la
  posición del texto de cada banco con datos inventados para las pruebas.
- `src/lib/asistente/`: intérprete de frases del asistente.
- `src/lib/ocr/`: lectura de tickets y capturas de préstamos con Tesseract. Lee
  con dos motores (LSTM y clásico) y avisa cuando no coinciden. `scripts/copiar-ocr.mjs`
  copia el motor y los datos de español a `public/ocr` al compilar.
- `src/lib/nativo.ts`: lo que cambia dentro del APK (botón Atrás, compartir el respaldo).
- `android/`: proyecto de Android generado por Capacitor.

## Publicación

`.github/workflows/publicar.yml` corre las pruebas y publica `dist/` en GitHub
Pages con cada cambio en `main`. Requiere activar Pages una vez en
Settings → Pages → Source: **GitHub Actions**.

No subas estados de cuenta ni respaldos a este repositorio: es público. Las
pruebas usan solo datos inventados.
