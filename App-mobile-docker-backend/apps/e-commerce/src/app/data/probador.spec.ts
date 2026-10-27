import { describe, expect, it } from 'vitest';

import {
  MEDIDAS_EJEMPLO,
  colorDePrenda,
  estimarCuerpo,
  evaluarAjuste,
  medidasDeTalla,
  recomendarTalla,
  reescalarMedidas,
  tablaDeTallas,
  tipoDePrenda,
  validarMedidas,
} from './probador';

describe('validarMedidas', () => {
  it('acepta medidas dentro de rango', () => {
    expect(validarMedidas({ altura: 175, peso: 78 })).toBeNull();
    expect(validarMedidas({ altura: 140, peso: 35 })).toBeNull();
    expect(validarMedidas({ altura: 210, peso: 180 })).toBeNull();
  });

  it('rechaza alturas y pesos fuera de rango o vacíos', () => {
    expect(validarMedidas({ altura: 139, peso: 70 })).toContain('altura');
    expect(validarMedidas({ altura: 211, peso: 70 })).toContain('altura');
    expect(validarMedidas({ altura: 170, peso: 34 })).toContain('peso');
    expect(validarMedidas({ altura: 170, peso: Number.NaN })).toContain('peso');
  });

  it('acepta pecho, cintura y cadera vacíos o en rango, y rechaza los fuera de rango', () => {
    expect(validarMedidas(MEDIDAS_EJEMPLO)).toBeNull();
    expect(validarMedidas({ altura: 175, peso: 78, pecho: null, cintura: undefined })).toBeNull();
    expect(validarMedidas({ altura: 175, peso: 78, pecho: 30 })).toContain('pecho');
    expect(validarMedidas({ altura: 175, peso: 78, cintura: 200 })).toContain('cintura');
    expect(validarMedidas({ altura: 175, peso: 78, cadera: Number.NaN })).toContain('cadera');
  });
});

describe('estimarCuerpo', () => {
  it('estima medidas plausibles para un cuerpo promedio', () => {
    const cuerpo = estimarCuerpo({ altura: 175, peso: 78 });
    expect(cuerpo.imc).toBeCloseTo(25.5, 1);
    expect(cuerpo.pecho).toBeGreaterThan(95);
    expect(cuerpo.pecho).toBeLessThan(104);
    expect(cuerpo.cintura).toBeGreaterThan(82);
    expect(cuerpo.cintura).toBeLessThan(92);
  });

  it('usa las medidas que da el cliente y estima solo las que faltan', () => {
    const cuerpo = estimarCuerpo(MEDIDAS_EJEMPLO);
    expect(cuerpo).toMatchObject({ altura: 175, pecho: 100, cintura: 86, cadera: 98, complexion: 'media' });
    const parcial = estimarCuerpo({ altura: 175, peso: 78, pecho: 108 });
    expect(parcial.pecho).toBe(108);
    expect(parcial.cintura).toBe(estimarCuerpo({ altura: 175, peso: 78 }).cintura);
  });

  it('la contextura agranda o achica los contornos estimados, no los dados', () => {
    const media = estimarCuerpo({ altura: 175, peso: 78 });
    const robusta = estimarCuerpo({ altura: 175, peso: 78, complexion: 'robusta' });
    const delgada = estimarCuerpo({ altura: 175, peso: 78, complexion: 'delgada' });
    expect(media.complexion).toBe('media');
    expect(robusta.pecho).toBeGreaterThan(media.pecho);
    expect(delgada.cintura).toBeLessThan(media.cintura);
    expect(estimarCuerpo({ altura: 175, peso: 78, pecho: 100, complexion: 'robusta' }).pecho).toBe(100);
  });

  it('en el cuerpo femenino estima menos cintura y más cadera, sin tocar los contornos dados', () => {
    const masculino = estimarCuerpo({ altura: 165, peso: 60 });
    const femenino = estimarCuerpo({ altura: 165, peso: 60, sexo: 'femenino' });
    expect(masculino.sexo).toBe('masculino');
    expect(femenino.cintura).toBeLessThan(masculino.cintura);
    expect(femenino.cadera).toBeGreaterThan(masculino.cadera);
    expect(femenino.pecho).toBe(masculino.pecho);
    expect(estimarCuerpo({ altura: 165, peso: 60, cintura: 80, sexo: 'femenino' }).cintura).toBe(80);
  });

  it('una medida incoherente con la altura y el peso se lleva al límite y queda anotada', () => {
    const cuerpo = estimarCuerpo({ altura: 180, peso: 180, cintura: 50 });
    const sinCintura = estimarCuerpo({ altura: 180, peso: 180 });
    expect(cuerpo.cintura).toBeGreaterThan(100);
    expect(cuerpo.cintura).toBeLessThan(sinCintura.cintura);
    expect(cuerpo.ajustadas).toEqual([{ medida: 'cintura', ingresada: 50, usada: cuerpo.cintura }]);

    const delgado = estimarCuerpo({ altura: 150, peso: 40, pecho: 140 });
    expect(delgado.pecho).toBeLessThan(110);
    expect(delgado.ajustadas.map((a) => a.medida)).toEqual(['pecho']);
  });

  it('las medidas coherentes se usan tal cual, sin avisos', () => {
    expect(estimarCuerpo(MEDIDAS_EJEMPLO).ajustadas).toEqual([]);
    expect(estimarCuerpo({ altura: 175, peso: 78, cintura: 72 }).cintura).toBe(72);
    expect(estimarCuerpo({ altura: 175, peso: 78, pecho: 118 }).pecho).toBe(118);
    expect(estimarCuerpo({ altura: 175, peso: 78 }).ajustadas).toEqual([]);
  });

  it('la cintura no supera demasiado a la cadera ni al pecho', () => {
    const cuerpo = estimarCuerpo({ altura: 170, peso: 95, pecho: 100, cadera: 100, cintura: 125 });
    expect(cuerpo.cintura).toBeLessThanOrEqual(115);
    expect(cuerpo.ajustadas.map((a) => a.medida)).toEqual(['cintura']);
  });

  it('en los extremos de altura y peso todas las medidas quedan en un cuerpo posible', () => {
    for (const [altura, peso] of [[140, 35], [140, 180], [210, 35], [210, 180]] as const) {
      for (const valor of [50, 160]) {
        const c = estimarCuerpo({ altura, peso, pecho: valor, cintura: valor, cadera: valor });
        expect(c.cintura).toBeLessThanOrEqual(Math.min(c.cadera, c.pecho) * 1.15 + 0.1);
        for (const m of ['pecho', 'cintura', 'cadera'] as const) {
          const estimado = estimarCuerpo({ altura, peso })[m];
          expect(c[m] / estimado).toBeGreaterThan(0.65);
          expect(c[m] / estimado).toBeLessThan(1.35);
        }
      }
    }
  });

  it('a igual altura, más peso da contornos mayores, y la cintura crece más que el pecho', () => {
    const delgado = estimarCuerpo({ altura: 175, peso: 60 });
    const grueso = estimarCuerpo({ altura: 175, peso: 100 });
    expect(grueso.pecho).toBeGreaterThan(delgado.pecho);
    expect(grueso.cintura / delgado.cintura).toBeGreaterThan(grueso.pecho / delgado.pecho);
  });
});

describe('reescalarMedidas', () => {
  it('al subir de peso, la cadera escrita crece como la estimada; pecho y cintura quedan fijos', () => {
    const despues = reescalarMedidas(MEDIDAS_EJEMPLO, { altura: 175, peso: 98 });
    expect(despues.peso).toBe(98);
    expect(despues.cadera!).toBeGreaterThan(98);
    expect(despues).toMatchObject({ pecho: 100, cintura: 86 });
  });

  it('al bajar de peso la cadera baja, y volver al peso inicial la deja como estaba', () => {
    const menos = reescalarMedidas(MEDIDAS_EJEMPLO, { altura: 175, peso: 60 });
    expect(menos.cadera!).toBeLessThan(98);
    expect(reescalarMedidas(MEDIDAS_EJEMPLO, { altura: 175, peso: 78 })).toMatchObject({ pecho: 100, cintura: 86, cadera: 98 });
  });

  it('las medidas vacías siguen vacías y un peso fuera de rango no las toca', () => {
    expect(reescalarMedidas({ altura: 175, peso: 78, cadera: 98 }, { altura: 175, peso: 90 }).pecho).toBeUndefined();
    expect(reescalarMedidas(MEDIDAS_EJEMPLO, { altura: 175, peso: 5 })).toMatchObject({ peso: 5, pecho: 100, cintura: 86 });
  });
});

describe('tipoDePrenda', () => {
  it('reconoce las categorías de la tienda, con o sin tildes', () => {
    expect(tipoDePrenda('Poleras')).toBe('polera');
    expect(tipoDePrenda('Polerones')).toBe('poleron');
    expect(tipoDePrenda('Polerón')).toBe('poleron');
    expect(tipoDePrenda('Chaquetas')).toBe('chaqueta');
    expect(tipoDePrenda('Pantalones')).toBe('pantalon');
    expect(tipoDePrenda('Cinturones')).toBe('cinturon');
  });

  it('una polera es de manga larga si lo dice su categoría o su nombre', () => {
    expect(tipoDePrenda('Poleras', 'Polera Calavera')).toBe('polera');
    expect(tipoDePrenda('Poleras', 'Polera manga larga Iron Maiden')).toBe('polera_manga_larga');
    expect(tipoDePrenda('Poleras manga larga')).toBe('polera_manga_larga');
    expect(tipoDePrenda('Polerones', 'Polerón manga larga')).toBe('poleron');
  });

  it('devuelve null para categorías sin tabla de medidas', () => {
    expect(tipoDePrenda('Accesorios')).toBeNull();
    expect(tipoDePrenda('Vinilos')).toBeNull();
  });
});

describe('tablaDeTallas', () => {
  it('ordena las tallas de menor a mayor sin huecos entre rangos', () => {
    for (const tipo of ['polera', 'pantalon'] as const) {
      const tabla = tablaDeTallas(tipo);
      for (let i = 1; i < tabla.length; i++) {
        expect(tabla[i]!.desde).toBe(tabla[i - 1]!.hasta);
      }
    }
  });

  it('da más holgura a un polerón que a una polera de la misma talla', () => {
    expect(medidasDeTalla('poleron', 'M')!.contornoPrenda).toBeGreaterThan(medidasDeTalla('polera', 'M')!.contornoPrenda);
  });

  it('encuentra la talla única aunque venga sin tilde o en mayúsculas', () => {
    expect(medidasDeTalla('cinturon', 'UNICA')?.talla).toBe('Única');
    expect(medidasDeTalla('polera', 'm')?.talla).toBe('M');
    expect(medidasDeTalla('polera', '42')).toBeNull();
  });
});

describe('medidas reales de las prendas', () => {
  it('el contorno es el doble del ancho medido en la prenda estirada', () => {
    expect(medidasDeTalla('polera', 'M')).toMatchObject({ contornoPrenda: 107, largo: 73 });
    expect(medidasDeTalla('polera', 'XXXL')).toMatchObject({ contornoPrenda: 137, largo: 85 });
    expect(medidasDeTalla('poleron', 'L')).toMatchObject({ contornoPrenda: 116, largo: 73, manga: 65 });
  });

  it('la XXL de manga larga se estima con la progresión de las demás tallas', () => {
    expect(medidasDeTalla('polera_manga_larga', 'XL')).toMatchObject({ contornoPrenda: 122, largo: 79, manga: 66 });
    expect(medidasDeTalla('polera_manga_larga', 'XXL')).toMatchObject({ contornoPrenda: 132, largo: 82, manga: 71 });
  });

  it('el pantalón se vende en talla chilena, con su equivalencia americana', () => {
    expect(tablaDeTallas('pantalon').map((t) => `${t.talla}=${t.equivalencia}`)).toEqual(['40=30', '42=32', '44=34', '46=36', '48=38']);
    expect(medidasDeTalla('pantalon', '42')).toMatchObject({ contornoPrenda: 85, cadera: 106, largo: 77 });
  });

  it('chaquetas y cinturones siguen con la tabla genérica', () => {
    expect(tablaDeTallas('chaqueta').map((t) => t.talla)).toEqual(['XS', 'S', 'M', 'L', 'XL', 'XXL']);
    expect(tablaDeTallas('cinturon').map((t) => t.talla)).toEqual(['Única']);
  });
});

describe('evaluarAjuste', () => {
  const promedio = estimarCuerpo({ altura: 175, peso: 78 });

  it('la talla que contiene el contorno queda justa y de largo adecuado', () => {
    expect(evaluarAjuste(promedio, 'polera', 'M')).toMatchObject({ talla: 'M', ancho: 'justa', largo: 'adecuada' });
  });

  it('una talla menor queda apretada y una mucho mayor queda holgada', () => {
    expect(evaluarAjuste(promedio, 'polera', 'S')?.ancho).toBe('apretada');
    expect(evaluarAjuste(promedio, 'polera', 'XL')?.ancho).toBe('holgada');
  });

  it('la holgura es la diferencia entre la prenda y el cuerpo', () => {
    const ajuste = evaluarAjuste(promedio, 'polera', 'M')!;
    expect(ajuste.holgura).toBe(Math.round(medidasDeTalla('polera', 'M')!.contornoPrenda - promedio.pecho));
  });

  it('el largo depende de la altura', () => {
    const alto = estimarCuerpo({ altura: 195, peso: 85 });
    const bajo = estimarCuerpo({ altura: 152, peso: 50 });
    expect(evaluarAjuste(alto, 'polera', 'M')?.largo).toBe('corta');
    expect(evaluarAjuste(bajo, 'polera', 'M')?.largo).toBe('larga');
    expect(evaluarAjuste(alto, 'pantalon', '44')?.largo).toBe('corta');
    expect(evaluarAjuste(bajo, 'pantalon', '40')?.largo).toBe('larga');
  });

  it('un pantalón aprieta si la cadera no cabe, aunque la cintura sí', () => {
    const conCadera = estimarCuerpo({ altura: 175, peso: 78, cintura: 80, cadera: 110 });
    expect(evaluarAjuste(conCadera, 'pantalon', '42')?.ancho).toBe('apretada');
    expect(evaluarAjuste({ ...conCadera, cadera: 98 }, 'pantalon', '42')?.ancho).toBe('justa');
  });

  it('evalúa el largo de manga solo en las prendas con medida de manga', () => {
    const alto = estimarCuerpo({ altura: 195, peso: 85 });
    const bajo = estimarCuerpo({ altura: 155, peso: 52 });
    expect(evaluarAjuste(promedio, 'polera_manga_larga', 'M')?.manga).toBe('adecuada');
    expect(evaluarAjuste(alto, 'polera_manga_larga', 'M')?.manga).toBe('corta');
    expect(evaluarAjuste(bajo, 'polera_manga_larga', 'XL')?.manga).toBe('larga');
    expect(evaluarAjuste(promedio, 'poleron', 'M')?.manga).toBe('adecuada');
    expect(evaluarAjuste(promedio, 'polera', 'M')?.manga).toBeUndefined();
  });

  it('el cinturón de talla única calza siempre en rango', () => {
    expect(evaluarAjuste(promedio, 'cinturon', 'Única')).toMatchObject({ ancho: 'justa', largo: 'adecuada' });
  });

  it('devuelve null para una talla que no existe en el tipo de prenda', () => {
    expect(evaluarAjuste(promedio, 'pantalon', 'M')).toBeNull();
  });
});

describe('recomendarTalla', () => {
  it('recomienda la talla cuyo rango contiene el contorno', () => {
    const promedio = estimarCuerpo({ altura: 175, peso: 78 });
    expect(recomendarTalla(promedio, 'polera')).toBe('M');
    expect(recomendarTalla(promedio, 'pantalon')).toBe('44');
    expect(recomendarTalla(promedio, 'cinturon')).toBe('Única');
  });

  it('fuera de la tabla recomienda la talla del extremo más cercano', () => {
    expect(recomendarTalla(estimarCuerpo({ altura: 150, peso: 38 }), 'polera')).toBe('S');
    expect(recomendarTalla(estimarCuerpo({ altura: 200, peso: 175 }), 'polera')).toBe('XXXL');
  });

  it('la talla recomendada siempre queda justa de ancho', () => {
    for (const peso of [50, 65, 80, 95, 110]) {
      const cuerpo = estimarCuerpo({ altura: 175, peso });
      const talla = recomendarTalla(cuerpo, 'polera');
      const ajuste = evaluarAjuste(cuerpo, 'polera', talla)!;
      const tabla = tablaDeTallas('polera');
      const contorno = cuerpo.pecho;
      const dentroDeTabla = contorno >= tabla[0]!.desde && contorno < tabla[tabla.length - 1]!.hasta;
      if (dentroDeTabla) expect(ajuste.ancho).toBe('justa');
    }
  });
});

describe('colorDePrenda', () => {
  it('traduce el nombre del color, aunque tenga matices', () => {
    expect(colorDePrenda('Negro')).toBe('#1c1c1f');
    expect(colorDePrenda('Azul oscuro')).toBe('#2c4a7a');
    expect(colorDePrenda('Café')).toBe('#5a3b26');
  });

  it('usa un gris oscuro para colores desconocidos', () => {
    expect(colorDePrenda('Tornasol')).toBe('#3a3a40');
  });
});
