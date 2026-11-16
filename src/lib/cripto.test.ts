import { describe, expect, it } from 'vitest';
import { cifrar, descifrar, esPinValido, esSobre, protegerPin, verificarPin } from './cripto';

describe('PIN', () => {
  it('acepta de 4 a 6 dígitos', () => {
    expect(esPinValido('1234')).toBe(true);
    expect(esPinValido('123456')).toBe(true);
    expect(esPinValido('123')).toBe(false);
    expect(esPinValido('12a4')).toBe(false);
    expect(esPinValido('1234567')).toBe(false);
  });

  it('guarda solo el derivado y lo verifica', async () => {
    const g = await protegerPin('2580');
    expect(g.pinHash).not.toContain('2580');
    expect(await verificarPin('2580', g)).toBe(true);
    expect(await verificarPin('2581', g)).toBe(false);
    expect(await verificarPin('2580', {})).toBe(false);
    // Misma clave, distinta sal: distinto derivado.
    expect((await protegerPin('2580')).pinHash).not.toBe(g.pinHash);
  });
});

describe('respaldo cifrado', () => {
  it('cifra y descifra con la contraseña correcta', async () => {
    const sobre = await cifrar('{"hola":"mundo ñ"}', 'clave segura');
    expect(esSobre(sobre)).toBe(true);
    expect(JSON.stringify(sobre)).not.toContain('mundo');
    expect(await descifrar(sobre, 'clave segura')).toBe('{"hola":"mundo ñ"}');
  });

  it('cifra un respaldo grande (más de un megabyte)', async () => {
    // Antes fallaba al pasar de unos 125 KB: años de movimientos no cabían.
    const grande = JSON.stringify(Array.from({ length: 12000 }, (_, i) => ({ id: `mov-${i}`, nota: 'Súper Selectos ñ', montoCentavos: i })));
    expect(grande.length).toBeGreaterThan(700_000);
    const sobre = await cifrar(grande, 'clave segura');
    expect(await descifrar(sobre, 'clave segura')).toBe(grande);
  });

  it('rechaza una contraseña incorrecta', async () => {
    const sobre = await cifrar('secreto', 'una');
    await expect(descifrar(sobre, 'otra')).rejects.toThrow('La contraseña no es correcta');
  });

  it('reconoce lo que no es un sobre', () => {
    expect(esSobre({ app: 'mis-finanzas', version: 3 })).toBe(false);
    expect(esSobre(null)).toBe(false);
  });
});
