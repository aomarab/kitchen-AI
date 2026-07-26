import { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AppText, Button, Badge, LoadingState } from '../../../components';
import { useFormat } from '../../../hooks/useFormat';
import { useRecipe } from '../../../hooks/recipe';
import { formatMinutes } from '../../../lib/format';
import { colors, spacing } from '../../../theme';

/**
 * Full-screen cook mode: one step at a time, large type, forward/back stepping.
 * `expo-keep-awake` is not installed in this workspace, so the screen-awake hint
 * is shown but not enforced — wiring `useKeepAwake()` is a one-line change once
 * the package is available (reported to the coordinator).
 */
export default function CookMode() {
  const { t, locale, prefs } = useFormat();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const recipe = useRecipe(id ?? null, locale);
  const [step, setStep] = useState(0);

  if (recipe.isLoading || !recipe.data) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.text }}>
        <LoadingState />
      </SafeAreaView>
    );
  }

  const steps = recipe.data.steps;
  const current = steps[step]!;
  const isLast = step === steps.length - 1;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.text }}>
      <View style={{ flex: 1, padding: spacing.xl, gap: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <AppText variant="label" style={{ color: colors.surfaceAlt }}>
            {t('mobile.recipe.stepProgress', {
              current: formatMinutes(locale, step + 1, prefs),
              total: formatMinutes(locale, steps.length, prefs),
            })}
          </AppText>
          <Button
            title={t('mobile.recipe.exitCookMode')}
            variant="ghost"
            fullWidth={false}
            onPress={() => router.back()}
          />
        </View>

        <View style={{ flex: 1, justifyContent: 'center', gap: spacing.lg }}>
          {current.durationMinutes ? (
            <Badge
              tone="warn"
              label={t('recipe.cookTime', {
                minutes: formatMinutes(locale, current.durationMinutes, prefs),
              })}
            />
          ) : null}
          <AppText variant="display" style={{ color: colors.surface, fontSize: 30, lineHeight: 44 }}>
            {current.text}
          </AppText>
        </View>

        <AppText variant="caption" style={{ color: colors.surfaceAlt }} center>
          {t('mobile.recipe.cookModeHint')}
        </AppText>

        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <Button
            title={t('mobile.recipe.prev')}
            variant="secondary"
            disabled={step === 0}
            onPress={() => setStep((s) => Math.max(0, s - 1))}
            style={{ flex: 1 }}
          />
          {isLast ? (
            <Button
              title={t('mobile.recipe.finish')}
              icon="check"
              onPress={() => router.back()}
              style={{ flex: 1 }}
            />
          ) : (
            <Button
              title={t('mobile.recipe.next')}
              onPress={() => setStep((s) => Math.min(steps.length - 1, s + 1))}
              style={{ flex: 1 }}
            />
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}
