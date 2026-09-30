import { TextInput, View } from 'react-native';
import { IconButton } from '../../components';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';
import { useLocale } from '../../lib/locale';
import { resolveFontFamily, useFontStore } from '../../lib/fonts';
import type { AssistantMode } from './LiveAssistantScreen';

export interface ComposerProps {
  mode: AssistantMode;
  draft: string;
  micMuted: boolean;
  lockMode?: boolean;
  placeholder: string;
  liveLabel: string;
  sendLabel: string;
  micLabel: string;
  micMutedLabel: string;
  onDraftChange: (text: string) => void;
  onSubmit: () => void;
  onToggleMic: () => void;
  onModePress: () => void;
}

/** Coral composer (spec §8), keeping text, mic, send and mode actions reachable. */
export function Composer({
  mode: _mode,
  draft,
  micMuted,
  lockMode: _lockMode = false,
  placeholder,
  liveLabel,
  sendLabel,
  micLabel,
  micMutedLabel,
  onDraftChange,
  onSubmit,
  onToggleMic,
  onModePress,
}: ComposerProps) {
  const { colors } = useTheme();
  const { dir, locale } = useLocale();
  const fontsLoaded = useFontStore((state) => state.loaded);
  const fontFamily = resolveFontFamily(locale, fontsLoaded);
  const disabled = draft.trim().length === 0;

  return (
    <View
      style={{
        minHeight: 60,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderTopWidth: 1,
        borderTopColor: colors.rowline,
        backgroundColor: colors.bg,
        paddingTop: spacing.sm,
        paddingEnd: spacing.md,
        paddingBottom: spacing.sm,
        paddingStart: spacing.lg,
      }}
    >
      <IconButton
        icon="sliders"
        size={44}
        tone="outline"
        accessibilityLabel={liveLabel}
        onPress={onModePress}
      />
      <View
        style={{
          flex: 1,
          minHeight: 44,
          justifyContent: 'center',
          backgroundColor: colors.surfaceAlt,
          paddingHorizontal: spacing.md,
        }}
      >
        <TextInput
          value={draft}
          onChangeText={onDraftChange}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          onSubmitEditing={onSubmit}
          returnKeyType="send"
          style={{
            minHeight: 44,
            color: colors.text,
            fontFamily,
            textAlign: 'auto',
            writingDirection: dir,
            paddingVertical: 0,
          }}
        />
      </View>
      <IconButton
        icon={micMuted ? 'micOff' : 'mic'}
        size={44}
        tone="plain"
        accessibilityLabel={micMuted ? micMutedLabel : micLabel}
        onPress={onToggleMic}
      />
      <IconButton
        icon="send"
        directional
        size={44}
        tone="coral"
        accessibilityLabel={sendLabel}
        accessibilityState={{ disabled }}
        onPress={onSubmit}
        disabled={disabled}
      />
    </View>
  );
}
