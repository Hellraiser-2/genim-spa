import { IonIcon, IonItem, IonLabel, IonList, IonRadio, IonRadioGroup } from '@ionic/react';
import { useState } from 'react';
import { cardOutline, cashOutline, copyOutline, swapHorizontalOutline } from 'ionicons/icons';
import type { MedioPresencial } from '../lib/api';
import { formatCLP } from '../utils/format';
import { DATOS_TRANSFERENCIA, montosSugeridos, vueltoDe } from '../utils/pago';

type Forma = 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA';

const FORMAS: { forma: Forma; nombre: string; icono: string }[] = [
  { forma: 'EFECTIVO', nombre: 'Efectivo', icono: cashOutline },
  { forma: 'TARJETA', nombre: 'Tarjeta', icono: cardOutline },
  { forma: 'TRANSFERENCIA', nombre: 'Transferencia', icono: swapHorizontalOutline },
];

const formaDe = (medio: MedioPresencial): Forma =>
  medio === 'EFECTIVO' ? 'EFECTIVO' : medio === 'TRANSFERENCIA' ? 'TRANSFERENCIA' : 'TARJETA';

interface Props {
  total: number;
  medio: MedioPresencial;
  onMedio: (medio: MedioPresencial) => void;
  maquinaActiva: boolean;
  recibido: number | null;
  onRecibido: (monto: number | null) => void;
  numeroOperacion: string;
  onNumeroOperacion: (numero: string) => void;
}

/** Efectivo (con vuelto), tarjeta (débito o crédito) o transferencia (con número de operación). */
export const SelectorPago: React.FC<Props> = ({
  total,
  medio,
  onMedio,
  maquinaActiva,
  recibido,
  onRecibido,
  numeroOperacion,
  onNumeroOperacion,
}) => {
  const forma = formaDe(medio);
  const vuelto = vueltoDe(total, recibido);
  const [copiado, setCopiado] = useState(false);

  const elegir = (nueva: Forma) => {
    if (nueva === forma) return;
    onMedio(nueva === 'EFECTIVO' ? 'EFECTIVO' : nueva === 'TRANSFERENCIA' ? 'TRANSFERENCIA' : 'DEBITO_PRESENCIAL');
  };

  const copiar = async () => {
    const d = DATOS_TRANSFERENCIA;
    try {
      await navigator.clipboard.writeText(
        `${d.titular}\nRUT ${d.rut}\n${d.banco}\n${d.tipoCuenta} ${d.numero}\n${d.correo}\nMonto ${formatCLP(total)}`,
      );
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sin portapapeles: los datos siguen a la vista.
    }
  };

  return (
    <div className="selector-pago">
      <div className="formas-pago" role="radiogroup" aria-label="Medio de pago">
        {FORMAS.map((f) => (
          <button
            key={f.forma}
            type="button"
            role="radio"
            aria-checked={forma === f.forma}
            data-medio={f.forma}
            className={`forma-pago${forma === f.forma ? ' elegida' : ''}`}
            onClick={() => elegir(f.forma)}
          >
            <IonIcon icon={f.icono} aria-hidden="true" />
            <span>{f.nombre}</span>
          </button>
        ))}
      </div>

      {forma === 'EFECTIVO' && (
        <div className="detalle-pago">
          <label className="campo-pago">
            <span>Monto recibido</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={100}
              placeholder={`${total} (exacto)`}
              value={recibido ?? ''}
              onChange={(e) => onRecibido(e.target.value === '' ? null : Math.max(0, Math.round(Number(e.target.value))))}
              aria-describedby="vuelto"
            />
          </label>
          <div className="montos-rapidos">
            <button type="button" onClick={() => onRecibido(total)}>Exacto</button>
            {montosSugeridos(total).map((m) => (
              <button type="button" key={m} onClick={() => onRecibido(m)}>{formatCLP(m)}</button>
            ))}
          </div>
          <p id="vuelto" className={`vuelto${vuelto !== null && vuelto < 0 ? ' falta' : ''}`} aria-live="polite">
            {vuelto === null
              ? 'Sin monto recibido se registra como pago exacto.'
              : vuelto < 0
                ? `Faltan ${formatCLP(-vuelto)}`
                : <>Vuelto: <strong>{formatCLP(vuelto)}</strong></>}
          </p>
        </div>
      )}

      {forma === 'TARJETA' && (
        <div className="detalle-pago">
          <IonRadioGroup value={medio} onIonChange={(e) => onMedio(e.detail.value as MedioPresencial)}>
            <IonList lines="none">
              <IonItem>
                <IonRadio slot="start" value="DEBITO_PRESENCIAL" />
                <IonLabel>Débito</IonLabel>
              </IonItem>
              <IonItem>
                <IonRadio slot="start" value="CREDITO_PRESENCIAL" />
                <IonLabel>Crédito</IonLabel>
              </IonItem>
            </IonList>
          </IonRadioGroup>
          <p className="nota-pago">
            {maquinaActiva ? 'El monto se envía a la máquina de cobro.' : 'Cobra en el terminal de la tienda y luego confirma.'}
          </p>
        </div>
      )}

      {forma === 'TRANSFERENCIA' && (
        <div className="detalle-pago">
          <dl className="datos-transferencia">
            <dt>Titular</dt><dd>{DATOS_TRANSFERENCIA.titular}</dd>
            <dt>RUT</dt><dd>{DATOS_TRANSFERENCIA.rut}</dd>
            <dt>Banco</dt><dd>{DATOS_TRANSFERENCIA.banco}</dd>
            <dt>{DATOS_TRANSFERENCIA.tipoCuenta}</dt><dd>{DATOS_TRANSFERENCIA.numero}</dd>
            <dt>Correo</dt><dd>{DATOS_TRANSFERENCIA.correo}</dd>
            <dt>Monto</dt><dd><strong>{formatCLP(total)}</strong></dd>
          </dl>
          <button type="button" className="copiar-datos" onClick={() => void copiar()}>
            <IonIcon icon={copyOutline} aria-hidden="true" />
            {copiado ? 'Datos copiados' : 'Copiar datos'}
          </button>
          <label className="campo-pago">
            <span>N° de operación (opcional)</span>
            <input
              type="text"
              placeholder="Del comprobante del banco"
              value={numeroOperacion}
              maxLength={40}
              onChange={(e) => onNumeroOperacion(e.target.value.replace(/[^A-Za-z0-9-]/g, ''))}
              autoComplete="off"
            />
          </label>
          <p className="nota-pago">Confirma la venta solo cuando veas la transferencia recibida en la cuenta.</p>
        </div>
      )}
    </div>
  );
};
