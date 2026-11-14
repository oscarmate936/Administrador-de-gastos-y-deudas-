// Explicación corta de los términos que aparecen en tarjetas, préstamos y el plan.

export const GLOSARIO = {
  'libre para gastar':
    'Lo que tienes menos lo que ya está apartado para los pagos de tarjetas y préstamos de los próximos 15 días.',
  'pago de contado':
    'Lo que debes pagar antes del último día de pago para no generar intereses. Es el saldo del último estado de cuenta menos lo que ya pagaste.',
  'pago mínimo':
    'Lo menos que el banco acepta para no cobrarte mora. Si pagas solo eso, el resto genera intereses.',
  corte:
    'El día en que el banco cierra el mes de tu tarjeta. Lo que compres después del corte sale en el estado de cuenta siguiente.',
  'último día de pago': 'La fecha límite para pagar el estado de cuenta sin cargos por mora.',
  'crédito disponible': 'Lo que todavía puedes usar de tu límite de crédito.',
  'compras a plazos':
    'Compras que el banco divide en cuotas mensuales. Cada corte se carga una cuota a tu tarjeta.',
  extrafinanciamiento:
    'Un préstamo que el banco da sobre tu tarjeta y cobras en cuotas mensuales con intereses, aparte del saldo normal.',
  'tasa anual': 'El interés que cobra la deuda en un año. Al mes se cobra más o menos la doceava parte.',
  'abono a capital': 'La parte del pago que baja lo que debes. El resto se va en intereses y otros cargos.',
  'abono extra': 'Un pago adicional a la cuota. Va todo a capital y hace que termines antes y pagues menos intereses.',
  avalancha: 'Pagar primero la deuda con la tasa más alta. Es la forma de pagar menos intereses en total.',
  'bola de nieve': 'Pagar primero la deuda más pequeña. Terminas deudas más rápido, aunque pagas algo más de intereses.',
} as const;

export type Termino = keyof typeof GLOSARIO;
