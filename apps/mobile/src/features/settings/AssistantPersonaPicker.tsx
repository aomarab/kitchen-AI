import { View } from 'react-native';
import {
  ASSISTANT_PERSONAS,
  assistantPersonaSchema,
  type AssistantPersona,
} from '@kitchen/contracts';
import {
  AppText,
  Badge,
  Card,
  Icon,
  ListGroup,
  ListRow,
  LoadingState,
  ErrorState,
} from '../../components';
import { useLocale } from '../../lib/locale';
import { useProfile, useUpdateProfile } from '../../hooks/profile';
import { resolvePersonaSelection } from '../../lib/assistant/persona';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';

/**
 * Choose the persona the live assistant speaks as — the mobile twin of the web
 * surface (`apps/web/src/components/settings/AssistantPersonaView.tsx`), reading
 * and writing the one per-user `assistantPersona` profile field.
 *
 * The list is derived from the contract catalog rather than hand-written, so a
 * persona added to the enum appears here without anyone remembering to add it;
 * the names come from the shared i18n catalog, which is typed across locales, so
 * one added without an Arabic name fails the build. There is no preview button:
 * nothing in the app speaks except the realtime session itself, so a voice is
 * auditioned by starting one, not by synthesising a sample line here.
 */
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
      <Card>
        <AppText variant="label" muted>
          {t('mobile.assistant.personaSubtitle')}
        </AppText>
        {/* Stated in the product, not only in the spec: a user choosing an
            Egyptian persona should know the voice is synthetic and the dialect
            steered rather than natively spoken. */}
        <AppText variant="caption" muted>
          {t('mobile.assistant.personaHonesty')}
        </AppText>
        {update.isSuccess ? (
          <Badge tone="success" label={t('mobile.assistant.personaSaved')} />
        ) : null}
      </Card>

      <View accessibilityRole="radiogroup">
        <ListGroup>
          {assistantPersonaSchema.options.map((persona) => {
            const isSelected = persona === selected;
            return (
              <ListRow
                key={persona}
                grouped
                icon="mic"
                title={t(`persona.${persona}`)}
                titleColor={isSelected ? 'primaryText' : undefined}
                subtitle={`${t(`personaDescription.${persona}`)} · ${t(
                  `dialect.${ASSISTANT_PERSONAS[persona].dialect}`,
                )}`}
                trailing={
                  isSelected ? <Icon name="check" size={20} color={colors.primaryText} /> : null
                }
                accessibilityRole="radio"
                accessibilityState={{ checked: isSelected }}
                accessibilityLabel={t(`persona.${persona}`)}
                onPress={() => update.mutate({ assistantPersona: persona })}
              />
            );
          })}
        </ListGroup>
      </View>
    </View>
  );
}
