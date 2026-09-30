import { ListRow, Sheet, type IconName } from '../../components';
import { assistantModeAccessibilityLabel } from '../../lib/assistant/accessibility';
import type { AssistantMode } from './LiveAssistantScreen';

export interface ModeSheetProps {
  visible: boolean;
  mode: AssistantMode;
  title: string;
  selectedLabel: string;
  options: readonly {
    value: AssistantMode;
    label: string;
    subtitle: string;
    icon: IconName;
  }[];
  onModeChange: (mode: AssistantMode) => void;
  onClose: () => void;
}

export function ModeSheet({
  visible,
  mode,
  title,
  selectedLabel,
  options,
  onModeChange,
  onClose,
}: ModeSheetProps) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      {options.map((option) => {
        const selected = option.value === mode;
        return (
          <ListRow
            key={option.value}
            title={option.label}
            subtitle={option.subtitle}
            icon={option.icon}
            checked={selected}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={assistantModeAccessibilityLabel({
              title: option.label,
              subtitle: option.subtitle,
              selectedLabel: selected ? selectedLabel : null,
            })}
            onPress={() => {
              onModeChange(option.value);
              onClose();
            }}
          />
        );
      })}
    </Sheet>
  );
}
