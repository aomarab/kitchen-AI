import { forwardRef } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { AppText } from './AppText';
import { radius, spacing } from '../theme';
import { useTheme } from '../theme/useTheme';
import { useLocale } from '../lib/locale';
import { resolveFontFamily, useFontStore } from '../lib/fonts';

export interface FieldProps extends TextInputProps {
  label?: string;
  error?: string;
  hint?: string;
}

/** Labelled text input with error/hint slots. Aligns text to the writing edge. */
export const Field = forwardRef<TextInput, FieldProps>(function Field(
  { label, error, hint, style, ...rest },
  ref,
) {
  const { colors } = useTheme();
  const { dir, locale } = useLocale();
  const fontsLoaded = useFontStore((state) => state.loaded);
  const fontFamily = resolveFontFamily(locale, fontsLoaded);
  return (
    <View style={{ gap: spacing.xs }}>
      {label ? (
        <AppText variant="label" muted>
          {label}
        </AppText>
      ) : null}
      <TextInput
        ref={ref}
        placeholderTextColor={colors.textMuted}
        style={[
          {
            minHeight: 48,
            borderWidth: 1,
            borderColor: error ? colors.danger : colors.border,
            borderRadius: radius.xs,
            paddingHorizontal: spacing.md,
            backgroundColor: colors.surface,
            color: colors.text,
            fontSize: 16,
            fontFamily,
            // Same reasoning as AppText: iOS resolves `textAlign: 'auto'` from
            // the writing direction, whereas an explicit 'left'/'right' is
            // absolute on iOS but mirrored on Android — which put the caret on
            // opposite sides of the same field across the two platforms.
            textAlign: 'auto',
            writingDirection: dir,
          },
          style,
        ]}
        {...rest}
      />
      {error ? (
        <AppText variant="caption" color="danger">
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption" muted>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
});
