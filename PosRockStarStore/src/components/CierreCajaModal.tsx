import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonModal, IonSpinner, IonTitle, IonToolbar } from '@ionic/react';
import { useRef, useState } from 'react';
import { closeCircleOutline, printOutline } from 'ionicons/icons';
import { CajaAbierta, CierreCaja, cerrarCaja, getCajaAbierta } from '../lib/api';
import { formatCLP } from '../utils/format';
import { estadoCuadre } from '../utils/pago';

const FONDO_KEY = 'pos_fondo_caja';

function fondoGuardado(): number | null {
  try {
    const valor = Number(localStorage.getItem(FONDO_KEY));
    return Number.isInteger(valor) && valor >= 0 && localStorage.getItem(FONDO_KEY) !== null ? valor : null;
  } catch {
    return null;
  }
}

const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const pesos = (texto: string) => (texto.trim() === '' ? null : Math.max(0, Math.round(Number(texto))));

interface Props {
  isOpen: boolean;
  accessToken: string;
  onClose: () => void;
  onCerrada: (cierre: CierreCaja) => void;
}

/** Cierre de caja del vendedor: cuenta el efectivo y lo compara con lo esperado. */
export const CierreCajaModal: React.FC<Props> = ({ isOpen, accessToken, onClose, onCerrada }) => {
  const [caja, setCaja] = useState<CajaAbierta | null>(null);
  const [cargando, setCargando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fondo, setFondo] = useState('');
  const [contado, setContado] = useState('');
  const [observacion, setObservacion] = useState('');
  const [cierre, setCierre] = useState<CierreCaja | null>(null);
  // Una clave por intento de cierre: reintentar tras un corte no cierra dos veces.
  const clave = useRef('');

  const cargar = async () => {
    setCargando(true);
    setError(null);
    setCierre(null);
    setContado('');
    setObservacion('');
    clave.current = crypto.randomUUID();
    try {
      const abierta = await getCajaAbierta(accessToken);
      setCaja(abierta);
      setFondo(String(fondoGuardado() ?? abierta.ultimoCierre?.fondoInicial ?? 0));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la caja.');
    } finally {
      setCargando(false);
    }
  };

  const efectivoVentas = caja?.porMedio.find((m) => m.codigo === 'EFECTIVO')?.total ?? 0;
  const fondoInicial = pesos(fondo);
  const efectivoContado = pesos(contado);
  const esperado = (fondoInicial ?? 0) + efectivoVentas;
  const diferencia = efectivoContado === null ? null : efectivoContado - esperado;
  const falta = diferencia !== null && diferencia !== 0 && observacion.trim() === '';
  const listo = caja !== null && fondoInicial !== null && efectivoContado !== null && !falta && !enviando;

  const confirmar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!listo) return;
    setEnviando(true);
    setError(null);
    try {
      const resultado = await cerrarCaja(accessToken, {
        claveIdempotencia: clave.current,
        fondoInicial: fondoInicial!,
        efectivoContado: efectivoContado!,
        observacion: observacion.trim() || undefined,
      });
      try {
        localStorage.setItem(FONDO_KEY, String(fondoInicial));
      } catch {
        // Sin almacenamiento: la próxima vez se propone el fondo del último cierre.
      }
      setCierre(resultado);
      onCerrada(resultado);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cerrar la caja.');
    } finally {
      setEnviando(false);
    }
  };

  const imprimir = () => {
    if (!cierre) return;
    const ventana = window.open('', '_blank');
    if (!ventana) return;
    const filas = cierre.porMedio
      .map((m) => `<div class="linea"><span>${m.nombre} (${m.ventas})</span><span>${formatCLP(m.total)}</span></div>`)
      .join('');
    const cuadre = estadoCuadre(cierre.diferencia).texto;
    ventana.document.write(`<!DOCTYPE html><html><head><title>Cierre de caja #${cierre.idCierre}</title><style>
      body { font-family: monospace; padding: 20px; max-width: 320px; margin: 0 auto; }
      h2 { text-align: center; margin: 0 0 8px; } p { margin: 2px 0; font-size: 12px; }
      .bloque { border-top: 1px dashed #000; margin-top: 10px; padding-top: 8px; }
      .linea { display: flex; justify-content: space-between; font-size: 12px; margin: 3px 0; }
      .total { font-weight: bold; font-size: 14px; } @media print { .no-print { display: none; } }
    </style></head><body>
      <h2>CIERRE DE CAJA</h2>
      <p>N° ${cierre.idCierre} · ${fecha(cierre.fecha)}</p>
      <p>Vendedor: ${cierre.vendedor}</p>
      <p>Ventas desde ${fecha(cierre.desde)} hasta ${fecha(cierre.hasta)}</p>
      <div class="bloque">${filas}<div class="linea total"><span>Total (${cierre.ventas} ventas)</span><span>${formatCLP(cierre.total)}</span></div></div>
      <div class="bloque">
        <div class="linea"><span>Fondo inicial</span><span>${formatCLP(cierre.fondoInicial)}</span></div>
        <div class="linea"><span>Ventas en efectivo</span><span>${formatCLP(cierre.efectivoVentas)}</span></div>
        <div class="linea"><span>Efectivo esperado</span><span>${formatCLP(cierre.efectivoEsperado)}</span></div>
        <div class="linea"><span>Efectivo contado</span><span>${formatCLP(cierre.efectivoContado)}</span></div>
        <div class="linea total"><span>${cuadre}</span></div>
        ${cierre.observacion ? `<p>Obs.: ${cierre.observacion.replace(/</g, '&lt;')}</p>` : ''}
      </div>
      <div class="bloque"><p>Firma vendedor: ____________________</p></div>
      <button class="no-print" onclick="window.print()" style="margin-top:20px;padding:10px 20px;">Imprimir</button>
      <script>window.onload = () => window.print();</script>
    </body></html>`);
    ventana.document.close();
  };

  const cuadre = diferencia === null ? null : estadoCuadre(diferencia);

  return (
    <IonModal
      isOpen={isOpen}
      onWillPresent={() => void cargar()}
      onDidDismiss={onClose}
      className="pos-modal-centered cierre-caja-modal"
      aria-label="Cierre de caja"
    >
      <IonHeader>
        <IonToolbar color="dark">
          <IonTitle>Cierre de caja</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={onClose} fill="clear" aria-label="Cerrar">
              <IonIcon icon={closeCircleOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        {cargando && <div className="cierre-cargando"><IonSpinner name="crescent" /> Calculando la caja…</div>}
        {error && <p className="cierre-error" role="alert">{error}</p>}

        {cierre && (
          <div className="cierre-hecho" role="status">
            <div className={`cuadre ${estadoCuadre(cierre.diferencia).clase}`}>
              <IonIcon icon={estadoCuadre(cierre.diferencia).icono} aria-hidden="true" />
              <strong>{estadoCuadre(cierre.diferencia).texto}</strong>
            </div>
            <p>
              Cierre N° {cierre.idCierre}: {cierre.ventas} ventas por {formatCLP(cierre.total)}. Quedó registrado para el
              panel de finanzas.
            </p>
            <IonButton expand="block" onClick={imprimir}>
              <IonIcon icon={printOutline} slot="start" />
              Imprimir comprobante del cierre
            </IonButton>
            <IonButton expand="block" fill="clear" color="medium" onClick={onClose}>Listo</IonButton>
          </div>
        )}

        {caja && !cierre && !cargando && (
          <form onSubmit={confirmar} className="cierre-form">
            <p className="cierre-periodo">
              {caja.ventas === 0
                ? 'No hay ventas desde el último cierre.'
                : `${caja.ventas} ventas desde ${fecha(caja.desde)}`}
            </p>
            <dl className="cierre-medios">
              {caja.porMedio.map((m) => (
                <div key={m.codigo}>
                  <dt>{m.nombre} <span>({m.ventas})</span></dt>
                  <dd>{formatCLP(m.total)}</dd>
                </div>
              ))}
              <div className="total">
                <dt>Total</dt>
                <dd>{formatCLP(caja.total)}</dd>
              </div>
            </dl>

            <label className="campo-pago">
              <span>Fondo inicial (efectivo con que partió la caja)</span>
              <input type="number" inputMode="numeric" min={0} step={100} value={fondo} onChange={(e) => setFondo(e.target.value)} required />
            </label>
            <label className="campo-pago">
              <span>Efectivo contado en la caja</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={100}
                value={contado}
                onChange={(e) => setContado(e.target.value)}
                placeholder="Cuenta billetes y monedas"
                required
                autoFocus
              />
            </label>

            <div className="cierre-esperado">
              <span>Efectivo esperado</span>
              <strong>{formatCLP(esperado)}</strong>
              <small>Fondo {formatCLP(fondoInicial ?? 0)} + ventas en efectivo {formatCLP(efectivoVentas)}</small>
            </div>
            {cuadre && (
              <div className={`cuadre ${cuadre.clase}`} aria-live="polite">
                <IonIcon icon={cuadre.icono} aria-hidden="true" />
                <strong>{cuadre.texto}</strong>
              </div>
            )}

            <label className="campo-pago">
              <span>Observación {diferencia !== null && diferencia !== 0 ? '(obligatoria: explica la diferencia)' : '(opcional)'}</span>
              <textarea rows={2} maxLength={500} value={observacion} onChange={(e) => setObservacion(e.target.value)} />
            </label>

            <IonButton expand="block" type="submit" disabled={!listo} className="cerrar-caja-btn">
              {enviando ? <IonSpinner name="crescent" /> : 'Cerrar caja'}
            </IonButton>
          </form>
        )}
      </IonContent>
    </IonModal>
  );
};
