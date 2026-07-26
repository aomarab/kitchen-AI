import { forwardRef } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { AppText } from './AppText';
import { colors, fontFamily, radius, spacing } from '../theme';
import { useLocale } from '../lib/locale';

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
  const { dir } = useLocale();
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
            borderRadius: radius.md,
            paddingHorizontal: spacing.md,
            backgroundColor: colors.surface,
            color: colors.text,
            fontSize: 16,
            fontFamily,
            textAlign: dir === 'rtl' ? 'right' : 'left',
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
