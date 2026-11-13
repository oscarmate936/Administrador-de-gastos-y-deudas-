import { normalizar } from './lectura';

// Categoría sugerida para un cargo según el texto del estado de cuenta.
// Solo es una sugerencia: en la pantalla de revisión se puede cambiar.
const REGLAS: Array<[RegExp, string]> = [
  [/INTERES|\bIVA\b|COMISION|CARGO POR|MEMBRESIA|RECARGO|\bMORA\b|SEGURO DE/, 'intereses'],
  [/AVANCE DE EFECTIVO|RETIRO DE EFECTIVO/, 'otros'],
  [/SUPER|SELECTOS|DESPENSA|WALMART|PRICESMART|LA COLONIA|DEL CORRAL/, 'super'],
  [/UBER|INDRIVE|GASOLINERA|\bPUMA\b|TEXACO|SHELL|\bESSO\b|\bUNO\b|PARQUEO|PEAJE/, 'transporte'],
  [/FARMACIA|HOSPITAL|CLINICA|LABORATORIO|MEDIC|OPTICA/, 'salud'],
  [/RECARGA|\bCLARO\b|\bTIGO\b|DIGICEL|MOVISTAR|CAESS|DELSUR|\bANDA\b|\bAES\b|CABLE|INTERNET/, 'servicios'],
  [/NETFLIX|SPOTIFY|CINE|STEAM|PLAYSTATION|XBOX|DISNEY|\bHBO\b|\bMAX\b/, 'ocio'],
  [/RESTAUR|POLLO|PIZZA|BURGER|MCDONALD|WENDY|STARBUCKS|\bCAFE\b|PUPUS|DOMINO|SUBWAY|\bKFC\b|BIGGEST|CAMPERO|PAPA JOHN/, 'comida'],
];

export function sugerirCategoria(concepto: string): string | undefined {
  const t = normalizar(concepto);
  return REGLAS.find(([re]) => re.test(t))?.[1];
}
