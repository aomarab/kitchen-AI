import { forwardRef } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { maxFontScaleFor, radius, typography } from '../theme';
import { useLocale } from '../lib/locale';
import { resolveFontFamily, useFontStore } from '../lib/fonts';
import { useTheme } from '../theme/useTheme';

type MicProps =
  | {
      onMicPress?: undefined;
      micAccessibilityLabel?: never;
    }
  | {
      onMicPress: () => void;
      micAccessibilityLabel: string;
    };

export type SearchFieldProps = TextInputProps & MicProps;

export const SearchField = forwardRef<TextInput, SearchFieldProps>(function SearchField(
  { style, onMicPress, micAccessibilityLabel, ...rest },
  ref,
) {
  const { colors } = useTheme();
  const { dir, locale } = useLocale();
  const fontsLoaded = useFontStore((state) => state.loaded);
  const bodyType = typography(locale).body;
  const fontFamily = resolveFontFamily(locale, fontsLoaded, bodyType.fontWeight, 'body');

  return (
    <View
      style={{
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 12,
        borderRadius: radius.none,
        backgroundColor: colors.surfaceAlt,
      }}
    >
      <Icon name="search" size={20} color={colors.textMuted} />
      <TextInput
        ref={ref}
        placeholderTextColor={colors.textMuted}
        maxFontSizeMultiplier={maxFontScaleFor('body')}
        style={[
          {
            flex: 1,
            minHeight: 44,
            padding: 0,
            color: colors.text,
            fontSize: bodyType.fontSize,
            letterSpacing: bodyType.letterSpacing,
            fontFamily,
            textAlign: 'auto',
            writingDirection: dir,
          },
          style,
        ]}
        {...rest}
      />
      {onMicPress ? (
        <IconButton
          accessibilityLabel={micAccessibilityLabel}
          icon="mic"
          tone="plain"
          size={36}
          onPress={onMicPress}
        />
      ) : null}
    </View>
  );
});
