// npm run test.terminal
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { crearServidor } from './servidor.mjs';

let servidor;
let base;

before(async () => {
  servidor = crearServidor({ expiraMs: 60_000 });
  await new Promise((listo) => servidor.listen(0, listo));
  base = `http://127.0.0.1:${servidor.address().port}`;
});

after(() => servidor.close());

const pedir = async (metodo, ruta, cuerpo) => {
  const res = await fetch(base + ruta, {
    method: metodo,
    headers: cuerpo ? { 'Content-Type': 'application/json' } : undefined,
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  return { estado: res.status, cuerpo: res.status === 204 ? null : await res.json(), cors: res.headers.get('access-control-allow-origin') };
};

test('informa la maquina y permite llamadas desde otro origen', async () => {
  const { estado, cuerpo, cors } = await pedir('GET', '/api/estado');
  assert.equal(estado, 200);
  assert.equal(cuerpo.modelo, 'SIM-POS 1');
  assert.equal(cors, '*');
});

test('un cobro aprobado trae autorizacion y tarjeta, y luego se puede anular', async () => {
  const creado = await pedir('POST', '/api/cobros', { monto: 15990, tipo: 'DEBITO', referencia: 'clave-1' });
  assert.equal(creado.estado, 201);
  assert.equal(creado.cuerpo.estado, 'PENDIENTE');

  const ocupado = await pedir('POST', '/api/cobros', { monto: 1000, tipo: 'CREDITO' });
  assert.equal(ocupado.estado, 409);
  assert.equal(ocupado.cuerpo.codigo, 'OCUPADA');

  const actual = await pedir('GET', '/api/cobros/actual');
  assert.equal(actual.cuerpo.id, creado.cuerpo.id);

  const aprobado = await pedir('POST', `/api/cobros/${creado.cuerpo.id}/aprobar`);
  assert.equal(aprobado.cuerpo.estado, 'APROBADO');
  assert.match(aprobado.cuerpo.codigoAutorizacion, /^\d{6}$/);
  assert.match(aprobado.cuerpo.tarjeta, /^•••• \d{4}$/);

  // Ya aprobado no se puede cancelar: hay que anular.
  const cancelar = await pedir('POST', `/api/cobros/${creado.cuerpo.id}/cancelar`);
  assert.equal(cancelar.estado, 409);
  assert.equal(cancelar.cuerpo.detalle.estado, 'APROBADO');

  const anulado = await pedir('POST', `/api/cobros/${creado.cuerpo.id}/anular`);
  assert.equal(anulado.cuerpo.estado, 'ANULADO');
  const otraVez = await pedir('POST', `/api/cobros/${creado.cuerpo.id}/anular`);
  assert.equal(otraVez.estado, 200);
});

test('rechazo con motivo y cancelacion desde la caja', async () => {
  const uno = await pedir('POST', '/api/cobros', { monto: 5000, tipo: 'CREDITO' });
  const rechazado = await pedir('POST', `/api/cobros/${uno.cuerpo.id}/rechazar`, { motivo: 'Fondos insuficientes' });
  assert.equal(rechazado.cuerpo.estado, 'RECHAZADO');
  assert.equal(rechazado.cuerpo.motivo, 'Fondos insuficientes');

  const dos = await pedir('POST', '/api/cobros', { monto: 5000, tipo: 'CREDITO' });
  const cancelado = await pedir('POST', `/api/cobros/${dos.cuerpo.id}/cancelar`);
  assert.equal(cancelado.cuerpo.estado, 'CANCELADO');
  assert.equal((await pedir('GET', '/api/cobros/actual')).cuerpo, null);
});

test('valida el monto y el tipo', async () => {
  assert.equal((await pedir('POST', '/api/cobros', { monto: 0, tipo: 'DEBITO' })).estado, 400);
  assert.equal((await pedir('POST', '/api/cobros', { monto: 10.5, tipo: 'DEBITO' })).estado, 400);
  assert.equal((await pedir('POST', '/api/cobros', { monto: 100, tipo: 'CHEQUE' })).estado, 400);
});

test('un cobro sin pagar expira', async () => {
  const corto = crearServidor({ expiraMs: 50 });
  await new Promise((listo) => corto.listen(0, listo));
  const url = `http://127.0.0.1:${corto.address().port}`;
  try {
    const { id } = await (await fetch(`${url}/api/cobros`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monto: 100, tipo: 'DEBITO' }),
    })).json();
    await new Promise((r) => setTimeout(r, 80));
    const cobro = await (await fetch(`${url}/api/cobros/${id}`)).json();
    assert.equal(cobro.estado, 'CANCELADO');
    assert.equal(cobro.motivo, 'Tiempo agotado en la máquina');
  } finally {
    corto.close();
  }
});

test('la pantalla de la maquina se sirve en la raiz', async () => {
  const res = await fetch(base + '/');
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Máquina de cobro/);
});
