import { SegmentedControl, Sheet, ToggleRow } from '../../components';
import type { AssistantMode } from './LiveAssistantScreen';

export interface ModeSheetProps {
  visible: boolean;
  mode: AssistantMode;
  captionsOn: boolean;
  title: string;
  captionsLabel: string;
  options: readonly { value: AssistantMode; label: string }[];
  onModeChange: (mode: AssistantMode) => void;
  onCaptionsChange: (value: boolean) => void;
  onClose: () => void;
}

export function ModeSheet({
  visible,
  mode,
  captionsOn,
  title,
  captionsLabel,
  options,
  onModeChange,
  onCaptionsChange,
  onClose,
}: ModeSheetProps) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <SegmentedControl<AssistantMode> value={mode} onChange={onModeChange} options={options} />
      {mode === 'live' ? (
        <ToggleRow label={captionsLabel} value={captionsOn} onValueChange={onCaptionsChange} />
      ) : null}
    </Sheet>
  );
}
