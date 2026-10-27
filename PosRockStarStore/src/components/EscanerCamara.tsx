import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonModal,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/react';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { useEffect, useRef, useState } from 'react';
import { alertCircleOutline, checkmarkCircleOutline, closeCircleOutline, refreshOutline } from 'ionicons/icons';

/** Lo que trae una etiqueta: el QR lleva el SKU y el codigo de barras es EAN-13. */
const FORMATOS = [
  BarcodeFormat.QR_CODE,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.CODE_128,
];

/**
 * Mientras la etiqueta sigue frente a la camara se lee una y otra vez: solo cuenta de
 * nuevo cuando deja de verse este tiempo. Asi una prenda no se suma sola varias veces.
 */
const AUSENCIA_PARA_RELEER_MS = 1500;

export interface ResultadoLectura {
  ok: boolean;
  mensaje: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Recibe cada codigo leido y responde que paso con el, para mostrarlo bajo la camara. */
  onCodigo: (codigo: string) => Promise<ResultadoLectura>;
}

function mensajeErrorCamara(error: unknown): string {
  if (!window.isSecureContext) {
    return 'La cámara solo funciona en https o en localhost. Escribe el código o usa un lector USB.';
  }
  const nombre = error instanceof DOMException ? error.name : '';
  if (nombre === 'NotAllowedError' || nombre === 'SecurityError') {
    return 'El navegador no dio permiso para usar la cámara. Permítelo en el ícono de la barra de direcciones y reintenta.';
  }
  if (nombre === 'NotFoundError' || nombre === 'OverconstrainedError') {
    return 'No se encontró una cámara en este equipo. Escribe el código o usa un lector USB.';
  }
  if (nombre === 'NotReadableError') {
    return 'La cámara está en uso por otra aplicación. Ciérrala y reintenta.';
  }
  return 'No se pudo abrir la cámara. Escribe el código o usa un lector USB.';
}

/** Pitido corto de confirmacion; si el navegador no deja reproducir audio, se omite. */
function pitido(ok: boolean) {
  try {
    const audio = new AudioContext();
    const oscilador = audio.createOscillator();
    const volumen = audio.createGain();
    oscilador.frequency.value = ok ? 1200 : 300;
    volumen.gain.value = 0.08;
    oscilador.connect(volumen).connect(audio.destination);
    oscilador.start();
    oscilador.stop(audio.currentTime + (ok ? 0.08 : 0.25));
    oscilador.onended = () => audio.close();
  } catch {
    // Sin audio: el resultado igual queda en pantalla.
  }
}

/** Lector de QR y codigos de barras con la camara del equipo, en lectura continua. */
export const EscanerCamara: React.FC<Props> = ({ isOpen, onClose, onCodigo }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controles = useRef<IScannerControls | null>(null);
  const activo = useRef(false);
  const ocupado = useRef(false);
  const ultimo = useRef<{ codigo: string; vistoEn: number } | null>(null);
  // El lector llama siempre a la version mas reciente, con el carrito al dia.
  const onCodigoActual = useRef(onCodigo);
  onCodigoActual.current = onCodigo;

  const [estado, setEstado] = useState<'iniciando' | 'leyendo' | 'error'>('iniciando');
  const [errorCamara, setErrorCamara] = useState<string | null>(null);
  const [lecturas, setLecturas] = useState<(ResultadoLectura & { id: number })[]>([]);

  const detener = () => {
    controles.current?.stop();
    controles.current = null;
  };

  const leer = async (texto: string) => {
    const codigo = texto.trim();
    const ahora = Date.now();
    if (!codigo || ocupado.current) return;
    const anterior = ultimo.current;
    ultimo.current = { codigo, vistoEn: ahora };
    if (anterior?.codigo === codigo && ahora - anterior.vistoEn < AUSENCIA_PARA_RELEER_MS) return;

    ocupado.current = true;
    try {
      const resultado = await onCodigoActual.current(codigo);
      pitido(resultado.ok);
      setLecturas((previas) => [{ ...resultado, id: ahora }, ...previas].slice(0, 5));
    } finally {
      ocupado.current = false;
    }
  };

  const iniciar = async () => {
    activo.current = true;
    detener();
    setEstado('iniciando');
    setErrorCamara(null);
    ultimo.current = null;

    const video = videoRef.current;
    if (!navigator.mediaDevices?.getUserMedia || !video) {
      setErrorCamara(mensajeErrorCamara(null));
      setEstado('error');
      return;
    }
    const pistas = new Map<DecodeHintType, unknown>([[DecodeHintType.POSSIBLE_FORMATS, FORMATOS]]);
    const lector = new BrowserMultiFormatReader(pistas, { delayBetweenScanAttempts: 150 });
    try {
      const abiertos = await lector.decodeFromConstraints(
        { video: { facingMode: 'environment' } },
        video,
        (resultado) => {
          if (resultado) void leer(resultado.getText());
        },
      );
      // Si el modal se cerro mientras la camara arrancaba, se apaga de inmediato.
      if (!activo.current) {
        abiertos.stop();
        return;
      }
      controles.current = abiertos;
      setEstado('leyendo');
    } catch (error) {
      if (!activo.current) return;
      setErrorCamara(mensajeErrorCamara(error));
      setEstado('error');
    }
  };

  const cerrarCamara = () => {
    activo.current = false;
    detener();
  };

  // La camara nunca queda encendida si el POS se desmonta con el modal abierto.
  useEffect(() => {
    const camara = controles;
    return () => {
      activo.current = false;
      camara.current?.stop();
    };
  }, []);

  return (
    <IonModal
      isOpen={isOpen}
      onDidPresent={() => {
        setLecturas([]);
        void iniciar();
      }}
      onWillDismiss={cerrarCamara}
      onDidDismiss={onClose}
      className="pos-modal-centered escaner-modal"
      aria-label="Escanear producto"
    >
      <IonHeader>
        <IonToolbar color="dark">
          <IonTitle>Escanear producto</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={onClose} fill="clear" aria-label="Cerrar escáner">
              <IonIcon icon={closeCircleOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        <div className="escaner-video-wrap">
          <video ref={videoRef} className="escaner-video" muted playsInline aria-label="Vista de la cámara" />
          {estado === 'leyendo' && <div className="escaner-marco" aria-hidden="true" />}
          {estado === 'iniciando' && (
            <div className="escaner-estado">
              <IonSpinner name="crescent" />
              <span>Abriendo la cámara…</span>
            </div>
          )}
          {estado === 'error' && (
            <div className="escaner-estado escaner-error" role="alert">
              <IonIcon icon={alertCircleOutline} />
              <span>{errorCamara}</span>
              <IonButton size="small" fill="outline" onClick={() => void iniciar()}>
                <IonIcon icon={refreshOutline} slot="start" />
                Reintentar
              </IonButton>
            </div>
          )}
        </div>

        <p className="escaner-ayuda">
          Apunta al QR o al código de barras de la etiqueta. Cada prenda leída se suma al carrito;
          para otra unidad del mismo producto, retira la etiqueta y vuelve a mostrarla.
        </p>

        {lecturas.length > 0 && (
          <ul className="escaner-lecturas" aria-live="polite">
            {lecturas.map((lectura) => (
              <li key={lectura.id} className={lectura.ok ? 'ok' : 'falla'}>
                <IonIcon icon={lectura.ok ? checkmarkCircleOutline : alertCircleOutline} />
                <span>{lectura.mensaje}</span>
              </li>
            ))}
          </ul>
        )}

        <IonButton expand="block" onClick={onClose} className="mt-16">
          Listo, ir al carrito
        </IonButton>
      </IonContent>
    </IonModal>
  );
};
