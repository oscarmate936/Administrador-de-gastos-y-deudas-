# Plan de implementación

Hoja de ruta de Mis Finanzas a partir de la versión 0.3.0. Cada fase termina en
una versión instalable que se actualiza encima de la anterior sin borrar datos.

## Dónde estamos (0.3.0)

- Ingresos sin día fijo, gastos por categoría y disponible.
- Tarjetas de crédito y préstamos, con próximos pagos.
- Importar estados de cuenta en PDF de tarjetas de Davivienda y Banco Agrícola.
- Respaldo manual a un archivo.
- APK de prueba firmado con una llave temporal.

## Reglas para todas las fases

- **Tus datos se quedan en el celular.** Nada se envía a un servidor y no hay costos.
- **Cada cambio lleva pruebas automáticas** de la lógica y una prueba completa en el
  navegador con tamaño de celular antes de compilar.
- **Los cambios de la base de datos llevan migración con prueba**, y los respaldos de
  versiones anteriores se siguen pudiendo restaurar.
- **Nada personal en el repositorio**, que es público: las pruebas usan datos inventados.
- **La lógica va separada de la pantalla** (`src/lib/`), para poder probarla sin el celular.

## Resumen

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Proteger tus datos: llave fija, respaldo automático, huella o PIN, historial de saldos | Hecho (0.4) |
| 2 | Recordatorios en el celular | Hecho (0.5) |
| 3 | Más estados de cuenta: tarjeta Davivienda, préstamos, compras a plazos | Hecho: tarjetas y compras a plazos de Davivienda (1.2) y préstamos desde captura de la app del banco (1.3) |
| 4 | Costo de las deudas, plan para salir de deudas, límites por categoría | Hecho (0.6) |
| 5 | Gastos recurrentes, gráficas, búsqueda, exportar | Hecho (0.7) |
| 6 | Fotos de tickets y capturas | Hecho (1.0) |
| — | Rediseño: barra con botón +, sección Análisis, Ajustes desde Inicio, íconos y estilo nuevos | Hecho (1.4) |
| — | Ideas de apps profesionales: registrar más rápido, Inicio, deudas, análisis y widget | Hecho (1.5 a 1.9) |
| — | Auditoría: quitar lo repetido | Hecho (1.9.2) |
| — | Préstamos con interés por día y seguros que bajan con el saldo, «Ya pagué» en los avisos, respaldo automático en Documentos, fondo de emergencia y resumen del mes | Hecho (2.0) |
| — | Auditoría completa: 18 errores corregidos | Hecho (2.1) |
| — | Registrar compras desde los SMS del banco | Pendiente: hacen falta ejemplos de los mensajes |

La fase 3 puede adelantarse en cuanto lleguen los PDF; no depende de las demás.

---

## Fase 1 · Proteger tus datos (0.4)

Va primero porque, sin esto, meter datos reales es arriesgado.

### 1.1 Llave de firma fija y APK compilado en GitHub

**Problema:** el APK actual está firmado con una llave temporal de una sesión. Android
solo instala una actualización si tiene la misma firma; con otra llave hay que
desinstalar, y eso borra los datos.

**Solución:**

1. Generar una llave de firma (`keytool`) una sola vez, con su contraseña.
2. **Tú la guardas** en dos lugares seguros (por ejemplo Google Drive y una memoria).
   Si se pierde, ninguna versión futura podrá instalarse encima.
3. Tú la cargas como secretos del repositorio en GitHub (Settings → Secrets and
   variables → Actions): `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
   `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Yo no puedo crear secretos.
4. `android/app/build.gradle`: firma de la versión final leída de esas variables y
   número de versión automático.
5. Nuevo flujo `.github/workflows/android.yml`: en cada cambio en `main` corre las
   pruebas, compila el APK firmado y lo publica como *Release* en GitHub. Lo descargas
   desde ahí en el celular.

**Transición:** el APK de prueba actual no puede actualizarse al firmado. Hay que
desinstalarlo una vez antes de meter datos reales (o crear un respaldo, desinstalar y
restaurar).

**Listo cuando:** dos versiones seguidas se instalan una encima de otra y los datos
siguen ahí.

### 1.2 Respaldo automático

- **Copia automática diaria dentro del celular** (`@capacitor/filesystem`, carpeta de
  la app): al abrir la app, si pasó más de un día, guarda una copia y conserva las
  últimas 7. Protege de un error dentro de la app, no de perder el celular.
- **Recordatorio semanal de respaldo externo:** aviso en Inicio (y notificación desde la
  fase 2) para compartir el archivo a Drive o a otro lugar.
- **Respaldo cifrado con contraseña** (opcional, recomendado): un archivo con todas tus
  finanzas no debería quedar legible en Drive o WhatsApp. AES-GCM con una clave derivada
  de la contraseña (PBKDF2), con la Web Crypto del propio WebView.
- **En Ajustes:** fecha del último respaldo externo y lista de copias automáticas para
  restaurar.
- **Copia de seguridad de Android:** el APK ya tiene `allowBackup="true"`. Hay que
  comprobar en un teléfono si incluye los datos de la app antes de contar con ella.

### 1.3 Bloqueo con huella o PIN

- **Huella o rostro** con `@capgo/capacitor-native-biometric` (compatible con Capacitor 8).
- **PIN de 4 a 6 dígitos** como alternativa y como respaldo de la huella. Se guarda
  solo un *hash* del PIN.
- **Cuándo se pide:** al abrir la app y al volver tras unos minutos en segundo plano
  (evento `appStateChange` de `@capacitor/app`).
- **Pantalla oculta** en la lista de apps recientes (`@capacitor-community/privacy-screen`).
- **Desactivado por defecto**, se activa en Ajustes. Si olvidas el PIN y no tienes
  huella registrada, no hay forma de entrar sin borrar los datos. La app lo advierte y
  pide hacer un respaldo al activarlo.
- **En la versión web** solo hay PIN.

### 1.4 Historial de saldos

Para que las gráficas de la fase 5 tengan historia, desde esta versión la app guarda una
"foto" mensual de la deuda de cada tarjeta y préstamo, y de tu disponible. Es una tabla
nueva y pequeña en la base de datos.

---

## Fase 2 · Recordatorios en el celular (0.5)

Complemento oficial `@capacitor/local-notifications`. Funciona sin internet.

**Qué avisa** (los días y la hora se cambian en Ajustes):

| Aviso | Cuándo | Condición |
|---|---|---|
| Último día de pago de tarjeta | 5 y 2 días antes, y el mismo día | Solo si queda pago de contado pendiente |
| Pago vencido | El día siguiente | Si sigue pendiente |
| Corte de tarjeta | El día anterior | "Mañana corta: lo que compres después va al siguiente estado de cuenta" |
| Cuota de préstamo | 3 días antes y el mismo día | Solo si no está pagada |
| Estado de cuenta disponible | 2 días después del corte | Para importar el PDF |
| Respaldo externo | Cada semana | Si no se ha hecho |

**Detalles:**

- **Permiso:** Android 13 o superior pide permiso para notificaciones la primera vez.
- **Programación por adelantado:** Capacitor 8 todavía no puede ejecutar tareas en segundo
  plano (`@capacitor/background-runner` solo existe para Capacitor 9, en prueba). Por eso
  la app reprograma los avisos de los próximos 60 días cada vez que se abre o cambia un
  dato. Si no la abres en dos meses, dejan de llegar; el último aviso pide abrirla.
- **Al pagar,** los avisos de esa deuda se cancelan solos.
- **Botón "Ya pagué"** en la notificación: abre el formulario de pago con el monto puesto.
- **Lógica separada** (`src/lib/recordatorios.ts`): calcula la lista de avisos a partir de
  los datos, con pruebas. La parte nativa solo los programa.
- **En la versión web** no hay notificaciones; Inicio ya muestra los próximos pagos.

---

## Fase 3 · Más estados de cuenta (0.6)

Depende de que me pases PDF de ejemplo.

- **Tarjeta de crédito Davivienda** (la que falta): probarla. Si es el mismo formato, solo
  se agregan pruebas.
- **Préstamos de Davivienda y Banco Agrícola:** lector nuevo para saldo de capital, cuota,
  tasa, próxima fecha, cuotas pagadas y restantes, y desglose de capital e intereses del
  último pago. Crea o actualiza el préstamo, con la misma pantalla de revisión. Hace falta
  un PDF de cada banco.
- **Compras a plazos y extrafinanciamiento de tarjetas:** leer esa tabla para conocer las
  cuotas pendientes. En tus dos PDF estaba vacía; hace falta uno que la tenga.

---

## Fase 4 · Costo de las deudas y plan para salir (0.7)

### 4.1 Cuánto te cuestan tus deudas

- **Por mes y por tarjeta:** intereses, comisiones, IVA y cargos por avance de efectivo.
  Sale de la categoría "Intereses y comisiones" (importados y manuales) y de la parte de
  intereses de cada cuota de préstamo.
- **En Deudas:** "Este mes pagaste $X en intereses y comisiones", más el acumulado del año.
- **Avances de efectivo:** al registrar o importar uno, mostrar lo que cuesta. Pagan
  comisión e IVA y generan interés desde el primer día, sin periodo de gracia.

### 4.2 Plan para salir de deudas

- **Entrada:** cuánto puedes pagar al mes en total, entre todas las deudas.
- **Métodos:**
  - **Avalancha (recomendado):** primero la de tasa más alta.
  - **Bola de nieve:** primero la de saldo más pequeño, para ver avances rápido.
- **Simulación** mes a mes con la tasa de cada deuda: mínimos en todas y el resto a la
  que toca.
- **Resultado:** orden de pago, fecha en que terminas cada deuda y todas, e intereses
  totales. Se compara con pagar solo los mínimos.
- **"Este mes paga":** cuánto dar a cada deuda según el plan, enlazado con Próximos pagos.
- **Mínimos futuros de tarjetas:** cada banco tiene su fórmula, así que se estiman y se
  ajustan con los mínimos de los estados de cuenta importados. Serán aproximados.
- **Lógica separada** (`src/lib/plan.ts`) con pruebas, incluido el caso en que el monto no
  alcanza ni para los mínimos.

### 4.3 Límites por categoría

- Límite mensual por categoría, o por periodo desde tu último pago.
- Barra de avance en Inicio y aviso al llegar al 80% y al 100%, al registrar y por
  notificación.
- Cuenta también las compras con tarjeta.

---

## Fase 5 · Comodidad (0.8)

- **Gastos recurrentes:** plantillas con monto, categoría, tarjeta o efectivo, y día del
  mes. Cuando toca, Inicio los propone y se confirman con un toque; no se registran solos,
  para no anotar gastos que no ocurrieron.
- **Gráficas:** deuda total por mes (usa el historial de la fase 1.4), gasto por categoría
  por mes, e ingresos contra salidas.
- **Buscar y filtrar movimientos** por texto, categoría o tarjeta.
- **Exportar a Excel (CSV).**

---

## Fase 6 · Fotos de tickets y capturas (0.9)

La de menor prioridad, porque es la menos precisa.

- **Reconocimiento de texto en el celular**, sin internet y gratis (ML Kit de Google en
  Android). El complemento se elige al llegar a esta fase.
- Extrae total, fecha y comercio y abre el formulario de gasto ya lleno para revisar.
- **Idea a evaluar:** "Compartir con Mis Finanzas" desde el SMS o el correo que manda el
  banco con cada compra, para registrarla con un toque.

---

## Qué necesito de ti

1. **Fase 1:** cargar los secretos de la llave en GitHub (te guío paso a paso) y guardar la
   llave en dos lugares.
2. **Fase 1:** autorización para pasar los cambios a `main` con un *pull request*. El APK
   firmado y la versión web se compilan desde ahí.
3. **Fase 3:** PDF de la tarjeta de Davivienda, de un préstamo de cada banco y, si tienes,
   de una tarjeta con compras a plazos.
4. **Al probar cada versión en tu celular:** decirme qué falla o qué cambiarías.
