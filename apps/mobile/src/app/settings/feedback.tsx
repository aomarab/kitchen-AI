import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { FEEDBACK_MESSAGE_MAX } from '@kitchen/contracts';
import { Screen, Header, AppText, Button, Card, Field, StarRating } from '../../components';
import { useFormat } from '../../hooks/useFormat';
import { useSubmitFeedback } from '../../hooks/feedback';
import { currentAppVersion, currentPlatform } from '../../lib/feedback';
import { errorMessageKey } from '../../lib/errors';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';

export default function Feedback() {
  // `useFormat` extends `useLocale`, so `locale` comes from the same call —
  // importing both would be two subscriptions to the same source.
  const { t, locale } = useFormat();
  const router = useRouter();
  const { colors } = useTheme();
  const submit = useSubmitFeedback();
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState('');
  const trimmedMessage = message.trim();

  if (submit.isSuccess) {
    return (
      <Screen>
        <Header title={t('mobile.feedback.title')} onBack={() => router.back()} />
        <Card style={{ gap: spacing.md }}>
          <AppText variant="title">{t('mobile.feedback.successTitle')}</AppText>
          <AppText muted>{t('mobile.feedback.successBody')}</AppText>
        </Card>
        <Button title={t('mobile.feedback.done')} onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Header title={t('mobile.feedback.title')} onBack={() => router.back()} />

      <View style={{ gap: spacing.sm }}>
        <AppText variant="label" muted>
          {t('mobile.feedback.ratingLabel')}
        </AppText>
        <StarRating
          value={rating}
          onChange={setRating}
          disabled={submit.isPending}
          labelFor={(value) => t('mobile.feedback.star', { value })}
        />
      </View>

      <Field
        label={t('mobile.feedback.messageLabel')}
        placeholder={t('mobile.feedback.messagePlaceholder')}
        value={message}
        onChangeText={setMessage}
        multiline
        maxLength={FEEDBACK_MESSAGE_MAX}
        hint={t('mobile.feedback.remaining', { count: FEEDBACK_MESSAGE_MAX - message.length })}
        style={{ minHeight: 120, paddingTop: spacing.md }}
      />

      <AppText variant="caption" muted>
        {t('mobile.feedback.privacyNote')}
      </AppText>

      {submit.isError ? (
        <View accessibilityLiveRegion="polite">
          <AppText variant="caption" accessibilityRole="alert" style={{ color: colors.danger }}>
            {t(errorMessageKey(submit.error))}
          </AppText>
        </View>
      ) : null}

      <Button
        title={t('mobile.feedback.submit')}
        icon="check"
        disabled={rating === 0 || submit.isPending}
        loading={submit.isPending}
        onPress={() =>
          submit.mutate({
            rating,
            message: trimmedMessage ? trimmedMessage : undefined,
            platform: currentPlatform(),
            appVersion: currentAppVersion(),
            locale,
          })
        }
      />
    </Screen>
  );
}
