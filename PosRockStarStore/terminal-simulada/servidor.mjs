// Maquina de cobro simulada: hace de terminal de tarjetas en la red de la tienda mientras
// no haya una real. El POS le envia el monto y consulta el resultado; la "pantalla" de la
// maquina (GET /) se abre en un celular o en otra pestana para aprobar o rechazar el pago.
//
// Protocolo (JSON, CORS abierto para que el navegador del POS llegue directo):
//   GET  /api/estado                 nombre, modelo y serie de la maquina
//   POST /api/cobros                 { monto, tipo: DEBITO|CREDITO, referencia } -> cobro PENDIENTE
//   GET  /api/cobros/:id             estado del cobro
//   POST /api/cobros/:id/cancelar    la caja desiste antes de que se pague
//   POST /api/cobros/:id/anular      reversa un cobro ya aprobado
// Solo de la pantalla simulada:
//   GET  /api/cobros/actual          el cobro esperando tarjeta, o null
//   POST /api/cobros/:id/aprobar     simula pasar la tarjeta
//   POST /api/cobros/:id/rechazar    { motivo }
//
// Variables: PUERTO (8090), APROBAR_AUTOMATICO_MS (0 = se aprueba desde la pantalla),
// EXPIRA_MS (120000: un cobro sin pagar se cancela solo).

import { createServer } from 'node:http';
import { randomInt, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const MAQUINA = { nombre: 'Máquina de cobro simulada', modelo: 'SIM-POS 1', serie: 'SIM-0001' };

export function crearServidor({ aprobarAutomaticoMs = 0, expiraMs = 120_000 } = {}) {
  /** @type {Map<string, any>} */
  const cobros = new Map();
  let actual = null;

  const resolver = (cobro, cambios) => {
    Object.assign(cobro, cambios, { resueltoEn: new Date().toISOString() });
    if (actual === cobro.id) actual = null;
    return cobro;
  };

  const vigente = (cobro) => {
    if (cobro.estado === 'PENDIENTE' && Date.now() - Date.parse(cobro.creadoEn) > expiraMs) {
      resolver(cobro, { estado: 'CANCELADO', motivo: 'Tiempo agotado en la máquina' });
    }
    return cobro;
  };

  const aprobar = (cobro) =>
    resolver(cobro, {
      estado: 'APROBADO',
      codigoAutorizacion: String(randomInt(0, 1_000_000)).padStart(6, '0'),
      tarjeta: `•••• ${String(randomInt(0, 10_000)).padStart(4, '0')}`,
    });

  const rutas = [
    ['GET', /^\/api\/estado$/, () => [200, { ...MAQUINA, cobroEnCurso: actual }]],

    ['GET', /^\/api\/cobros\/actual$/, () => [200, actual ? vigente(cobros.get(actual)) : null]],

    ['POST', /^\/api\/cobros$/, (_m, cuerpo) => {
      const { monto, tipo, referencia } = cuerpo ?? {};
      if (!Number.isInteger(monto) || monto <= 0) return [400, { codigo: 'DATOS_INVALIDOS', mensaje: 'El monto debe ser un entero positivo.' }];
      if (tipo !== 'DEBITO' && tipo !== 'CREDITO') return [400, { codigo: 'DATOS_INVALIDOS', mensaje: 'El tipo debe ser DEBITO o CREDITO.' }];
      if (actual && vigente(cobros.get(actual)).estado === 'PENDIENTE') {
        return [409, { codigo: 'OCUPADA', mensaje: 'La máquina tiene otro cobro en curso.' }];
      }
      const cobro = {
        id: randomUUID(),
        monto,
        tipo,
        referencia: typeof referencia === 'string' ? referencia : null,
        estado: 'PENDIENTE',
        codigoAutorizacion: null,
        tarjeta: null,
        motivo: null,
        creadoEn: new Date().toISOString(),
        resueltoEn: null,
      };
      cobros.set(cobro.id, cobro);
      actual = cobro.id;
      if (aprobarAutomaticoMs > 0) {
        setTimeout(() => cobro.estado === 'PENDIENTE' && aprobar(cobro), aprobarAutomaticoMs).unref();
      }
      return [201, cobro];
    }],

    ['GET', /^\/api\/cobros\/([\w-]+)$/, ([, id]) => {
      const cobro = cobros.get(id);
      return cobro ? [200, vigente(cobro)] : [404, { codigo: 'NO_ENCONTRADO', mensaje: 'El cobro no existe.' }];
    }],

    ['POST', /^\/api\/cobros\/([\w-]+)\/(cancelar|anular|aprobar|rechazar)$/, ([, id, accion], cuerpo) => {
      const cobro = cobros.get(id);
      if (!cobro) return [404, { codigo: 'NO_ENCONTRADO', mensaje: 'El cobro no existe.' }];
      vigente(cobro);
      const desde = { cancelar: 'PENDIENTE', aprobar: 'PENDIENTE', rechazar: 'PENDIENTE', anular: 'APROBADO' }[accion];
      // Repetir una anulacion o cancelacion ya hecha responde lo mismo: la caja puede reintentar.
      if ((accion === 'anular' && cobro.estado === 'ANULADO') || (accion === 'cancelar' && cobro.estado === 'CANCELADO')) {
        return [200, cobro];
      }
      if (cobro.estado !== desde) {
        return [409, { codigo: 'ESTADO_INVALIDO', mensaje: `El cobro está ${cobro.estado.toLowerCase()}.`, detalle: cobro }];
      }
      if (accion === 'aprobar') return [200, aprobar(cobro)];
      if (accion === 'rechazar') {
        const motivo = typeof cuerpo?.motivo === 'string' && cuerpo.motivo.trim() ? cuerpo.motivo.trim() : 'Rechazada por el emisor';
        return [200, resolver(cobro, { estado: 'RECHAZADO', motivo })];
      }
      if (accion === 'cancelar') return [200, resolver(cobro, { estado: 'CANCELADO', motivo: 'Cancelado desde la caja' })];
      return [200, resolver(cobro, { estado: 'ANULADO', motivo: 'Anulado desde la caja' })];
    }],
  ];

  return createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    // El POS puede abrirse desde localhost y llamar a la maquina por su IP de la red.
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    if (req.method === 'OPTIONS') return res.writeHead(204).end();

    const ruta = new URL(req.url ?? '/', 'http://maquina').pathname;
    if (req.method === 'GET' && (ruta === '/' || ruta === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      return res.end(PANTALLA);
    }

    let cuerpo = null;
    if (req.method === 'POST') {
      let texto = '';
      for await (const parte of req) texto += parte;
      try {
        cuerpo = texto ? JSON.parse(texto) : null;
      } catch {
        return enviar(res, 400, { codigo: 'DATOS_INVALIDOS', mensaje: 'El cuerpo no es JSON.' });
      }
    }
    for (const [metodo, patron, manejar] of rutas) {
      const calce = req.method === metodo && ruta.match(patron);
      if (calce) return enviar(res, ...manejar(calce, cuerpo));
    }
    enviar(res, 404, { codigo: 'NO_ENCONTRADO', mensaje: 'Ruta desconocida.' });
  });
}

function enviar(res, estado, cuerpo) {
  res.writeHead(estado, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(cuerpo));
}

const PANTALLA = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Máquina de cobro</title>
<style>
  :root { color-scheme: dark; --fondo: #0b0b0c; --panel: #18181b; --borde: #3f3f46; --texto: #fafafa; --suave: #a1a1aa; --ok: #16a34a; --mal: #dc2626; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--fondo); color: var(--texto); font-family: system-ui, sans-serif; padding: 16px; }
  .maquina { width: 100%; max-width: 380px; background: var(--panel); border: 1px solid var(--borde); border-radius: 24px; padding: 24px; text-align: center; }
  .marca { font-size: 12px; letter-spacing: .2em; text-transform: uppercase; color: var(--suave); }
  .pantalla { margin: 16px 0; padding: 24px 16px; border-radius: 16px; background: #000; min-height: 170px; display: grid; place-content: center; gap: 8px; }
  .monto { font-size: 40px; font-weight: 800; font-variant-numeric: tabular-nums; }
  .tipo, .nota { color: var(--suave); }
  .resultado { font-size: 22px; font-weight: 800; }
  .ok { color: var(--ok); } .mal { color: var(--mal); }
  button, select { width: 100%; font: inherit; border-radius: 12px; padding: 14px; border: 1px solid var(--borde); }
  button { font-weight: 700; cursor: pointer; color: #fff; margin-top: 10px; }
  .aprobar { background: var(--ok); border-color: var(--ok); }
  .rechazar { background: transparent; color: var(--mal); border-color: var(--mal); }
  select { background: #000; color: var(--texto); margin-top: 10px; }
  [hidden] { display: none !important; }
</style>
</head>
<body>
<main class="maquina">
  <div class="marca">Máquina de cobro · simulada</div>
  <div class="pantalla" aria-live="polite">
    <div id="espera" class="nota">Esperando un cobro desde la caja…</div>
    <div id="cobro" hidden>
      <div class="tipo" id="tipo"></div>
      <div class="monto" id="monto"></div>
      <div class="nota">Acerque, inserte o deslice la tarjeta</div>
    </div>
    <div id="fin" hidden><div class="resultado" id="resultado"></div><div class="nota" id="detalle"></div></div>
  </div>
  <div id="acciones" hidden>
    <button class="aprobar" id="btn-aprobar">Pasar tarjeta (aprobar)</button>
    <select id="motivo" aria-label="Motivo del rechazo">
      <option>Fondos insuficientes</option>
      <option>Tarjeta bloqueada</option>
      <option>Clave incorrecta</option>
      <option>Rechazada por el emisor</option>
    </select>
    <button class="rechazar" id="btn-rechazar">Rechazar</button>
  </div>
</main>
<script>
  const $ = (id) => document.getElementById(id);
  const clp = (n) => '$' + n.toLocaleString('es-CL');
  let actual = null;
  let ultimo = null;
  async function post(ruta, cuerpo) {
    await fetch(ruta, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo || {}) });
    refrescar();
  }
  function mostrarFin(cobro) {
    const ok = cobro.estado === 'APROBADO';
    $('resultado').textContent = ok ? 'APROBADO' : cobro.estado;
    $('resultado').className = 'resultado ' + (ok ? 'ok' : 'mal');
    $('detalle').textContent = ok ? clp(cobro.monto) + ' · Autorización ' + cobro.codigoAutorizacion + ' · ' + cobro.tarjeta : (cobro.motivo || '');
  }
  async function refrescar() {
    try {
      const cobro = await (await fetch('/api/cobros/actual', { cache: 'no-store' })).json();
      if (cobro && cobro.estado === 'PENDIENTE') {
        actual = cobro;
        $('tipo').textContent = cobro.tipo === 'CREDITO' ? 'Crédito' : 'Débito';
        $('monto').textContent = clp(cobro.monto);
      } else if (actual) {
        ultimo = await (await fetch('/api/cobros/' + actual.id, { cache: 'no-store' })).json();
        actual = null;
      }
    } catch { /* la maquina sigue intentando */ }
    $('espera').hidden = !!actual || !!ultimo;
    $('cobro').hidden = !actual;
    $('acciones').hidden = !actual;
    $('fin').hidden = !!actual || !ultimo;
    if (!actual && ultimo) mostrarFin(ultimo);
  }
  $('btn-aprobar').onclick = () => actual && post('/api/cobros/' + actual.id + '/aprobar');
  $('btn-rechazar').onclick = () => actual && post('/api/cobros/' + actual.id + '/rechazar', { motivo: $('motivo').value });
  setInterval(refrescar, 1000);
  refrescar();
</script>
</body>
</html>`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const puerto = Number(process.env.PUERTO ?? 8090);
  crearServidor({
    aprobarAutomaticoMs: Number(process.env.APROBAR_AUTOMATICO_MS ?? 0),
    expiraMs: Number(process.env.EXPIRA_MS ?? 120_000),
  }).listen(puerto, () => console.log(`Máquina de cobro simulada en el puerto ${puerto}`));
  for (const senal of ['SIGINT', 'SIGTERM']) process.on(senal, () => process.exit(0));
}
