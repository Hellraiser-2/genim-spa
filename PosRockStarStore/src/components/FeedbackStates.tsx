import { IonButton, IonIcon } from '@ionic/react';
import { alertCircleOutline, bagOutline, refreshOutline } from 'ionicons/icons';

interface EmptyStateProps {
  title?: string;
  copy?: string;
  ctaLabel?: string;
  onCta?: () => void;
  className?: string;
  compact?: boolean;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'Sin resultados',
  copy = 'Agrega productos para empezar',
  ctaLabel,
  onCta,
  className = '',
  compact = false,
}) => {
  if (compact) {
    return (
      <div
        className={`empty-state empty-state-compact anim-fade-in ${className}`}
        data-testid="empty-state"
        style={{ padding: '8px 4px' }}
      >
        <p style={{ margin: 0, fontSize: '0.9rem' }}>
          <strong>{title}</strong> — {copy}
        </p>
      </div>
    );
  }
  return (
    <div className={`empty-state anim-fade-in ${className}`} data-testid="empty-state">
    <svg viewBox="0 0 96 96" fill="none" aria-hidden="true">
      <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="3" opacity="0.4" />
      <IonIcon
        icon={bagOutline}
        style={{ fontSize: 40, color: 'currentColor', opacity: 0.7 }}
      />
    </svg>
    <h3>{title}</h3>
    <p>{copy}</p>
    {ctaLabel && onCta && (
      <IonButton fill="outline" size="small" onClick={onCta}>
        {ctaLabel}
      </IonButton>
    )}
  </div>
  );
};

interface ErrorAlertProps {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export const ErrorAlert: React.FC<ErrorAlertProps> = ({
  message,
  onRetry,
  retryLabel = 'Reintentar',
}) => (
  <div className="error-alert-inline anim-slide-up" role="alert" data-testid="error-alert">
    <IonIcon icon={alertCircleOutline} color="danger" aria-hidden="true" />
    <div>
      <span>{message}</span>
      {onRetry && (
        <div className="error-actions">
          <IonButton fill="clear" size="small" color="danger" onClick={onRetry}>
            <IonIcon icon={refreshOutline} slot="start" />
            {retryLabel}
          </IonButton>
        </div>
      )}
    </div>
  </div>
);

export const SkeletonCard: React.FC = () => (
  <div className="skeleton-card" aria-hidden="true" data-testid="skeleton-card">
    <div className="skeleton-block skeleton-img" />
    <div className="skeleton-block skeleton-line" />
    <div className="skeleton-block skeleton-line short" />
    <div className="skeleton-block skeleton-line short" />
  </div>
);

interface SkeletonGridProps {
  count?: number;
}

export const SkeletonGrid: React.FC<SkeletonGridProps> = ({ count = 8 }) => (
  <div className="skeleton-grid" data-testid="skeleton-grid">
    {Array.from({ length: count }).map((_, i) => (
      <SkeletonCard key={i} />
    ))}
  </div>
);
