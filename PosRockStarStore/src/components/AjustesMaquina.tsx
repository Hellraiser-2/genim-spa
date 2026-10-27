import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonModal,
  IonSpinner,
  IonTitle,
  IonToggle,
  IonToolbar,
} from '@ionic/react';
import { useState } from 'react';
import { checkmarkCircleOutline, closeCircleOutline, alertCircleOutline } from 'ionicons/icons';
import { ConfigMaquina, InfoMaquina, maquinaHttp, urlBase } from '../lib/terminal';

interface Props {
  isOpen: boolean;
  config: ConfigMaquina;
  onGuardar: (config: ConfigMaquina) => void;
  onClose: () => void;
}

type Prueba = { estado: 'probando' } | { estado: 'ok'; info: InfoMaquina } | { estado: 'error'; mensaje: string } | null;

/** Activa la maquina de cobro de esta caja y prueba la conexion por la red. */
export const AjustesMaquina: React.FC<Props> = ({ isOpen, config, onGuardar, onClose }) => {
  const [activa, setActiva] = useState(config.activa);
  const [direccion, setDireccion] = useState(config.direccion);
  const [prueba, setPrueba] = useState<Prueba>(null);

  const probar = async () => {
    setPrueba({ estado: 'probando' });
    try {
      setPrueba({ estado: 'ok', info: await maquinaHttp(direccion).info() });
    } catch (error) {
      setPrueba({ estado: 'error', mensaje: error instanceof Error ? error.message : 'No responde.' });
    }
  };

  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    onGuardar({ activa, direccion: direccion.trim() || config.direccion });
  };

  return (
    <IonModal
      isOpen={isOpen}
      onWillPresent={() => {
        setActiva(config.activa);
        setDireccion(config.direccion);
        setPrueba(null);
      }}
      onDidDismiss={onClose}
      className="pos-modal-centered ajustes-maquina-modal"
      aria-label="Máquina de cobro"
    >
      <IonHeader>
        <IonToolbar color="dark">
          <IonTitle>Máquina de cobro</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={onClose} fill="clear" aria-label="Cerrar ajustes">
              <IonIcon icon={closeCircleOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        <form onSubmit={guardar}>
          <IonItem lines="none" className="ajuste-fila">
            <IonLabel>
              <strong>Usar la máquina de cobro</strong>
              <p>Las ventas con débito o crédito se cobran enviando el monto a la máquina.</p>
            </IonLabel>
            <IonToggle
              slot="end"
              checked={activa}
              onIonChange={(e) => setActiva(e.detail.checked)}
              aria-label="Usar la máquina de cobro"
              className="maquina-toggle"
            />
          </IonItem>

          <label className="ajuste-campo">
            <span>Dirección en la red (IP y puerto)</span>
            <input
              className="ajuste-input"
              value={direccion}
              onChange={(e) => {
                setDireccion(e.target.value);
                setPrueba(null);
              }}
              placeholder="192.168.1.50:8090"
              autoComplete="off"
              spellCheck={false}
              aria-describedby="ayuda-direccion"
            />
          </label>
          <p id="ayuda-direccion" className="ajuste-ayuda">
            La máquina debe estar en la misma red que esta caja. Se conectará a <code>{urlBase(direccion || config.direccion)}</code>.
          </p>

          <IonButton expand="block" fill="outline" onClick={() => void probar()} disabled={prueba?.estado === 'probando'}>
            {prueba?.estado === 'probando' ? <IonSpinner name="crescent" /> : 'Probar conexión'}
          </IonButton>

          {prueba?.estado === 'ok' && (
            <p className="ajuste-prueba ok" role="status">
              <IonIcon icon={checkmarkCircleOutline} /> Conectada: {prueba.info.nombre} ({prueba.info.modelo}, serie {prueba.info.serie})
            </p>
          )}
          {prueba?.estado === 'error' && (
            <p className="ajuste-prueba falla" role="alert">
              <IonIcon icon={alertCircleOutline} /> {prueba.mensaje}
            </p>
          )}

          <IonButton expand="block" type="submit" className="mt-16">
            Guardar
          </IonButton>
        </form>
      </IonContent>
    </IonModal>
  );
};
