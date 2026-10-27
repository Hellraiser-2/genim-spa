import Anthropic from '@anthropic-ai/sdk';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConsultaAsesorRequest, EstadoAsesor, FuenteAsesor, MensajeAsesor, Recomendaciones, RespuestaAsesor } from '@rockstar/contracts';

import { ErrorDeNegocio, cuerpoComo, exigir, texto } from '../comun/errores.js';
import { CONFIGURACION, type Configuracion } from '../config.js';
import { BaseDeDatos } from '../db/base-de-datos.js';
import { PopularidadService } from './popularidad.service.js';
import { recomendar } from './recomendaciones.js';
import { resumenDeNegocio } from './resumen.js';

const MODELO = 'claude-opus-5-5';
const MAXIMO_MENSAJES = 40;
const LARGO_MAXIMO_MENSAJE = 4000;
/** Búsquedas en internet que el asesor puede hacer por consulta; cada una se cobra aparte. */
const MAXIMO_BUSQUEDAS = 6;
/** Veces que se retoma un turno que el servicio pausó por largo, antes de responder con lo que haya. */
const MAXIMO_REANUDACIONES = 3;

const INSTRUCCIONES = `Eres el asesor de inversión de Rockstar, una tienda chilena de ropa de rock y metal (poleras, polerones, chaquetas, pantalones y accesorios) que vende por su tienda web y en su local. Conversas con el Gerente, que decide en qué bandas y en qué tipos de producto poner el presupuesto de compra. Tu trabajo es ayudarle a decidir bien, no venderle una idea.

Cuentas con dos fuentes y las mejores recomendaciones salen de cruzarlas:

1. Los datos de la tienda, que recibes en <datos_tienda> y están al día: los productos con su banda y categoría, precio, oferta del mes, stock, tallas agotadas, unidades vendidas e ingresos, y las bandas con concierto registrado en Chile. Son los únicos datos internos que existen. No cites cifras de la tienda que no estén ahí, y cuando un dato falte (por ejemplo un costo sin registrar, que impide conocer el margen) dilo en vez de suponerlo.

2. La búsqueda en internet, para saber qué bandas pasan por un buen momento: popularidad actual, discos o giras nuevas, aniversarios, y sobre todo conciertos y festivales anunciados en Chile, que es cuando más se vende merchandising de una banda. Busca información reciente, porque lo que sabes de memoria puede estar desactualizado, y prefiere medios de música y ticketeras por sobre foros.

Al recomendar:
- Sé concreto y prioriza: qué banda, qué tipo de producto y por qué, apoyado en un dato de la tienda, en algo que encontraste, o en ambos. Di también en qué no conviene invertir.
- La tienda es nueva y puede tener pocas ventas registradas. Cuando sea así, dilo con claridad y apóyate más en lo que pasa afuera; dos o tres ventas no son una tendencia.
- Puedes proponer bandas o tipos de producto que la tienda aún no vende, si lo que encontraste lo justifica.
- No conoces el presupuesto ni las condiciones de los proveedores. Si la respuesta depende de eso, pregúntalo.
- Distingue lo que es un hecho de lo que es tu opinión, y recuerda que las fechas de conciertos pueden cambiar.

La pantalla donde se muestra tu respuesta solo sabe mostrar texto plano. Escribe en español de Chile, sin Markdown: sin asteriscos, almohadillas ni tablas. Usa párrafos cortos y, para enumerar, líneas que empiecen con un guion. Que la respuesta se lea en un par de minutos.`;

/** Herramienta de búsqueda que ejecuta el propio servicio de IA; aquí solo se declara. */
const BUSQUEDA_WEB: Anthropic.Beta.BetaWebSearchTool20260209 = {
  type: 'web_search_20260209',
  name: 'web_search',
  max_uses: MAXIMO_BUSQUEDAS,
  user_location: { type: 'approximate', country: 'CL', city: 'Santiago', timezone: 'America/Santiago' },
};

const noDisponible = (mensaje: string) => new ErrorDeNegocio(503, 'ASESOR_NO_DISPONIBLE', mensaje);

/**
 * Asesor de inversión del Gerente, en dos formas que parten del mismo resumen del negocio.
 * Las recomendaciones se calculan con reglas y la popularidad de las bandas en Deezer: no
 * cuestan nada y siempre están disponibles. El chat es opcional: con una credencial del
 * servicio de IA, entrega el resumen a Claude junto con la conversación, y Claude busca en
 * internet lo que necesite. Nada de la conversación se guarda en el servicio.
 */
@Injectable()
export class AsesorService {
  private readonly log = new Logger('Asesor');
  /** Se crea solo si hay credencial: el SDK la lee del entorno (`ANTHROPIC_API_KEY`). */
  private readonly cliente: Anthropic | null;

  constructor(
    private readonly db: BaseDeDatos,
    private readonly popularidad: PopularidadService,
    @Inject(CONFIGURACION) configuracion: Configuracion,
  ) {
    this.cliente = configuracion.asesorConfigurado ? new Anthropic() : null;
  }

  async recomendaciones(): Promise<Recomendaciones> {
    const resumen = await resumenDeNegocio(this.db);
    return recomendar(resumen, await this.popularidad.consultar(resumen.porBanda.map((banda) => banda.nombre)));
  }

  estado(): EstadoAsesor {
    return { configurado: this.cliente !== null };
  }

  async consultar(cuerpo: unknown): Promise<RespuestaAsesor> {
    const conversacion = this.conversacionValida(cuerpoComo<ConsultaAsesorRequest>(cuerpo).mensajes);
    if (this.cliente === null) {
      throw new ErrorDeNegocio(503, 'ASESOR_NO_CONFIGURADO', 'El asesor aún no está configurado: falta la clave del servicio de IA (ANTHROPIC_API_KEY).');
    }
    const datos = JSON.stringify(await resumenDeNegocio(this.db));
    try {
      return await this.preguntar(this.cliente, datos, conversacion);
    } catch (error) {
      throw this.traducir(error);
    }
  }

  private conversacionValida(mensajes: unknown): MensajeAsesor[] {
    exigir(Array.isArray(mensajes) && mensajes.length > 0, 'Falta la pregunta para el asesor.');
    exigir(mensajes.length <= MAXIMO_MENSAJES, 'La conversación es demasiado larga. Comienza una nueva.');
    const conversacion = (mensajes as Partial<MensajeAsesor>[]).map((mensaje) => {
      exigir(
        typeof mensaje === 'object' && mensaje !== null && (mensaje.rol === 'usuario' || mensaje.rol === 'asesor') && texto(mensaje.texto) !== '',
        'Cada mensaje necesita quién lo dijo y su texto.',
      );
      exigir(texto(mensaje.texto).length <= LARGO_MAXIMO_MENSAJE, `Cada mensaje puede tener hasta ${LARGO_MAXIMO_MENSAJE} caracteres.`);
      return { rol: mensaje.rol, texto: texto(mensaje.texto) };
    });
    exigir(conversacion[0]!.rol === 'usuario' && conversacion.at(-1)!.rol === 'usuario', 'La conversación debe empezar y terminar con un mensaje del usuario.');
    return conversacion;
  }

  private async preguntar(cliente: Anthropic, datos: string, conversacion: MensajeAsesor[]): Promise<RespuestaAsesor> {
    const mensajes: Anthropic.Beta.BetaMessageParam[] = conversacion.map((mensaje) => ({
      role: mensaje.rol === 'usuario' ? 'user' : 'assistant',
      content: mensaje.texto,
    }));
    let respuesta = '';
    const fuentes = new Map<string, FuenteAsesor>();

    for (let vuelta = 0; ; vuelta++) {
      // Con búsquedas de por medio la respuesta puede tardar más de un minuto: se recibe por flujo para no agotar la espera.
      const mensaje = await cliente.beta.messages
        .stream({
          model: MODELO,
          max_tokens: 64000,
          // Si el modelo declina la consulta, el servicio la reintenta en el modelo que recomienda para ese caso.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          thinking: { type: 'adaptive' },
          output_config: { effort: 'medium' },
          // Las instrucciones van primero y no cambian: así el servicio puede reutilizarlas entre consultas.
          cache_control: { type: 'ephemeral' },
          system: [
            { type: 'text', text: INSTRUCCIONES },
            { type: 'text', text: `<datos_tienda>\n${datos}\n</datos_tienda>` },
          ],
          tools: [BUSQUEDA_WEB],
          messages: mensajes,
        })
        .finalMessage();

      if (mensaje.stop_reason === 'refusal') {
        throw noDisponible('El asesor no puede responder esa consulta. Prueba a plantearla de otra forma.');
      }
      for (const bloque of mensaje.content) {
        if (bloque.type !== 'text') {
          continue;
        }
        respuesta += bloque.text;
        for (const cita of bloque.citations ?? []) {
          if (cita.type === 'web_search_result_location' && /^https?:\/\//i.test(cita.url)) {
            fuentes.set(cita.url, { titulo: cita.title?.trim() || cita.url, url: cita.url });
          }
        }
      }
      if (mensaje.stop_reason !== 'pause_turn' || vuelta >= MAXIMO_REANUDACIONES) {
        break;
      }
      // El servicio pausó un turno largo: se le devuelve lo que lleva y continúa desde ahí, sin un mensaje nuevo.
      mensajes.push({ role: 'assistant', content: mensaje.content });
    }

    if (respuesta.trim() === '') {
      throw noDisponible('El asesor no entregó una respuesta. Intenta de nuevo.');
    }
    return { texto: respuesta.trim(), fuentes: [...fuentes.values()] };
  }

  /** Convierte una falla del servicio de IA en un error que el Gerente pueda entender y resolver. */
  private traducir(error: unknown): unknown {
    if (error instanceof ErrorDeNegocio || !(error instanceof Anthropic.APIError)) {
      return error;
    }
    this.log.error(`El servicio de IA respondió ${error.status ?? 'sin conexión'}: ${error.message}`);
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      return new ErrorDeNegocio(503, 'ASESOR_NO_CONFIGURADO', 'La clave del servicio de IA no es válida o no tiene permiso. Revisa ANTHROPIC_API_KEY.');
    }
    if (error instanceof Anthropic.RateLimitError) {
      return noDisponible('El servicio de IA alcanzó su límite de uso. Intenta de nuevo en unos minutos.');
    }
    if (error instanceof Anthropic.APIConnectionError) {
      return noDisponible('No se pudo conectar con el servicio de IA. Revisa la conexión a internet e intenta de nuevo.');
    }
    if (error.type === 'billing_error') {
      return noDisponible('La cuenta del servicio de IA no tiene saldo. Hay que cargarle crédito para usar el asesor.');
    }
    return noDisponible('El servicio de IA no pudo responder. Intenta de nuevo en un momento.');
  }
}
