import { TextInput, View } from 'react-native';
import { RoundButton } from '../../components';
import { radius, spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';
import { composerAction } from '../../lib/assistant/composer';
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
  onLivePress: () => void;
}

/** The F5 pill composer (spec §8.7), using shared RoundButton targets. */
export function Composer({
  mode,
  draft,
  micMuted,
  lockMode = false,
  placeholder,
  liveLabel,
  sendLabel,
  micLabel,
  micMutedLabel,
  onDraftChange,
  onSubmit,
  onToggleMic,
  onLivePress,
}: ComposerProps) {
  const { colors } = useTheme();
  const action = composerAction({ mode, draft, micMuted });
  const actionLabel =
    action === 'mic' ? micLabel : action === 'micMuted' ? micMutedLabel : sendLabel;
  const actionIcon = action === 'mic' ? 'mic' : action === 'micMuted' ? 'micOff' : 'send';
  const disabled = action === 'sendDisabled';
  const onActionPress = action === 'mic' || action === 'micMuted' ? onToggleMic : onSubmit;

  return (
    <View
      style={{
        minHeight: 60,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.sm,
      }}
    >
      {!lockMode ? (
        <RoundButton
          icon="camera"
          size={40}
          tone="soft"
          accessibilityLabel={liveLabel}
          onPress={onLivePress}
        />
      ) : null}
      <TextInput
        value={draft}
        onChangeText={onDraftChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        onSubmitEditing={onSubmit}
        returnKeyType="send"
        style={{
          flex: 1,
          minHeight: 44,
          color: colors.text,
          paddingVertical: 0,
        }}
      />
      <RoundButton
        icon={actionIcon}
        size={44}
        tone="primary"
        accessibilityLabel={actionLabel}
        accessibilityState={{ disabled }}
        onPress={onActionPress}
        disabled={disabled}
      />
    </View>
  );
}
