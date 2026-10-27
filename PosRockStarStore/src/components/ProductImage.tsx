import { useState, useEffect, useRef, useCallback } from 'react';
import { IonIcon, IonButton } from '@ionic/react';
import { imageOutline } from 'ionicons/icons';

interface ProductImageProps {
  src: string | null;
  alt: string;
  className?: string;
}

const SHIMMER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" preserveAspectRatio="none">
  <defs>
    <linearGradient id="shimmer" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#333"/>
      <stop offset="50%" stop-color="#444"/>
      <stop offset="100%" stop-color="#333"/>
    </linearGradient>
    <animate id="shimmerAnim" attributeName="x1" values="-1;1" dur="1.5s" repeatCount="indefinite"/>
    <animate attributeName="x2" values="0;2" dur="1.5s" repeatCount="indefinite"/>
  </defs>
  <rect width="100%" height="100%" fill="url(#shimmer)"/>
</svg>`;

const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
  <circle cx="8.5" cy="8.5" r="1.5"/>
  <path d="M21 15l-5-5L5 17"/>
</svg>`;

const ERROR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
  <path d="M13 9h.01M17 15h.01M9 9h.01M9 13h.01"/>
</svg>`;

export const ProductImage: React.FC<ProductImageProps> = ({ src, alt, className = '' }) => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const imgRef = useRef<HTMLImageElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const MAX_RETRIES = 3;
  const BASE_DELAY = 500;

  const loadImage = useCallback(() => {
    if (!src) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);
    const img = new Image();
    img.onload = () => {
      setImageSrc(src);
      setLoading(false);
    };
    img.onerror = () => {
      handleError();
    };
    img.src = src;
  }, [src]);

  const handleError = useCallback(() => {
    if (retryCount < MAX_RETRIES) {
      const delay = BASE_DELAY * Math.pow(2, retryCount);
      retryTimeoutRef.current = setTimeout(() => {
        setRetryCount(prev => prev + 1);
        loadImage();
      }, delay);
    } else {
      setError(true);
      setLoading(false);
    }
  }, [retryCount, loadImage]);

  const handleManualRetry = useCallback(() => {
    setRetryCount(0);
    loadImage();
  }, [loadImage]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el || !src || imageSrc) return;

    // Sin IntersectionObserver (SSR/tests): cargar de inmediato.
    if (typeof IntersectionObserver === 'undefined') {
      loadImage();
      return;
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            loadImage();
            observerRef.current?.unobserve(el);
          }
        });
      },
      { rootMargin: '100px', threshold: 0.01 }
    );

    observerRef.current.observe(el);

    return () => {
      observerRef.current?.disconnect();
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [src, imageSrc, loadImage]);

  const renderShimmer = () => (
    <div ref={boxRef} className={`product-image-shimmer ${className}`} style={{ width: '100%', aspectRatio: '1 / 1' }}>
      <div
        dangerouslySetInnerHTML={{ __html: SHIMMER_SVG }}
        style={{ width: '100%', height: '100%' }}
        aria-hidden="true"
      />
    </div>
  );

  const renderPlaceholder = () => (
    <div className={`product-image-placeholder ${className}`} style={{ width: '100%', aspectRatio: '1 / 1', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#2a2a2a', borderRadius: '8px' }}>
      <IonIcon icon={imageOutline} className="placeholder-icon" style={{ fontSize: '48px', color: 'var(--ion-color-medium)' }} />
    </div>
  );

  const renderErrorState = () => (
    <div className={`product-image-error ${className}`} style={{ width: '100%', aspectRatio: '1 / 1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#2a2a2a', borderRadius: '8px', padding: '16px', gap: '8px' }}>
      <div
        dangerouslySetInnerHTML={{ __html: ERROR_SVG }}
        style={{ width: '48px', height: '48px', color: 'var(--ion-color-danger)' }}
      />
      <span style={{ fontSize: '0.75rem', color: 'var(--ion-color-medium)', textAlign: 'center' }}>Sin imagen</span>
      <IonButton fill="outline" size="small" onClick={handleManualRetry} disabled={loading}>
        Reintentar
      </IonButton>
    </div>
  );

  const renderLoadedImage = () => {
    if (!imageSrc) return null;
    return (
      <picture className={`product-image-loaded ${className}`} style={{ width: '100%', aspectRatio: '1 / 1', borderRadius: '8px', overflow: 'hidden' }}>
        <source type="image/webp" srcSet={imageSrc} />
        <img
          ref={imgRef}
          src={imageSrc}
          alt={alt}
          style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'opacity 0.3s ease' }}
          loading="lazy"
        />
      </picture>
    );
  };

  if (!src) {
    return renderPlaceholder();
  }

  if (loading && !imageSrc) {
    return renderShimmer();
  }

  if (error) {
    return renderErrorState();
  }

  return renderLoadedImage();
};

export default ProductImage;