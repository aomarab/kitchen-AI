import { Animated, Pressable, StyleSheet, View } from 'react-native';
import {
  ASSISTANT_PERSONAS,
  assistantPersonaSchema,
  type AssistantPersona,
} from '@kitchen/contracts';
import { AppText, Avatar, Badge, Icon, LoadingState, ErrorState } from '../../components';
import { useLocale } from '../../lib/locale';
import { useProfile, useUpdateProfile } from '../../hooks/profile';
import { resolvePersonaSelection } from '../../lib/assistant/persona';
import { assistantPersonaAccessibilityLabel } from '../../lib/settings-accessibility';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';
import { usePressFeedback } from '../../components/press-feedback';

export const PERSONA_OPTION_MIN_HEIGHT = 84;

interface PersonaOptionProps {
  persona: AssistantPersona;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}

function PersonaOption({ persona, selected: isSelected, disabled, onPress }: PersonaOptionProps) {
  const { t } = useLocale();
  const { colors, shadow } = useTheme();
  const pressFeedback = usePressFeedback();
  const name = t(`persona.${persona}`);
  const dialect = t(`dialect.${ASSISTANT_PERSONAS[persona].dialect}`);
  const description = t(`personaDescription.${persona}`);
  const selectedLabel = isSelected ? t('mobile.assistant.personaSelected') : null;

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: isSelected, disabled }}
      accessibilityLabel={assistantPersonaAccessibilityLabel({
        name,
        dialect,
        description,
        selectedLabel,
      })}
      disabled={disabled}
      onPress={onPress}
      {...pressFeedback.pressHandlers}
    >
      <Animated.View
        style={[
          {
            minHeight: PERSONA_OPTION_MIN_HEIGHT,
            flexDirection: 'row',
            gap: spacing.md,
            padding: spacing.lg,
            borderWidth: isSelected ? 1.5 : 1,
            borderColor: isSelected ? colors.text : colors.cardEdge,
            backgroundColor: colors.bg,
            ...shadow.card,
          },
          !disabled ? pressFeedback.animatedStyle : null,
        ]}
      >
        <Avatar name={name} size={40} />
        <View style={{ flex: 1, gap: spacing.xs }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'baseline',
              flexWrap: 'wrap',
              gap: spacing.sm,
            }}
          >
            <AppText variant="bodyStrong">{name}</AppText>
            <AppText variant="caption" muted>
              {dialect}
            </AppText>
          </View>
          <AppText variant="caption" muted>
            {description}
          </AppText>
          {isSelected ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <Icon name="check" size={16} color={colors.primaryText} />
              <AppText variant="caption" color="primaryText">
                {t('mobile.assistant.personaSelected')}
              </AppText>
            </View>
          ) : null}
        </View>
      </Animated.View>
    </Pressable>
  );
}

export function AssistantPersonaPicker() {
  const { t } = useLocale();
  const { colors } = useTheme();
  const query = useProfile();
  const update = useUpdateProfile();

  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (!query.data) return null;

  const selected: AssistantPersona = resolvePersonaSelection(query.data.assistantPersona);

  return (
    <View style={{ gap: spacing.lg }}>
      <AppText variant="body" muted>
        {t('mobile.assistant.personaSubtitle')}
      </AppText>

      {update.isSuccess ? (
        <Badge tone="success" label={t('mobile.assistant.personaSaved')} />
      ) : null}

      <View accessibilityRole="radiogroup" style={{ gap: spacing.md }}>
        {assistantPersonaSchema.options.map((persona) => (
          <PersonaOption
            key={persona}
            persona={persona}
            selected={persona === selected}
            disabled={update.isPending}
            onPress={() => update.mutate({ assistantPersona: persona })}
          />
        ))}
      </View>

      <View
        style={{
          flexDirection: 'row',
          gap: spacing.sm,
          padding: spacing.lg,
          backgroundColor: colors.surfaceAlt,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.rowline,
        }}
      >
        <Icon name="info" size={18} color={colors.textMuted} />
        <AppText variant="caption" muted style={{ flex: 1 }}>
          {t('mobile.assistant.personaHonesty')}
        </AppText>
      </View>
    </View>
  );
}
