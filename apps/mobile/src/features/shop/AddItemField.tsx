import { Fragment } from 'react';
import { Animated, Pressable, TextInput, View } from 'react-native';
import type { Ingredient } from '@kitchen/contracts';
import type { Locale } from '@kitchen/i18n';
import { AppText, Card, FoodIcon, IconButton } from '../../components';
import { usePressFeedback } from '../../components/press-feedback';
import { ingredientName } from '../../lib/format';
import { useLocale } from '../../lib/locale';
import { resolveFontFamily, useFontStore } from '../../lib/fonts';
import { radius, spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';

interface AddItemFieldProps {
  term: string;
  locale: Locale;
  suggestions: readonly Ingredient[];
  placeholder: string;
  addLabel: string;
  noMatchLabel: string;
  showNoMatch: boolean;
  actionEnabled: boolean;
  submitting: boolean;
  onTermChange: (term: string) => void;
  onAddAction: () => void;
  onChoose: (ingredient: Ingredient) => void;
}

function iconItem(ingredient: Ingredient) {
  return {
    nameEn: ingredient.canonicalNameEn,
    nameAr: ingredient.canonicalNameAr,
    category: ingredient.category,
  };
}

function SuggestionRow({
  ingredient,
  locale,
  submitting,
  onChoose,
}: {
  ingredient: Ingredient;
  locale: Locale;
  submitting: boolean;
  onChoose: (ingredient: Ingredient) => void;
}) {
  const pressFeedback = usePressFeedback();
  const name = ingredientName(locale, ingredient);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      accessibilityState={{ busy: submitting }}
      disabled={submitting}
      onPress={() => onChoose(ingredient)}
      {...pressFeedback.pressHandlers}
    >
      <Animated.View
        style={[
          {
            minHeight: 44,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            paddingVertical: spacing.sm,
            paddingHorizontal: spacing.lg,
          },
          submitting ? { opacity: 0.5 } : pressFeedback.animatedStyle,
        ]}
      >
        <FoodIcon item={iconItem(ingredient)} size={36} />
        <AppText variant="bodyStrong" style={{ flex: 1 }}>
          {name}
        </AppText>
      </Animated.View>
    </Pressable>
  );
}

export function AddItemField({
  term,
  locale,
  suggestions,
  placeholder,
  addLabel,
  noMatchLabel,
  showNoMatch,
  actionEnabled,
  submitting,
  onTermChange,
  onAddAction,
  onChoose,
}: AddItemFieldProps) {
  const { colors } = useTheme();
  const { dir, locale: inputLocale } = useLocale();
  const fontsLoaded = useFontStore((state) => state.loaded);
  const fontFamily = resolveFontFamily(inputLocale, fontsLoaded);
  const hasSuggestions = suggestions.length > 0;
  const showCard = hasSuggestions || showNoMatch;
  const addDisabled = !actionEnabled || submitting;

  return (
    <View style={{ gap: spacing.xs }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
        }}
      >
        <View
          style={{
            flex: 1,
            minHeight: 44,
            justifyContent: 'center',
            borderRadius: radius.none,
            backgroundColor: colors.surfaceAlt,
            paddingHorizontal: 14,
          }}
        >
          <TextInput
            value={term}
            onChangeText={onTermChange}
            placeholder={placeholder}
            placeholderTextColor={colors.textMuted}
            autoCorrect={false}
            autoCapitalize="none"
            onSubmitEditing={addDisabled ? undefined : onAddAction}
            returnKeyType="done"
            style={{
              flex: 1,
              minHeight: 44,
              color: colors.text,
              fontSize: 16,
              fontFamily,
              textAlign: 'auto',
              writingDirection: dir,
              paddingVertical: 0,
            }}
          />
        </View>
        <IconButton
          icon="plus"
          size={44}
          tone="inverse"
          accessibilityLabel={addLabel}
          accessibilityState={{ busy: submitting }}
          disabled={addDisabled}
          onPress={onAddAction}
        />
      </View>

      {showCard ? (
        <Card style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
          {hasSuggestions
            ? suggestions.map((ingredient, index) => {
                return (
                  <Fragment key={ingredient.id}>
                    {index > 0 ? (
                      <View
                        style={{
                          height: 1,
                          marginHorizontal: spacing.lg,
                          backgroundColor: colors.border,
                        }}
                      />
                    ) : null}
                    <SuggestionRow
                      ingredient={ingredient}
                      locale={locale}
                      submitting={submitting}
                      onChoose={onChoose}
                    />
                  </Fragment>
                );
              })
            : null}
          {showNoMatch ? (
            <View style={{ minHeight: 44, justifyContent: 'center', padding: spacing.lg }}>
              <AppText variant="body" muted>
                {noMatchLabel}
              </AppText>
            </View>
          ) : null}
        </Card>
      ) : null}
    </View>
  );
}
