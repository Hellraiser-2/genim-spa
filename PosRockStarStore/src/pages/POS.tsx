import {
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
  IonButtons,
  IonButton,
  IonIcon,
  IonBadge,
  IonGrid,
  IonRow,
  IonCol,
  IonCard,
  IonCardContent,
  IonItem,
  IonLabel,
  IonInput,
  IonSpinner,
  IonAlert,
  IonModal,
  IonList,
  IonText,
  IonSegment,
  IonSegmentButton,
  IonToast,
} from '@ionic/react';
import { useAuth } from '../contexts/AuthContext';
import { getCatalogo, ArticuloCatalogo, registrarVentaPos, getVentasPos, ComprobantePos, ErrorApi, LineaEnBodega, MedioPresencial, getImageUrl, buscarPorCodigo } from '../lib/api';
import { useState, useEffect, useMemo, useRef } from 'react';
import { cartOutline, logOutOutline, refreshOutline, receiptOutline, addOutline, removeOutline, warningOutline, checkmarkCircleOutline, closeCircleOutline, cardOutline, walletOutline, printOutline, timeOutline, listOutline, homeOutline, personCircleOutline } from 'ionicons/icons';
import { formatCLP } from '../utils/format';
import { ProductImage } from '../components/ProductImage';
import { EmptyState, ErrorAlert, SkeletonGrid } from '../components/FeedbackStates';
import { EscanerCamara, ResultadoLectura } from '../components/EscanerCamara';
import { BarraEscaneo } from '../components/BarraEscaneo';
import { porSku } from '../utils/busqueda';
import { CobroEnMaquina } from '../components/CobroEnMaquina';
import { SelectorPago } from '../components/SelectorPago';
import { CierreCajaModal } from '../components/CierreCajaModal';
import { AjustesMaquina } from '../components/AjustesMaquina';
import { CobroMaquina, ConfigMaquina, guardarConfigMaquina, leerConfigMaquina, maquinaHttp, pagoParaVenta, tipoTarjeta } from '../lib/terminal';

const POS: React.FC = () => {
  const { vendedor, logout, cliente, setCliente } = useAuth();
  const [catalogo, setCatalogo] = useState<ArticuloCatalogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showError, setShowError] = useState(false);
  const [carrito, setCarrito] = useState<Map<number, number>>(new Map());
  const [showBoleta, setShowBoleta] = useState(false);
  const [boletaData, setBoletaData] = useState<any>(null);
  const [identificandoCliente, setIdentificandoCliente] = useState(false);
  const [clienteEmail, setClienteEmail] = useState('');
  const [clientePassword, setClientePassword] = useState('');
  const [clienteLoading, setClienteLoading] = useState(false);
  const [clienteError, setClienteError] = useState<string | null>(null);
  
  // Checkout flow states
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [showCheckoutError, setShowCheckoutError] = useState(false);
  const [medioPago, setMedioPago] = useState<MedioPresencial>('EFECTIVO');
  const [showMedioPagoModal, setShowMedioPagoModal] = useState(false);
  // Efectivo: lo que entrega el cliente, para el vuelto. Transferencia: su numero de operacion.
  const [montoRecibido, setMontoRecibido] = useState<number | null>(null);
  const [numeroOperacion, setNumeroOperacion] = useState('');
  const [showCierreCaja, setShowCierreCaja] = useState(false);
  // Clave de la venta en curso. En un ref y no en estado: al anular un cobro y seguir en
  // el mismo clic, la venta debe salir con la clave nueva, no con la del render anterior.
  const claveVenta = useRef('');
  // Lineas que la sala de ventas no alcanza: se pide confirmar el retiro desde bodega.
  const [lineasEnBodega, setLineasEnBodega] = useState<LineaEnBodega[] | null>(null);

  // Jornada register
  const [showRegistro, setShowRegistro] = useState(false);
  const [registroVentas, setRegistroVentas] = useState<ComprobantePos[]>([]);
  const [registroLoading, setRegistroLoading] = useState(false);

  // Escaneo: camara, pistola USB (escribe el codigo y Enter) o busqueda en la barra.
  const [showEscaner, setShowEscaner] = useState(false);
  const [aviso, setAviso] = useState<ResultadoLectura | null>(null);
  // La ultima prenda sumada se destaca en la grilla de la venta.
  const [ultimoAgregado, setUltimoAgregado] = useState<number | null>(null);
  // Lecturas seguidas llegan antes de que React vuelva a renderizar: se leen de aqui.
  const catalogoRef = useRef(catalogo);
  catalogoRef.current = catalogo;
  const carritoRef = useRef(carrito);
  carritoRef.current = carrito;

  // Maquina de cobro de esta caja.
  const [configMaquina, setConfigMaquina] = useState<ConfigMaquina>(leerConfigMaquina);
  const maquina = useMemo(() => maquinaHttp(configMaquina.direccion), [configMaquina.direccion]);
  const [showAjustesMaquina, setShowAjustesMaquina] = useState(false);
  const [showCobroMaquina, setShowCobroMaquina] = useState(false);
  // Cobro aprobado en la maquina cuya venta aun no queda registrada. Si la venta no se
  // registra, se anula: el cliente no puede quedar cobrado sin venta.
  const [cobroAprobado, setCobroAprobado] = useState<CobroMaquina | null>(null);

  useEffect(() => {
    cargarCatalogo();
    // Health-check del backend al abrir el POS (no bloquea la UI).
    import('../lib/api')
      .then((m) => m.salud())
      .catch(() => false);
  }, []);

  const cargarCatalogo = async () => {
    try {
      setLoading(true);
      const data = await getCatalogo();
      setCatalogo(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar catálogo');
      setShowError(true);
    } finally {
      setLoading(false);
    }
  };

  const agregarAlCarrito = (idVariante: number, disponible: number) => {
    const cantidadActual = carrito.get(idVariante) || 0;
    if (cantidadActual < disponible) {
      const nuevoCarrito = new Map(carrito);
      nuevoCarrito.set(idVariante, cantidadActual + 1);
      setCarrito(nuevoCarrito);
    }
  };

  const quitarDelCarrito = (idVariante: number) => {
    const cantidadActual = carrito.get(idVariante) || 0;
    if (cantidadActual > 1) {
      const nuevoCarrito = new Map(carrito);
      nuevoCarrito.set(idVariante, cantidadActual - 1);
      setCarrito(nuevoCarrito);
    } else if (cantidadActual === 1) {
      const nuevoCarrito = new Map(carrito);
      nuevoCarrito.delete(idVariante);
      setCarrito(nuevoCarrito);
    }
  };

  /** Suma una unidad de la prenda a la venta, sin pasar del stock disponible. */
  const agregarItem = (item: ArticuloCatalogo): ResultadoLectura => {
    const nombre = `${item.producto} (${item.talla}/${item.color})`;
    const enCarrito = carritoRef.current.get(item.idVariante) ?? 0;
    if (item.disponible === 0) return { ok: false, mensaje: `${nombre} no tiene stock.` };
    if (enCarrito >= item.disponible) {
      return { ok: false, mensaje: `Ya están en el carrito las ${item.disponible} unidades disponibles de ${nombre}.` };
    }
    const nuevoCarrito = new Map(carritoRef.current);
    nuevoCarrito.set(item.idVariante, enCarrito + 1);
    carritoRef.current = nuevoCarrito;
    setCarrito(nuevoCarrito);
    setUltimoAgregado(item.idVariante);
    return { ok: true, mensaje: `Agregado: ${nombre} · ${enCarrito + 1} en el carrito` };
  };

  /**
   * Agrega la prenda de una etiqueta. El QR lleva el SKU, que se busca en el catalogo
   * cargado; el codigo de barras se resuelve en el backend.
   */
  const agregarPorCodigo = async (codigoLeido: string): Promise<ResultadoLectura> => {
    const codigo = codigoLeido.trim();
    if (!codigo) return { ok: false, mensaje: 'Escanea o escribe un código.' };

    const item = porSku(catalogoRef.current, codigo);
    if (item) return agregarItem(item);
    if (!vendedor) return { ok: false, mensaje: 'Inicia sesión para escanear.' };
    try {
      const variante = await buscarPorCodigo(vendedor.accessToken, codigo);
      const aLaVenta = catalogoRef.current.find(p => p.idVariante === variante.idVariante);
      if (!aLaVenta) {
        return { ok: false, mensaje: `${variante.producto} (${variante.talla}/${variante.color}) no está a la venta: aún no tiene precio.` };
      }
      return agregarItem(aLaVenta);
    } catch (err) {
      if (err instanceof ErrorApi && err.status === 404) {
        return { ok: false, mensaje: `El código ${codigo} no está registrado.` };
      }
      return { ok: false, mensaje: err instanceof Error ? err.message : 'No se pudo buscar el código.' };
    }
  };

  /** Lo que se esta vendiendo, lo ultimo agregado primero. */
  const productosVenta = Array.from(carrito.keys())
    .reverse()
    .map(id => catalogo.find(p => p.idVariante === id))
    .filter((p): p is ArticuloCatalogo => p !== undefined);

  const getCantidad = (idVariante: number) => carrito.get(idVariante) || 0;
  const getDisponible = (idVariante: number) => {
    const item = catalogo.find(p => p.idVariante === idVariante);
    return item?.disponible || 0;
  };

  const total = Array.from(carrito.entries()).reduce((sum, [idVariante, cantidad]) => {
    const item = catalogo.find(p => p.idVariante === idVariante);
    return sum + (item?.precio || 0) * cantidad;
  }, 0);

  const lineasCarrito = Array.from(carrito.entries()).map(([idVariante, cantidad]) => {
    const item = catalogo.find(p => p.idVariante === idVariante);
    return {
      ...item!,
      cantidad,
      subtotal: (item?.precio || 0) * cantidad,
    };
  });

  const hayStockSuficiente = () => {
    for (const [idVariante, cantidad] of carrito.entries()) {
      const disponible = getDisponible(idVariante);
      if (cantidad > disponible) return false;
    }
    return true;
  };

  /** El cliente es opcional: se identifica, si quiere, dentro del cobro. */
  const handleCobrar = () => {
    // Con un cobro ya aprobado se conserva la clave: reintentar no duplica la venta.
    if (!cobroAprobado) {
      claveVenta.current = crypto.randomUUID();
      setMontoRecibido(null);
      setNumeroOperacion('');
    }
    setShowMedioPagoModal(true);
  };

  /**
   * Registra la venta en el backend: descuenta el stock y devuelve el comprobante.
   * `desdeBodega` son las variantes que el vendedor acepto retirar de bodega; `cobro` es
   * el pago aprobado en la maquina, si la venta se cobro en ella.
   */
  const procesarVenta = async (desdeBodega: number[] = [], cobro: CobroMaquina | null = cobroAprobado) => {
    if (!vendedor) return;

    setCheckoutLoading(true);
    setCheckoutError(null);

    try {
      const comprobante = await registrarVentaPos(vendedor.accessToken, {
        claveIdempotencia: claveVenta.current,
        lineas: lineasCarrito.map(l => ({
          idVariante: l.idVariante,
          cantidad: l.cantidad,
          permitirBodega: desdeBodega.includes(l.idVariante),
        })),
        medioPago,
        idCliente: cliente?.usuario.id,
        // La autorizacion queda guardada con la venta en el backend.
        pagoMaquina: cobro ? pagoParaVenta(cobro) : undefined,
        numeroOperacion: medioPago === 'TRANSFERENCIA' && numeroOperacion ? numeroOperacion : undefined,
      });
      mostrarBoleta(comprobante);
      setCobroAprobado(null);
      // El proximo comprador parte sin cliente identificado.
      setCliente(null);
      setCarrito(new Map());
      await cargarCatalogo();
      await cargarRegistro();
    } catch (err) {
      if (err instanceof ErrorApi && err.codigo === 'EXISTENCIA_EN_BODEGA') {
        // La venta no se registro: se pide confirmar y se reenvia con la misma clave.
        setLineasEnBodega(err.detalle as LineaEnBodega[]);
        return;
      }
      const mensaje = err instanceof Error ? err.message : 'Error al registrar la venta';
      if (err instanceof ErrorApi && err.codigo === 'COBRO_YA_USADO') {
        // Ese cobro ya pago otra venta: no se ofrece anularlo ni reintentar con el.
        setCobroAprobado(null);
        setCheckoutError(mensaje + ' Revisa el registro de jornada antes de cobrar de nuevo.');
      } else if (err instanceof ErrorApi && err.codigo === 'STOCK_INSUFICIENTE') {
        setCheckoutError('Sin stock: ' + mensaje);
        await cargarCatalogo();
      } else {
        setCheckoutError(mensaje);
      }
      setShowCheckoutError(true);
    } finally {
      setCheckoutLoading(false);
    }
  };

  const confirmarRetiroBodega = () => {
    const ids = (lineasEnBodega ?? []).map(l => l.idVariante);
    setLineasEnBodega(null);
    procesarVenta(ids);
  };

  // Reintentar usa la misma clave: si el primer envio alcanzo a registrarse, el backend
  // responde esa venta en vez de crear otra.
  const reintentarCheckout = async () => {
    await procesarVenta();
  };

  /** Reversa en la maquina un cobro cuya venta no se va a registrar. Devuelve si se pudo. */
  const anularCobro = async (): Promise<boolean> => {
    const cobro = cobroAprobado;
    if (!cobro) return true;
    try {
      await maquina.anular(cobro.id);
      setCobroAprobado(null);
      setAviso({ ok: true, mensaje: `Cobro de ${formatCLP(cobro.monto)} anulado en la máquina.` });
      return true;
    } catch (err) {
      setCheckoutError(
        `No se pudo anular en la máquina el cobro de ${formatCLP(cobro.monto)} (autorización ${cobro.codigoAutorizacion}). ` +
          (err instanceof Error ? err.message : ''),
      );
      setShowCheckoutError(true);
      return false;
    }
  };

  const alAprobarCobro = (cobro: CobroMaquina) => {
    setShowCobroMaquina(false);
    setCobroAprobado(cobro);
    procesarVenta([], cobro);
  };

  const mostrarBoleta = (comprobante: ComprobantePos) => {
    const pago = comprobante.pagoMaquina;
    const boleta = {
      idVenta: comprobante.idVenta,
      fecha: new Date(comprobante.fecha).toLocaleString('es-CL'),
      vendedor: comprobante.vendedor,
      cliente: comprobante.cliente,
      lineas: comprobante.lineas.map(l => ({
        producto: l.producto,
        color: l.color,
        talla: l.talla,
        cantidad: l.cantidad,
        precioUnitario: l.precioUnitario,
        subtotal: l.subtotal,
        ubicacion: l.ubicacion,
      })),
      total: comprobante.total,
      medioPago: comprobante.medioPago.nombre,
      numeroOperacion: comprobante.numeroOperacion,
      // El vuelto no se guarda: es del momento, para la boleta.
      efectivo: comprobante.medioPago.codigo === 'EFECTIVO' && montoRecibido !== null
        ? { recibido: montoRecibido, vuelto: montoRecibido - comprobante.total }
        : null,
      // Lo que guardo el backend, no lo que dijo la maquina: la boleta refleja el registro.
      pagoMaquina: pago ? { autorizacion: pago.codigoAutorizacion, tarjeta: pago.ultimosDigitos ? `•••• ${pago.ultimosDigitos}` : 'tarjeta' } : null,
      giro: 'Rockstar Store SpA - Gira Musical y Merchandising',
      direccion: 'Av. Principal 123, Santiago, Chile',
      rut: '76.123.456-7',
    };

    setBoletaData(boleta);
    setShowBoleta(true);
    setShowMedioPagoModal(false);
  };

  const imprimirBoleta = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow || !boletaData) return;
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Boleta #${boletaData.idVenta}</title>
        <style>
          body { font-family: monospace; padding: 20px; max-width: 300px; margin: 0 auto; }
          .header { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 10px; margin-bottom: 10px; }
          .info { font-size: 12px; margin-bottom: 10px; }
          .lineas { border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 10px 0; }
          .linea { display: flex; justify-content: space-between; font-size: 12px; margin: 4px 0; }
          .totales { text-align: right; margin-top: 10px; }
          .total { font-size: 16px; font-weight: bold; }
          .giro { text-align: center; font-size: 11px; margin-top: 15px; border-top: 1px dashed #000; padding-top: 10px; }
          @media print { body { padding: 0; } .no-print { display: none; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h2>${boletaData.giro}</h2>
          <p>${boletaData.direccion} | RUT: ${boletaData.rut}</p>
        </div>
        <div class="info">
          <p><strong>BOLETA DE VENTA</strong></p>
          <p>N° ${boletaData.idVenta} | ${boletaData.fecha}</p>
          <p>Vendedor: ${boletaData.vendedor}</p>
          ${boletaData.cliente ? `<p>Cliente: ${boletaData.cliente}</p>` : ''}
        </div>
        <div class="lineas">
          ${boletaData.lineas.map((l: any) => `
            <div class="linea">
              <span>${l.cantidad}x ${l.producto} (${l.talla}/${l.color})</span>
              <span>${formatCLP(l.subtotal)}</span>
            </div>
          `).join('')}
        </div>
        <div class="totales">
          <div class="linea total"><span>TOTAL</span><span>${formatCLP(boletaData.total)}</span></div>
          <div class="linea"><span>Medio de pago</span><span>${boletaData.medioPago}</span></div>
          ${boletaData.pagoMaquina ? `<div class="linea"><span>Autorización</span><span>${boletaData.pagoMaquina.autorizacion} · ${boletaData.pagoMaquina.tarjeta}</span></div>` : ''}
          ${boletaData.numeroOperacion ? `<div class="linea"><span>N° operación</span><span>${boletaData.numeroOperacion}</span></div>` : ''}
          ${boletaData.efectivo ? `<div class="linea"><span>Recibido</span><span>${formatCLP(boletaData.efectivo.recibido)}</span></div><div class="linea"><span>Vuelto</span><span>${formatCLP(boletaData.efectivo.vuelto)}</span></div>` : ''}
        </div>
        <div class="giro">
          <p>${boletaData.giro}</p>
          <p>Comprobante interno, sin validez tributaria</p>
          <p>Gracias por su compra</p>
        </div>
        <button class="no-print" onclick="window.print()" style="margin-top:20px;padding:10px 20px;">Imprimir</button>
        <script>window.onload = () => window.print();</script>
      </body>
      </html>
    `;
    
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const handleLoginCliente = async (e: React.FormEvent) => {
    e.preventDefault();
    setClienteLoading(true);
    setClienteError(null);
    try {
      const { login } = await import('../lib/api');
      const sesion = await login(clienteEmail, clientePassword);
      if (sesion.usuario.rol.toUpperCase() !== 'CLIENTE') {
        throw new Error('La cuenta debe ser de rol CLIENTE');
      }
      setCliente(sesion);
      setIdentificandoCliente(false);
      setClienteEmail('');
      setClientePassword('');
    } catch (err) {
      setClienteError(err instanceof Error ? err.message : 'Error al iniciar sesión');
    } finally {
      setClienteLoading(false);
    }
  };

  const handleCerrarSesion = () => {
    logout();
  };

  const cargarRegistro = async () => {
    if (!vendedor) return;
    try {
      setRegistroLoading(true);
      setRegistroVentas(await getVentasPos(vendedor.accessToken));
    } catch (err) {
      console.error('Error cargando registro:', err);
    } finally {
      setRegistroLoading(false);
    }
  };

  /** Tarjeta que se cobra en la maquina, si esta activa y el medio es debito o credito. */
  const tarjetaEnMaquina = configMaquina.activa ? tipoTarjeta(medioPago) : null;
  /** En efectivo, con un monto recibido menor al total no se puede confirmar. */
  const faltaEfectivo = medioPago === 'EFECTIVO' && montoRecibido !== null && montoRecibido < total;

  const handleMedioPagoConfirmar = async () => {
    let cobro = cobroAprobado;
    // Un cobro aprobado que ya no calza con esta venta (otro monto o medio) se anula antes.
    if (cobro && (cobro.monto !== total || cobro.tipo !== tarjetaEnMaquina)) {
      if (!(await anularCobro())) return;
      cobro = null;
      claveVenta.current = crypto.randomUUID();
    }
    setShowMedioPagoModal(false);
    if (tarjetaEnMaquina && !cobro) {
      setShowCobroMaquina(true);
      return;
    }
    procesarVenta([], cobro);
  };

  const guardarAjustesMaquina = (config: ConfigMaquina) => {
    guardarConfigMaquina(config);
    setConfigMaquina(config);
    setShowAjustesMaquina(false);
    setAviso({ ok: true, mensaje: config.activa ? 'Máquina de cobro activada.' : 'Máquina de cobro desactivada.' });
  };

  if (loading) {
    return (
      <>
        <IonHeader className="pos-toolbar-sticky">
          <IonToolbar color="dark">
            <IonTitle>POS - Rockstar Store</IonTitle>
          </IonToolbar>
        </IonHeader>
        <IonContent className="ion-padding pos-page">
          <div className="pos-header">
            <h2>Productos de la venta</h2>
          </div>
          <SkeletonGrid count={4} />
        </IonContent>
      </>
    );
  }

  return (
    <>
      <IonHeader className="pos-toolbar-sticky">
        <IonToolbar color="dark">
          <IonTitle>POS - Rockstar Store</IonTitle>
          <IonButtons slot="start">
            <IonButton onClick={cargarCatalogo} fill="clear" aria-label="Actualizar catálogo" className="recargar-btn">
              <IonIcon icon={refreshOutline} />
            </IonButton>
            <IonButton onClick={() => setShowCierreCaja(true)} fill="clear" aria-label="Cierre de caja" className="cierre-btn">
              <IonIcon icon={walletOutline} />
            </IonButton>
            <IonButton onClick={() => { setShowRegistro(true); cargarRegistro(); }} fill="clear" aria-label="Registro de jornada" className="registro-btn">
              <IonIcon icon={listOutline} />
            </IonButton>
          </IonButtons>
          <IonButtons slot="end">
            <IonButton
              onClick={() => setShowAjustesMaquina(true)}
              fill="clear"
              aria-label={configMaquina.activa ? 'Máquina de cobro (activa)' : 'Máquina de cobro (desactivada)'}
              className={`maquina-btn${configMaquina.activa ? ' activa' : ''}`}
            >
              <IonIcon icon={cardOutline} />
            </IonButton>
            <IonButton onClick={handleCerrarSesion} fill="clear" aria-label="Cerrar sesión">
              <IonIcon icon={logOutOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding pos-page">
        <div className="pos-header">
          <h2>Productos de la venta</h2>
          <div className="pos-header-datos">
            <button
              type="button"
              className={`maquina-chip${configMaquina.activa ? ' activa' : ''}`}
              onClick={() => setShowAjustesMaquina(true)}
            >
              <IonIcon icon={cardOutline} aria-hidden="true" />
              {configMaquina.activa ? 'Máquina de cobro activa' : 'Activar máquina de cobro'}
            </button>
            <span className="vendedor-nombre">Vendedor: {vendedor?.usuario.nombre}</span>
          </div>
        </div>

        <BarraEscaneo
          catalogo={catalogo}
          cantidadEnVenta={getCantidad}
          onCodigo={agregarPorCodigo}
          onElegir={agregarItem}
          onResultado={setAviso}
          onAbrirCamara={() => setShowEscaner(true)}
        />

        <EscanerCamara isOpen={showEscaner} onClose={() => setShowEscaner(false)} onCodigo={agregarPorCodigo} />

        <IonToast
          isOpen={aviso !== null}
          message={aviso?.mensaje}
          color={aviso?.ok ? 'success' : 'danger'}
          duration={2500}
          position="top"
          onDidDismiss={() => setAviso(null)}
        />

        {error && (
          <ErrorAlert message={error} onRetry={cargarCatalogo} />
        )}

        <IonAlert
          isOpen={showError}
          onDidDismiss={() => setShowError(false)}
          header="Error"
          message={error || 'Error al cargar catálogo'}
          buttons={[{ text: 'Reintentar', handler: () => cargarCatalogo() }, 'OK']}
        />

        <IonAlert
          isOpen={showCheckoutError}
          onDidDismiss={() => setShowCheckoutError(false)}
          header="Error en la venta"
          message={
            (checkoutError || 'Error al procesar la venta') +
            (cobroAprobado
              ? ` El cobro de ${formatCLP(cobroAprobado.monto)} ya está aprobado en la máquina: reintenta para registrar la venta, o anúlalo.`
              : '')
          }
          buttons={[
            { text: 'Reintentar', handler: () => reintentarCheckout() },
            ...(cobroAprobado ? [{ text: 'Anular cobro', role: 'destructive', handler: () => { void anularCobro(); } }] : []),
            'OK'
          ]}
        />

        <IonAlert
          isOpen={lineasEnBodega !== null}
          onDidDismiss={() => setLineasEnBodega(null)}
          header="Retirar desde bodega"
          message={
            'No alcanza en la sala de ventas: ' +
            (lineasEnBodega ?? [])
              .map(l => `${l.producto} talla ${l.talla} (sala ${l.enSala}, bodega ${l.enBodega})`)
              .join('; ') +
            '. ¿Retirar lo que falta desde bodega?' +
            (cobroAprobado ? ' Si cancelas, se anula el cobro en la máquina.' : '')
          }
          buttons={[
            // Sin venta no puede quedar el cobro: cancelar lo anula en la maquina.
            { text: 'Cancelar', role: 'cancel', handler: () => { if (cobroAprobado) void anularCobro(); } },
            { text: 'Retirar de bodega', handler: () => confirmarRetiroBodega() },
          ]}
        />

        <IonGrid>
          <IonRow>
            {productosVenta.map((producto) => (
              <IonCol key={producto.idVariante} size="12" sizeSm="6" sizeMd="4" sizeLg="3" sizeXl="3">
                <ProductCard
                  producto={producto}
                  cantidad={getCantidad(producto.idVariante)}
                  disponible={producto.disponible}
                  destacado={producto.idVariante === ultimoAgregado}
                  onAgregar={() => agregarAlCarrito(producto.idVariante, producto.disponible)}
                  onQuitar={() => quitarDelCarrito(producto.idVariante)}
                />
              </IonCol>
            ))}
          </IonRow>
        </IonGrid>

        {!error && catalogo.length > 0 && productosVenta.length === 0 && (
          <EmptyState
            title="Escanea un producto"
            copy="Pasa la etiqueta por la cámara o la pistola, o búscalo por nombre en la barra de arriba."
            ctaLabel="Escanear con cámara"
            onCta={() => setShowEscaner(true)}
            className="venta-vacia"
          />
        )}

        {!error && catalogo.length === 0 && (
          <EmptyState
            title="Catálogo vacío"
            copy="No hay productos disponibles. Intenta recargar el catálogo."
            ctaLabel="Recargar catálogo"
            onCta={cargarCatalogo}
          />
        )}

        <div className="carrito-panel">
          <div className="carrito-header">
            <h3>Detalle de compra</h3>
            <IonBadge color="primary">{carrito.size} items</IonBadge>
          </div>
          {lineasCarrito.length === 0 ? (
            <EmptyState
              title="Carrito vacío"
              copy="Agrega productos para empezar"
              className="carrito-vacio"
              compact
              onCta={() => document.querySelector('.pos-header')?.scrollIntoView({ behavior: 'smooth' })}
            />
          ) : (
            <>
              <IonList lines="inset">
                {lineasCarrito.map((linea) => (
                  <IonItem key={linea.idVariante} lines="none">
                    <IonLabel>
                      <div className="linea-info">
                        <strong>{linea.producto}</strong>
                        <span>{linea.banda} · {linea.color} · {linea.talla}</span>
                      </div>
                      <div className="linea-cantidades">
                        <span>{linea.cantidad} × {formatCLP(linea.precio)}</span>
                        <strong>{formatCLP(linea.subtotal)}</strong>
                      </div>
                    </IonLabel>
                  </IonItem>
                ))}
              </IonList>
              <div className="carrito-total">
                <span>Total</span>
                <strong>{formatCLP(total)}</strong>
              </div>
            </>
          )}
          <IonButton
            expand="block"
            color="primary"
            size="large"
            onClick={handleCobrar}
            disabled={carrito.size === 0 || !hayStockSuficiente() || checkoutLoading}
            className="cobrar-button"
          >
            {checkoutLoading ? <IonSpinner name="crescent" slot="start" /> : <IonIcon icon={cartOutline} slot="start" />}
            {checkoutLoading ? 'Procesando...' : `Cobrar ${formatCLP(total)}`}
          </IonButton>
          {!hayStockSuficiente() && carrito.size > 0 && (
            <IonText color="danger">
              <p className="stock-warning">
                <IonIcon icon={warningOutline} /> Algunos productos superan el stock disponible
              </p>
            </IonText>
          )}
        </div>

        {/* Modal medio de pago */}
        <IonModal
          isOpen={showMedioPagoModal}
          onDidDismiss={() => {
            setShowMedioPagoModal(false);
            setIdentificandoCliente(false);
          }}
          className="pos-modal-centered cobro-modal"
          backdropDismiss={true}
          showBackdrop={true}
          aria-label="Cobrar venta"
        >
          <IonHeader>
            <IonToolbar color="dark">
              <IonTitle>Cobrar venta</IonTitle>
              <IonButtons slot="end">
                <IonButton onClick={() => setShowMedioPagoModal(false)} fill="clear" aria-label="Cerrar cobro">
                  <IonIcon icon={closeCircleOutline} />
                </IonButton>
              </IonButtons>
            </IonToolbar>
          </IonHeader>
          <IonContent className="ion-padding">
            <div className="cobro-total">
              <span>Total</span>
              <strong>{formatCLP(total)}</strong>
            </div>

            <div className="cobro-cliente">
              <IonIcon icon={personCircleOutline} aria-hidden="true" />
              {cliente ? (
                <>
                  <span>Cliente: <strong>{cliente.usuario.nombre}</strong></span>
                  <IonButton fill="clear" size="small" onClick={() => setCliente(null)}>Quitar</IonButton>
                </>
              ) : (
                <>
                  <span>Venta sin cliente <small>(opcional)</small></span>
                  {!identificandoCliente && (
                    <IonButton fill="clear" size="small" onClick={() => { setClienteError(null); setIdentificandoCliente(true); }}>
                      Identificar cliente
                    </IonButton>
                  )}
                </>
              )}
            </div>

            {/* Dentro del cobro y no en otro modal: dos modales apilados se disputan el foco. */}
            {!cliente && identificandoCliente && (
              <form className="cliente-form" onSubmit={handleLoginCliente} aria-label="Identificar cliente">
                <IonItem>
                  <IonInput
                    id="cliente-email"
                    label="Correo cliente"
                    labelPlacement="stacked"
                    type="email"
                    autocomplete="off"
                    value={clienteEmail}
                    onIonChange={(e: any) => setClienteEmail(e.detail.value || '')}
                    disabled={clienteLoading}
                  />
                </IonItem>
                <IonItem>
                  <IonInput
                    id="cliente-password"
                    label="Contraseña"
                    labelPlacement="stacked"
                    type="password"
                    value={clientePassword}
                    onIonChange={(e: any) => setClientePassword(e.detail.value || '')}
                    disabled={clienteLoading}
                  />
                </IonItem>
                {clienteError && <IonText color="danger"><p>{clienteError}</p></IonText>}
                <div className="cliente-form-acciones">
                  <IonButton fill="clear" color="medium" onClick={() => setIdentificandoCliente(false)} disabled={clienteLoading}>
                    Cancelar
                  </IonButton>
                  <IonButton type="submit" disabled={clienteLoading}>
                    {clienteLoading ? <IonSpinner name="crescent" /> : 'Continuar'}
                  </IonButton>
                </div>
              </form>
            )}

            <h3 className="cobro-subtitulo">Medio de pago</h3>
            <SelectorPago
              total={total}
              medio={medioPago}
              onMedio={setMedioPago}
              maquinaActiva={configMaquina.activa}
              recibido={montoRecibido}
              onRecibido={setMontoRecibido}
              numeroOperacion={numeroOperacion}
              onNumeroOperacion={setNumeroOperacion}
            />
            <IonButton
              expand="block"
              color="primary"
              onClick={() => void handleMedioPagoConfirmar()}
              disabled={checkoutLoading || faltaEfectivo}
              className="mt-16 confirmar-cobro"
            >
              {checkoutLoading ? (
                <IonSpinner name="crescent" />
              ) : tarjetaEnMaquina && !cobroAprobado ? (
                <>
                  <IonIcon icon={cardOutline} slot="start" />
                  Cobrar {formatCLP(total)} en la máquina
                </>
              ) : medioPago === 'TRANSFERENCIA' ? (
                'Transferencia recibida: confirmar'
              ) : (
                'Confirmar y pagar'
              )}
            </IonButton>
          </IonContent>
        </IonModal>

        <CobroEnMaquina
          isOpen={showCobroMaquina}
          maquina={maquina}
          monto={total}
          tarjeta={tipoTarjeta(medioPago) ?? 'DEBITO'}
          referencia={claveVenta.current}
          onAprobado={alAprobarCobro}
          onCerrar={() => {
            setShowCobroMaquina(false);
            setShowMedioPagoModal(true);
          }}
          onSinMaquina={() => {
            setShowCobroMaquina(false);
            procesarVenta([], null);
          }}
        />

        {vendedor && (
          <CierreCajaModal
            isOpen={showCierreCaja}
            accessToken={vendedor.accessToken}
            onClose={() => setShowCierreCaja(false)}
            onCerrada={(cierre) => {
              setAviso({ ok: true, mensaje: `Caja cerrada: ${cierre.ventas} ventas por ${formatCLP(cierre.total)}.` });
              void cargarRegistro();
            }}
          />
        )}

        <AjustesMaquina
          isOpen={showAjustesMaquina}
          config={configMaquina}
          onGuardar={guardarAjustesMaquina}
          onClose={() => setShowAjustesMaquina(false)}
        />

        {/* Modal Boleta */}
        <IonModal
          isOpen={showBoleta}
          onDidDismiss={() => setShowBoleta(false)}
          className="boleta-modal pos-modal-centered"
          backdropDismiss={true}
          showBackdrop={true}
          aria-label="Boleta de venta"
        >
          <IonHeader>
            <IonToolbar color="dark">
              <IonTitle>Boleta de Venta</IonTitle>
              <IonButtons slot="end">
                <IonButton onClick={imprimirBoleta} fill="clear" aria-label="Imprimir boleta" className="boleta-imprimir-btn">
                  <IonIcon icon={printOutline} />
                </IonButton>
                <IonButton onClick={() => setShowBoleta(false)} fill="clear" aria-label="Cerrar boleta" className="boleta-cerrar-btn">
                  <IonIcon icon={closeCircleOutline} />
                </IonButton>
              </IonButtons>
            </IonToolbar>
          </IonHeader>
          <IonContent className="ion-padding boleta-content boleta-print">
            {boletaData && (
              <>
                <div className="boleta-header">
                  <h3>{boletaData.giro}</h3>
                  <p>{boletaData.direccion} | RUT: {boletaData.rut}</p>
                </div>
                <div className="boleta-info">
                  <div><strong>Boleta N°</strong><span>{boletaData.idVenta}</span></div>
                  <div><strong>Fecha</strong><span>{boletaData.fecha}</span></div>
                  <div><strong>Vendedor</strong><span>{boletaData.vendedor}</span></div>
                  {boletaData.cliente && <div><strong>Cliente</strong><span>{boletaData.cliente}</span></div>}
                  <div><strong>Medio de pago</strong><span>{boletaData.medioPago}</span></div>
                  {boletaData.numeroOperacion && <div><strong>N° operación</strong><span>{boletaData.numeroOperacion}</span></div>}
                  {boletaData.efectivo && (
                    <>
                      <div><strong>Recibido</strong><span>{formatCLP(boletaData.efectivo.recibido)}</span></div>
                      <div><strong>Vuelto</strong><span>{formatCLP(boletaData.efectivo.vuelto)}</span></div>
                    </>
                  )}
                  {boletaData.pagoMaquina && (
                    <div><strong>Autorización</strong><span>{boletaData.pagoMaquina.autorizacion} · {boletaData.pagoMaquina.tarjeta}</span></div>
                  )}
                </div>
                <div className="boleta-lineas">
                  <div className="boleta-linea">
                    <span>Producto</span>
                    <span>Cant.</span>
                    <span>P. Unit.</span>
                    <span>Subtotal</span>
                  </div>
                  {boletaData.lineas.map((l: any) => (
                    <div key={l.producto + l.talla + l.color + l.ubicacion} className="boleta-linea">
                      <span>{l.producto} ({l.talla}/{l.color}){l.ubicacion === 'BODEGA' && ' · bodega'}</span>
                      <span>{l.cantidad}</span>
                      <span>{formatCLP(l.precioUnitario)}</span>
                      <span>{formatCLP(l.subtotal)}</span>
                    </div>
                  ))}
                </div>
                <div className="boleta-totales">
                  <div className="linea total"><span>TOTAL</span><span>{formatCLP(boletaData.total)}</span></div>
                </div>
                <div className="boleta-giro">
                  <p>{boletaData.giro}</p>
                  <p className="boleta-no-tributaria">Comprobante interno, sin validez tributaria</p>
                  <p>Gracias por su compra</p>
                </div>
              </>
            )}
          </IonContent>
        </IonModal>

        {/* Modal Registro de Jornada */}
        <IonModal
          isOpen={showRegistro}
          onDidDismiss={() => setShowRegistro(false)}
          className="registro-modal pos-modal-centered"
          backdropDismiss={true}
          showBackdrop={true}
          aria-label="Registro de jornada"
        >
          <IonHeader>
            <IonToolbar color="dark">
              <IonTitle>Registro de Jornada</IonTitle>
              <IonButtons slot="end">
                <IonButton onClick={() => { setShowRegistro(false); cargarRegistro(); }} fill="clear">
                  <IonIcon icon={refreshOutline} />
                </IonButton>
                <IonButton onClick={() => setShowRegistro(false)} fill="clear">
                  <IonIcon icon={closeCircleOutline} />
                </IonButton>
              </IonButtons>
            </IonToolbar>
          </IonHeader>
          <IonContent className="ion-padding registro-page">
            {registroLoading ? (
              <IonSpinner name="crescent" />
            ) : (
              <>
                <div className="registro-stats">
                  <div className="stat-card">
                    <div className="stat-value">{registroVentas.length}</div>
                    <div className="stat-label">Ventas</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value">
                      {formatCLP(registroVentas.reduce((sum, v) => sum + v.total, 0))}
                    </div>
                    <div className="stat-label">Total Recaudado</div>
                  </div>
                </div>
                <IonList lines="inset">
                  {registroVentas.map((venta) => (
                    <IonItem key={venta.idVenta} className="venta-item">
                      <div className="venta-header">
                        <div className="venta-info">
                          <h4>Venta #{venta.idVenta}</h4>
                          <p>{new Date(venta.fecha).toLocaleString('es-CL')}</p>
                        </div>
                        <div className="venta-total">
                          <div className="monto">{formatCLP(venta.total)}</div>
                          <div className="medio">{venta.medioPago.nombre}</div>
                        </div>
                      </div>
                      <div className="venta-detalle">
                        <span className="estado-badge estado-pagado">PAGADA</span>
                        {venta.pagoMaquina && (
                          <span className="venta-autorizacion">
                            Autorización {venta.pagoMaquina.codigoAutorizacion}
                            {venta.pagoMaquina.ultimosDigitos && ` · •••• ${venta.pagoMaquina.ultimosDigitos}`}
                          </span>
                        )}
                      </div>
                    </IonItem>
                  ))}
                  {registroVentas.length === 0 && (
                    <IonItem lines="none">
                      <IonLabel>No hay ventas registradas en esta jornada</IonLabel>
                    </IonItem>
                  )}
                </IonList>
              </>
            )}
          </IonContent>
        </IonModal>
      </IonContent>
    </>
  );
};

interface ProductCardProps {
  producto: ArticuloCatalogo;
  cantidad: number;
  disponible: number;
  /** La ultima prenda escaneada o agregada. */
  destacado?: boolean;
  onAgregar: () => void;
  onQuitar: () => void;
}

const ProductCard: React.FC<ProductCardProps> = ({ producto, cantidad, disponible, destacado = false, onAgregar, onQuitar }) => {
  const sinStock = disponible === 0;
  const enTope = cantidad >= disponible;

  return (
    <IonCard className={`product-card interactive-hover tap-feedback anim-fade-in ${sinStock ? 'sin-stock' : ''} ${enTope && cantidad > 0 ? 'en-tope' : ''} ${destacado ? 'recien-agregado' : ''}`}>
      <IonCardContent>
        <div className="product-image">
          <ProductImage src={getImageUrl(producto)} alt={producto.producto} />
          {sinStock && <span className="sin-stock-badge">Sin stock</span>}
          {disponible > 0 && disponible <= 5 && cantidad === 0 && (
            <span className="ultimas-unidades-badge">Últimas {disponible} unidades</span>
          )}
        </div>
        <div className="product-info">
          <h4>{producto.producto}</h4>
          <p className="product-detail">{producto.banda} · {producto.color} · {producto.talla}</p>
          <p className="product-sku">SKU: {producto.sku}</p>
        </div>
        <div className="product-price">
          <span className="price">{formatCLP(producto.precio)}</span>
          <span className="stock">Disp: {disponible}</span>
        </div>
        <div className="product-stepper">
          <IonButton
            fill="outline"
            size="small"
            onClick={onQuitar}
            disabled={cantidad === 0}
            aria-label="Quitar"
          >
            <IonIcon icon={removeOutline} />
          </IonButton>
          <span className="cantidad">{cantidad}</span>
          <IonButton
            fill="outline"
            size="small"
            onClick={onAgregar}
            disabled={sinStock || enTope}
            aria-label="Agregar"
          >
            <IonIcon icon={addOutline} />
          </IonButton>
        </div>
      </IonCardContent>
    </IonCard>
  );
};

export default POS;
