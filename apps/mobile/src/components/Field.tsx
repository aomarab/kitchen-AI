import { forwardRef, useState } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { AppText } from './AppText';
import { fieldBorder, textareaCountLabel } from './field-tones';
import { maxFontScaleFor, radius, typography } from '../theme';
import { useTheme } from '../theme/useTheme';
import { useLocale } from '../lib/locale';
import { resolveFontFamily, useFontStore } from '../lib/fonts';

export interface FieldProps extends TextInputProps {
  label?: string;
  error?: string;
  hint?: string;
  invalid?: boolean;
}

/** Labelled text input with error/hint slots. Aligns text to the writing edge. */
export const Field = forwardRef<TextInput, FieldProps>(function Field(
  {
    label,
    error,
    hint,
    invalid,
    style,
    onFocus,
    onBlur,
    onChangeText,
    maxLength,
    multiline,
    editable,
    value,
    defaultValue,
    ...rest
  },
  ref,
) {
  const { colors } = useTheme();
  const { dir, locale } = useLocale();
  const fontsLoaded = useFontStore((state) => state.loaded);
  const bodyType = typography(locale).body;
  const fontFamily = resolveFontFamily(locale, fontsLoaded, bodyType.fontWeight, 'body');
  const [focused, setFocused] = useState(false);
  const [draftText, setDraftText] = useState(() => String(defaultValue ?? ''));
  const border = fieldBorder({ focused, error: error || invalid ? 'invalid' : undefined });
  const disabled = editable === false;
  const horizontalPadding = 14 - (border.width - 1);
  const countText = value ?? draftText;
  const countLabel = textareaCountLabel({ multiline, maxLength, text: countText });

  return (
    <View style={{ gap: 6 }}>
      {label ? <AppText variant="label">{label}</AppText> : null}
      <View
        style={[
          {
            minHeight: multiline ? 132 : 48,
            borderWidth: border.width,
            borderColor: colors[border.colorToken],
            borderRadius: radius.none,
            paddingHorizontal: multiline ? 14 : horizontalPadding,
            paddingVertical: multiline ? 14 : 0,
            backgroundColor: disabled ? colors.surfaceAlt : colors.bg,
            justifyContent: multiline ? 'flex-start' : 'center',
          },
        ]}
      >
        <TextInput
          ref={ref}
          placeholderTextColor={colors.textMuted}
          editable={editable}
          value={value}
          defaultValue={defaultValue}
          maxLength={maxLength}
          multiline={multiline}
          onChangeText={(text) => {
            setDraftText(text);
            onChangeText?.(text);
          }}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          maxFontSizeMultiplier={maxFontScaleFor('body')}
          style={[
            {
              flex: multiline ? 1 : undefined,
              minHeight: multiline ? undefined : 44,
              padding: 0,
              color: disabled ? colors.textMuted : colors.text,
              fontSize: bodyType.fontSize,
              letterSpacing: bodyType.letterSpacing,
              fontFamily,
              textAlign: 'auto',
              textAlignVertical: multiline ? 'top' : 'center',
              writingDirection: dir,
            },
            style,
          ]}
          {...rest}
        />
        {countLabel ? (
          <AppText variant="small" muted style={{ alignSelf: 'flex-end' }}>
            {countLabel}
          </AppText>
        ) : null}
      </View>
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
