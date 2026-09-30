import { View } from 'react-native';
import type { MessageKey } from '@kitchen/i18n';
import { Button, type IconName } from '../../components';
import { useFormat } from '../../hooks/useFormat';
import type { AssistantMode } from '../../lib/assistant/mode';
import { spacing } from '../../theme';

const SHORTCUTS: readonly {
  mode: AssistantMode;
  icon: IconName;
  title: MessageKey;
  label: MessageKey;
}[] = [
  {
    mode: 'text',
    icon: 'chat',
    title: 'mobile.home.askMamaChat',
    label: 'mobile.home.askMamaChatLabel',
  },
  {
    mode: 'voice',
    icon: 'mic',
    title: 'mobile.home.askMamaVoice',
    label: 'mobile.home.askMamaVoiceLabel',
  },
  {
    mode: 'live',
    icon: 'video',
    title: 'mobile.home.askMamaLive',
    label: 'mobile.home.askMamaLiveLabel',
  },
];

/**
 * Labelled ways into the assistant, one per mode. The search-style row above
 * reads as search, so on its own it hid both chat and the camera-based Live
 * mode; these say what each one is.
 */
export function AssistantModeShortcuts({ onOpen }: { onOpen: (mode: AssistantMode) => void }) {
  const { t } = useFormat();

  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
      {SHORTCUTS.map((shortcut) => (
        <View key={shortcut.mode} style={{ flex: 1 }}>
          <Button
            variant="secondary"
            size="S"
            fullWidth
            leadingIcon={shortcut.icon}
            title={t(shortcut.title)}
            accessibilityLabel={t(shortcut.label)}
            onPress={() => onOpen(shortcut.mode)}
          />
        </View>
      ))}
    </View>
  );
}
