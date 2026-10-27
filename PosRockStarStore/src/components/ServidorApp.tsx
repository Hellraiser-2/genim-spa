import { useEffect, useState } from 'react';
import { IonButton, IonIcon, IonInput, IonItem, IonSpinner } from '@ionic/react';
import { serverOutline } from 'ionicons/icons';

import {
  elegirServidor,
  equipoDe,
  faltaServidor,
  normalizarServidor,
  probarServidor,
  servidorActual,
  servidorElegido,
} from '../lib/servidor';
import { guardarConfigMaquina, leerConfigMaquina } from '../lib/terminal';

const PUERTO_MAQUINA = 8090;

/**
 * La máquina de cobro corre en el mismo equipo que el servidor. Si sigue con la dirección
 * de fábrica o con la del servidor anterior, pasa a la del nuevo; una puesta a mano se respeta.
 */
function moverMaquina(anterior: string, nuevo: string): void {
  const config = leerConfigMaquina();
  const equipoMaquina = config.direccion.replace(/^https?:\/\//i, '').split(/[:/]/)[0];
  if (equipoMaquina === 'localhost' || equipoMaquina === equipoDe(anterior)) {
    guardarConfigMaquina({ ...config, direccion: `${equipoDe(nuevo)}:${PUERTO_MAQUINA}` });
  }
}

interface Props {
  /** Avisa si la app tiene un servidor que responde; sin él no se puede iniciar sesión. */
  onConectado: (conectado: boolean) => void;
}

/**
 * Servidor al que se conecta la app instalada. La IP del equipo servidor cambia con la red
 * (el Wi-Fi del local o la zona Wi-Fi de un celular): la app la pide al abrirse, la recuerda
 * y la vuelve a pedir si deja de responder.
 */
const ServidorApp: React.FC<Props> = ({ onConectado }) => {
  const [actual, setActual] = useState(servidorActual());
  const [editando, setEditando] = useState(faltaServidor());
  const [texto, setTexto] = useState(servidorElegido());
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(
    faltaServidor() ? { ok: false, texto: 'Escriba la IP del equipo servidor para conectarse.' } : null,
  );
  const [probando, setProbando] = useState(!faltaServidor());
  const obligatorio = faltaServidor();

  // Al abrir la app, el servidor guardado puede no responder si se cambió de red.
  useEffect(() => {
    if (faltaServidor()) {
      onConectado(false);
      return;
    }
    let vigente = true;
    void probarServidor(servidorActual()).then((ok) => {
      if (!vigente) return;
      setProbando(false);
      onConectado(ok);
      if (!ok) {
        setEditando(true);
        setAviso({
          ok: false,
          texto: `El servidor ${servidorActual().replace(/^https?:\/\//, '')} no responde. Si cambió de red, escriba la IP actual del equipo servidor.`,
        });
      }
    });
    return () => {
      vigente = false;
    };
    // Solo al montar: después, cada cambio se prueba al guardarlo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const probar = async () => {
    setProbando(true);
    const ok = await probarServidor(servidorActual());
    setProbando(false);
    onConectado(ok);
    setAviso(
      ok
        ? { ok: true, texto: 'Conectado al servidor.' }
        : { ok: false, texto: 'El servidor no responde. Revise que el teléfono esté en la misma red que el equipo.' },
    );
  };

  /** Solo se guarda una dirección que responde, para no dejar la app sin poder entrar. */
  const guardar = async () => {
    const direccion = normalizarServidor(texto);
    if (!direccion) {
      setAviso({ ok: false, texto: 'Escriba la IP del servidor, por ejemplo 192.168.43.10.' });
      return;
    }
    setTexto(direccion);
    setProbando(true);
    const ok = await probarServidor(direccion);
    setProbando(false);
    if (!ok) {
      setAviso({ ok: false, texto: `No se pudo conectar a ${direccion}. Revise la IP y que el sistema esté encendido en ese equipo.` });
      return;
    }
    moverMaquina(servidorActual(), direccion);
    elegirServidor(direccion);
    setActual(servidorActual());
    setEditando(false);
    setAviso({ ok: true, texto: 'Conectado al servidor.' });
    onConectado(true);
  };

  return (
    <div className="servidor-app" data-testid="servidor-app">
      <p style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '0 0 6px', fontSize: 13 }}>
        <IonIcon icon={serverOutline} aria-hidden="true" />
        <span>
          Servidor: <strong>{obligatorio && !servidorElegido() ? 'sin configurar' : actual}</strong>
        </span>
      </p>
      {editando ? (
        <>
          <IonItem>
            <IonInput
              label="IP del servidor"
              labelPlacement="stacked"
              value={texto}
              placeholder="192.168.43.10"
              inputmode="url"
              autocapitalize="off"
              onIonInput={(e) => setTexto(e.detail.value ?? '')}
            />
          </IonItem>
          <p className="field-feedback" style={{ opacity: 0.8 }}>
            La IP del equipo donde corre el sistema (con :puerto si no es el 3000). El teléfono y ese equipo deben estar
            en la misma red: el Wi-Fi del local o la zona Wi-Fi de un celular.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            <IonButton size="small" onClick={guardar} disabled={probando}>
              {probando ? <IonSpinner name="crescent" /> : 'Conectar'}
            </IonButton>
            {servidorElegido() !== '' && (
              <IonButton size="small" fill="clear" color="medium" onClick={() => setEditando(false)} disabled={probando}>
                Cancelar
              </IonButton>
            )}
          </div>
        </>
      ) : (
        <div style={{ display: 'flex', gap: 4 }}>
          <IonButton size="small" fill="outline" onClick={() => setEditando(true)}>
            Cambiar
          </IonButton>
          <IonButton size="small" fill="clear" onClick={probar} disabled={probando}>
            {probando ? <IonSpinner name="crescent" /> : 'Probar conexión'}
          </IonButton>
        </div>
      )}
      {aviso && (
        <p className={`field-feedback ${aviso.ok ? 'valid' : 'invalid'}`} role={aviso.ok ? 'status' : 'alert'}>
          {aviso.texto}
        </p>
      )}
    </div>
  );
};

export default ServidorApp;
