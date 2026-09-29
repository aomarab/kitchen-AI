import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { FEEDBACK_MESSAGE_MAX } from '@kitchen/contracts';
import {
  Screen,
  Header,
  AppText,
  Button,
  EmptyState,
  Field,
  Icon,
  StarRating,
} from '../../components';
import { useFormat } from '../../hooks/useFormat';
import { useSubmitFeedback } from '../../hooks/feedback';
import { currentAppVersion, currentPlatform } from '../../lib/feedback';
import { errorMessageKey } from '../../lib/errors';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';

export default function Feedback() {
  const { t, locale } = useFormat();
  const router = useRouter();
  const { colors } = useTheme();
  const submit = useSubmitFeedback();
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState('');
  const trimmedMessage = message.trim();

  if (submit.isSuccess) {
    return (
      <Screen footer={<Button title={t('mobile.feedback.done')} onPress={() => router.back()} />}>
        <Header title={t('mobile.feedback.title')} onBack={() => router.back()} />
        <EmptyState
          illustration="check"
          title={t('mobile.feedback.successTitle')}
          message={t('mobile.feedback.successBody')}
        />
      </Screen>
    );
  }

  return (
    <Screen
      scroll
      footer={
        <Button
          title={t('mobile.feedback.submit')}
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
      }
    >
      <Header title={t('mobile.feedback.title')} onBack={() => router.back()} />

      <AppText variant="display">{t('mobile.feedback.ratingLabel')}</AppText>

      <StarRating
        value={rating}
        onChange={setRating}
        disabled={submit.isPending}
        labelFor={(value) => t('mobile.feedback.star', { value })}
      />

      <Field
        label={t('mobile.feedback.messageLabel')}
        placeholder={t('mobile.feedback.messagePlaceholder')}
        value={message}
        onChangeText={setMessage}
        multiline
        maxLength={FEEDBACK_MESSAGE_MAX}
        hint={t('mobile.feedback.remaining', { count: FEEDBACK_MESSAGE_MAX - message.length })}
        style={{ paddingTop: spacing.md }}
      />

      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
        <Icon name="lock" size={18} color={colors.textMuted} />
        <AppText variant="caption" muted style={{ flex: 1 }}>
          {t('mobile.feedback.privacyNote')}
        </AppText>
      </View>

      {submit.isError ? (
        <View accessibilityLiveRegion="polite">
          <AppText variant="caption" accessibilityRole="alert" color="danger">
            {t(errorMessageKey(submit.error))}
          </AppText>
        </View>
      ) : null}
    </Screen>
  );
}
