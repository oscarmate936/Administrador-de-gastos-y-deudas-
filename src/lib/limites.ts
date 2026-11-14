import type { Categoria, Movimiento } from '../db';
import { formatearDinero } from './dinero';
import { mesDe } from './fechas';

export interface EstadoLimite {
  categoria: Categoria;
  gastadoCentavos: number;
  limiteCentavos: number;
  /** 0 a 100 o más. */
  porcentaje: number;
}

/** Gasto del mes (con y sin tarjeta) de una categoría, sin contar el movimiento `excepto`. */
export function gastadoEnMes(movimientos: Movimiento[], categoriaId: string, mes: string, excepto?: string): number {
  return movimientos
    .filter((m) => m.tipo === 'gasto' && m.categoriaId === categoriaId && mesDe(m.fecha) === mes && m.id !== excepto)
    .reduce((t, m) => t + m.montoCentavos, 0);
}

/** Categorías con límite y cuánto llevan este mes, de la más usada a la menos. */
export function estadoLimites(movimientos: Movimiento[], categorias: Categoria[], mes: string): EstadoLimite[] {
  return categorias
    .filter((c) => c.limiteCentavos && c.limiteCentavos > 0)
    .map((c) => {
      const gastado = gastadoEnMes(movimientos, c.id, mes);
      return {
        categoria: c,
        gastadoCentavos: gastado,
        limiteCentavos: c.limiteCentavos!,
        porcentaje: Math.round((gastado / c.limiteCentavos!) * 100),
      };
    })
    .sort((a, b) => b.porcentaje - a.porcentaje);
}

/** Mensaje si un gasto hace cruzar el 80% o el 100% del límite; null si no cruza. */
export function avisoLimite(categoria: Categoria, antesCentavos: number, despuesCentavos: number): string | null {
  const limite = categoria.limiteCentavos;
  if (!limite) return null;
  if (antesCentavos < limite && despuesCentavos >= limite) {
    const exceso = despuesCentavos - limite;
    return exceso > 0
      ? `Te pasaste del límite de ${categoria.nombre} por ${formatearDinero(exceso)} este mes.`
      : `Llegaste al límite de ${categoria.nombre} de este mes (${formatearDinero(limite)}).`;
  }
  const ochenta = Math.round(limite * 0.8);
  if (antesCentavos < ochenta && despuesCentavos >= ochenta) {
    return `Llevas el ${Math.round((despuesCentavos / limite) * 100)}% del límite de ${categoria.nombre}: te quedan ${formatearDinero(limite - despuesCentavos)} este mes.`;
  }
  return null;
}
