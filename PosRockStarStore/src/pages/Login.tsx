import { useEffect, useMemo, useState } from 'react';
import {
  IonContent,
  IonItem,
  IonLabel,
  IonInput,
  IonButton,
  IonSpinner,
  IonIcon,
  IonPage,
  IonCheckbox,
} from '@ionic/react';
import {
  storefrontOutline,
  checkmarkCircleOutline,
  alertCircleOutline,
  warningOutline,
} from 'ionicons/icons';
import ServidorApp from '../components/ServidorApp';
import { useAuth } from '../contexts/AuthContext';
import { esAppInstalada } from '../lib/servidor';
import { useNavigate } from 'react-router-dom';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type Fortaleza = 'vacia' | 'debil' | 'media' | 'fuerte';

function medirFortaleza(pwd: string): Fortaleza {
  if (!pwd) return 'vacia';
  let puntos = 0;
  if (pwd.length >= 6) puntos += 1;
  if (pwd.length >= 10) puntos += 1;
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) puntos += 1;
  if (/\d/.test(pwd)) puntos += 1;
  if (/[^A-Za-z0-9]/.test(pwd)) puntos += 1;
  if (puntos <= 2) return 'debil';
  if (puntos <= 3) return 'media';
  return 'fuerte';
}

const FORTALEZA_META: Record<Fortaleza, { texto: string; ancho: string; clase: string }> = {
  vacia: { texto: '', ancho: '0%', clase: '' },
  debil: { texto: 'Contraseña débil', ancho: '33%', clase: 'strength-weak' },
  media: { texto: 'Contraseña media', ancho: '66%', clase: 'strength-medium' },
  fuerte: { texto: 'Contraseña fuerte', ancho: '100%', clase: 'strength-strong' },
};

function clasificarError(mensaje: string): { texto: string; muestraOlvide: boolean } {
  const m = mensaje.toLowerCase();
  if (m.includes('inactiva') || m.includes('desactivada') || m.includes('suspendida')) {
    return { texto: 'Esta cuenta está desactivada. Contacte al administrador.', muestraOlvide: false };
  }
  if (
    m.includes('network') ||
    m.includes('fetch') ||
    m.includes('conexi') ||
    m.includes('failed to fetch') ||
    m.includes('load failed')
  ) {
    return { texto: 'Sin conexión. Verifique su red e intente de nuevo.', muestraOlvide: false };
  }
  if (m.includes('401') || m.includes('credenciales') || m.includes('incorrecta') || m.includes('inválid')) {
    return {
      texto: 'Credenciales incorrectas. Verifica email y contraseña.',
      muestraOlvide: true,
    };
  }
  return { texto: mensaje, muestraOlvide: false };
}

const Login: React.FC = () => {
  const { loginVendedor } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('vendedor@rockstar.cl');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [tocado, setTocado] = useState({ email: false, password: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // En el teléfono, el inicio de sesión espera a tener un servidor que responda.
  const [conectado, setConectado] = useState(!esAppInstalada);

  const emailValido = useMemo(() => EMAIL_RE.test(email.trim()), [email]);
  const fortaleza = useMemo(() => medirFortaleza(password), [password]);
  const fortalezaMeta = FORTALEZA_META[fortaleza];
  const errorInfo = useMemo(() => (error ? clasificarError(error) : null), [error]);
  const puedeEnviar = emailValido && password.length > 0 && !loading && conectado;

  // Health-check del backend al mostrar el login (no bloquea la UI).
  useEffect(() => {
    import('../lib/api')
      .then((m) => m.salud())
      .catch(() => false);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTocado({ email: true, password: true });
    if (!emailValido || !password) return;
    setLoading(true);
    setError(null);
    try {
      await loginVendedor(email.trim(), password, rememberMe);
      navigate('/pos', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  const reintentar = () => {
    setError(null);
    handleSubmit(new Event('submit') as unknown as React.FormEvent);
  };

  return (
    <IonPage aria-label="Login Rockstar Store POS">
      <IonContent className="login-page" fullscreen>
        <div className="login-container anim-slide-up">
          <div className="login-header">
            <IonIcon
              icon={storefrontOutline}
              className="login-icon login-brand-icon"
              aria-hidden="true"
            />
            <h1>Rockstar Store POS</h1>
            <p>Acceso vendedor</p>
          </div>
          {/* En el teléfono no hay mismo origen: se muestra a qué equipo se conecta. */}
          {esAppInstalada && <ServidorApp onConectado={setConectado} />}
          <form onSubmit={handleSubmit} noValidate>
            <IonItem
              className={
                tocado.email ? (emailValido ? 'login-input-valid' : 'login-input-invalid') : ''
              }
            >
              <IonLabel position="floating">Correo</IonLabel>
              <IonInput
                id="login-email"
                aria-label="Correo"
                type="email"
                value={email}
                onIonInput={(e) => {
                  setEmail(e.detail.value || '');
                  setTocado((t) => ({ ...t, email: true }));
                }}
                onIonBlur={() => setTocado((t) => ({ ...t, email: true }))}
                disabled={loading}
                autocomplete="email"
                enterkeyhint="next"
                aria-invalid={tocado.email && !emailValido}
                aria-describedby="login-email-feedback"
              />
              {tocado.email && email.length > 0 && (
                <IonIcon
                  slot="end"
                  icon={emailValido ? checkmarkCircleOutline : warningOutline}
                  color={emailValido ? 'success' : 'danger'}
                  aria-hidden="true"
                />
              )}
            </IonItem>
            {tocado.email && email.length > 0 && (
              <p
                id="login-email-feedback"
                className={`field-feedback ${emailValido ? 'valid' : 'invalid'}`}
                role={emailValido ? undefined : 'alert'}
              >
                {emailValido ? 'Email válido' : 'Formato de email inválido'}
              </p>
            )}

            <IonItem
              className={
                tocado.password
                  ? fortaleza === 'fuerte' || fortaleza === 'media'
                    ? 'login-input-valid'
                    : password
                      ? 'login-input-invalid'
                      : ''
                  : ''
              }
            >
              <IonLabel position="floating">Contraseña</IonLabel>
              <IonInput
                id="login-password"
                aria-label="Contraseña"
                type="password"
                value={password}
                onIonInput={(e) => {
                  setPassword(e.detail.value || '');
                  setTocado((t) => ({ ...t, password: true }));
                }}
                onIonBlur={() => setTocado((t) => ({ ...t, password: true }))}
                disabled={loading}
                autocomplete="current-password"
                enterkeyhint="go"
                aria-describedby="login-password-strength"
              />
            </IonItem>
            {password.length > 0 && fortaleza !== 'vacia' && (
              <div id="login-password-strength" aria-live="polite">
                <div className="strength-meter" aria-hidden="true">
                  <div
                    className={`strength-fill ${fortalezaMeta.clase}`}
                    style={{ width: fortalezaMeta.ancho }}
                  />
                </div>
                <p className="strength-label">{fortalezaMeta.texto}</p>
              </div>
            )}

            <div className="remember-row">
              <IonCheckbox
                id="login-remember"
                checked={rememberMe}
                onIonChange={(e) => setRememberMe(e.detail.checked)}
                disabled={loading}
                aria-label="Recordarme durante 30 días"
              />
              <label htmlFor="login-remember">Recordarme</label>
            </div>

            {errorInfo && (
              <div className="login-error-box anim-fade-in" role="alert" data-testid="login-error">
                <p style={{ display: 'flex', gap: 8, alignItems: 'flex-start', margin: 0 }}>
                  <IonIcon
                    icon={alertCircleOutline}
                    color="danger"
                    style={{ fontSize: 20, flexShrink: 0 }}
                    aria-hidden="true"
                  />
                  <span>{errorInfo.texto}</span>
                </p>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <IonButton size="small" fill="clear" color="danger" onClick={reintentar}>
                    Reintentar
                  </IonButton>
                  {errorInfo.muestraOlvide && (
                    <IonButton size="small" fill="clear" onClick={() => navigate('/recuperar')}>
                      ¿Olvidó contraseña?
                    </IonButton>
                  )}
                </div>
              </div>
            )}

            <IonButton
              expand="block"
              type="submit"
              disabled={!puedeEnviar}
              className="login-button tap-feedback"
              aria-label="Ingresar al POS"
            >
              {loading ? <IonSpinner name="crescent" /> : 'Ingresar'}
            </IonButton>
          </form>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default Login;
