import { IconButton } from '../../components';
import { useFormat } from '../../hooks/useFormat';

interface CaptureTorchButtonProps {
  enabled: boolean;
  onToggle: () => void;
}

export function CaptureTorchButton({ enabled, onToggle }: CaptureTorchButtonProps) {
  const { t } = useFormat();

  return (
    <IconButton
      icon={enabled ? 'flashOff' : 'zap'}
      size={44}
      tone="media"
      accessibilityLabel={enabled ? t('mobile.capture.flashOff') : t('mobile.capture.flashOn')}
      accessibilityState={{ checked: enabled }}
      onPress={onToggle}
    />
  );
}
