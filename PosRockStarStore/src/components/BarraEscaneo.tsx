import { IonButton, IonIcon } from '@ionic/react';
import { useId, useMemo, useRef, useState } from 'react';
import { qrCodeOutline, searchOutline } from 'ionicons/icons';
import { ArticuloCatalogo, getImageUrl } from '../lib/api';
import { buscarEnCatalogo, porSku } from '../utils/busqueda';
import { formatCLP } from '../utils/format';
import { ProductImage } from './ProductImage';
import type { ResultadoLectura } from './EscanerCamara';

const MAX_RESULTADOS = 8;

interface Props {
  catalogo: ArticuloCatalogo[];
  cantidadEnVenta: (idVariante: number) => number;
  /** Codigo que no es un SKU del catalogo (por ejemplo un EAN-13): lo resuelve el backend. */
  onCodigo: (codigo: string) => Promise<ResultadoLectura>;
  onElegir: (item: ArticuloCatalogo) => ResultadoLectura;
  onResultado: (resultado: ResultadoLectura) => void;
  onAbrirCamara: () => void;
}

/**
 * Barra de la caja: recibe la pistola USB (escribe el codigo y Enter), el codigo escrito
 * a mano, y busca en el catalogo por nombre, banda, color, talla o SKU.
 */
export const BarraEscaneo: React.FC<Props> = ({ catalogo, cantidadEnVenta, onCodigo, onElegir, onResultado, onAbrirCamara }) => {
  const [texto, setTexto] = useState('');
  const [abierta, setAbierta] = useState(false);
  const [activo, setActivo] = useState(-1);
  const [buscando, setBuscando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const idLista = useId();

  const resultados = useMemo(() => buscarEnCatalogo(catalogo, texto), [catalogo, texto]);
  const visibles = resultados.slice(0, MAX_RESULTADOS);
  const mostrarLista = abierta && texto.trim() !== '';

  const limpiar = () => {
    setTexto('');
    setAbierta(false);
    setActivo(-1);
    inputRef.current?.focus();
  };

  const elegir = (item: ArticuloCatalogo) => {
    const resultado = onElegir(item);
    onResultado(resultado);
    if (resultado.ok) limpiar();
  };

  /**
   * Enter: la opcion marcada con las flechas; si no, el SKU exacto (QR o pistola) o la
   * unica coincidencia; con varias se pide elegir; sin ninguna es un codigo de barras.
   */
  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (buscando || !texto.trim()) return;
    if (mostrarLista && activo >= 0 && visibles[activo]) return elegir(visibles[activo]);
    const exacto = porSku(catalogo, texto);
    if (exacto) return elegir(exacto);
    if (resultados.length === 1) return elegir(resultados[0]);
    if (resultados.length > 1) {
      setAbierta(true);
      onResultado({ ok: false, mensaje: `Hay ${resultados.length} productos que coinciden: elige uno de la lista.` });
      return;
    }
    setBuscando(true);
    try {
      const resultado = await onCodigo(texto);
      onResultado(resultado);
      if (resultado.ok) limpiar();
    } finally {
      setBuscando(false);
    }
  };

  const teclas = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && visibles.length > 0) {
      e.preventDefault();
      setAbierta(true);
      setActivo((i) => Math.min(i + 1, visibles.length - 1));
    } else if (e.key === 'ArrowUp' && visibles.length > 0) {
      e.preventDefault();
      setActivo((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Escape') {
      setAbierta(false);
      setActivo(-1);
    }
  };

  return (
    <form className="scan-bar" onSubmit={enviar} role="search">
      <div className="buscador">
        <label className="scan-campo">
          <IonIcon icon={searchOutline} aria-hidden="true" />
          <input
            ref={inputRef}
            className="scan-input"
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setAbierta(true);
              setActivo(-1);
            }}
            onKeyDown={teclas}
            onFocus={() => setAbierta(true)}
            onBlur={() => setAbierta(false)}
            placeholder="Escanea o busca un producto por nombre, banda o SKU"
            aria-label="Buscar o escanear producto"
            role="combobox"
            aria-expanded={mostrarLista}
            aria-controls={idLista}
            aria-autocomplete="list"
            aria-activedescendant={mostrarLista && activo >= 0 ? `${idLista}-${activo}` : undefined}
            autoComplete="off"
            spellCheck={false}
            autoFocus
          />
        </label>

        {mostrarLista && (
          <ul className="buscador-lista" id={idLista} role="listbox" aria-label="Productos encontrados">
            {visibles.map((item, i) => {
              const enVenta = cantidadEnVenta(item.idVariante);
              const sinStock = item.disponible === 0;
              return (
                <li
                  key={item.idVariante}
                  id={`${idLista}-${i}`}
                  role="option"
                  aria-selected={i === activo}
                  aria-disabled={sinStock}
                  className={`buscador-opcion${i === activo ? ' activa' : ''}${sinStock ? ' sin-stock' : ''}`}
                  // Sin esto el input pierde el foco y la lista se cierra antes del clic.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => elegir(item)}
                >
                  <div className="buscador-thumb">
                    <ProductImage src={getImageUrl(item)} alt="" />
                  </div>
                  <div className="buscador-info">
                    <strong>{item.producto}</strong>
                    <span>{[item.banda, item.color, item.talla].filter(Boolean).join(' · ')} · SKU {item.sku}</span>
                  </div>
                  <div className="buscador-datos">
                    <strong>{formatCLP(item.precio)}</strong>
                    {sinStock ? <span className="buscador-sin-stock">Sin stock</span> : <span>Disp: {item.disponible}</span>}
                    {enVenta > 0 && <span className="buscador-en-venta">En la venta: {enVenta}</span>}
                  </div>
                </li>
              );
            })}
            {visibles.length === 0 && (
              <li className="buscador-vacio" role="presentation">
                Sin coincidencias. Presiona Enter para buscarlo como código de barras.
              </li>
            )}
            {resultados.length > visibles.length && (
              <li className="buscador-mas" role="presentation">
                Y {resultados.length - visibles.length} más: sigue escribiendo para afinar.
              </li>
            )}
          </ul>
        )}
      </div>

      <IonButton type="submit" fill="outline" disabled={!texto.trim() || buscando} className="scan-agregar">
        Agregar
      </IonButton>
      <IonButton onClick={onAbrirCamara} className="scan-camara">
        <IonIcon icon={qrCodeOutline} slot="start" />
        Escanear con cámara
      </IonButton>
    </form>
  );
};
