# Mis Finanzas

App para llevar el control de ingresos, gastos, tarjetas de crédito y préstamos.
Pensada para El Salvador (dólares, Banco Agrícola y Davivienda).

Es una app web instalable (PWA): se abre en el navegador del celular y se puede
agregar a la pantalla de inicio. Funciona sin conexión y **los datos se guardan
solo en el dispositivo**; no hay servidor ni cuentas.

## Qué hace hoy

- Registrar pagos recibidos (sin día fijo) y otros ingresos.
- Registrar gastos por categoría; el disponible se va restando.
- Resumen "desde tu último pago": gastado, porcentaje del pago, promedio por día
  y gasto por categoría.
- Historial por mes, con edición y borrado.
- Categorías personalizables.
- Respaldo: exportar todos los datos a un archivo y restaurarlos.

## Plan

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Base del proyecto, diseño para celular, app instalable | Hecho |
| 2 | Ingresos, gastos, categorías, disponible, respaldo | Hecho |
| 3 | Tarjetas de crédito: corte, fecha límite, periodos, pagos, compras en cuotas | Pendiente |
| 4 | Préstamos: tabla de pagos, pagos extras, tiempo restante | Pendiente |
| 5 | Recordatorios de fechas de corte y de pago | Pendiente |
| 6 | Lectura de estados de cuenta en PDF y de fotos, dentro del celular | Pendiente |
| 7 | Reportes, simulador de pago de deudas | Pendiente |

## Desarrollo

Requiere Node 22.

```bash
npm install
npm run dev      # servidor de desarrollo
npm test         # pruebas de la lógica
npm run build    # revisa tipos y genera dist/
npm run preview  # sirve dist/ para probar la app instalable
```

## Estructura

- `src/db.ts`: base de datos local (IndexedDB con Dexie) y tipos.
- `src/lib/`: lógica sin interfaz (dinero en centavos, fechas, resúmenes, respaldo), con pruebas.
- `src/pantallas/`: Inicio, Movimientos y Ajustes.
- `src/componentes/`: formularios y piezas compartidas.

## Publicación

`.github/workflows/publicar.yml` corre las pruebas y publica `dist/` en GitHub
Pages con cada cambio en `main`. Requiere activar Pages una vez en
Settings → Pages → Source: **GitHub Actions**.

No subas estados de cuenta ni respaldos a este repositorio: es público.
