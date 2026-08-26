import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { hitSlop, radius, spacing } from '../theme';
import { useTheme } from '../theme/useTheme';
import { useLocale } from '../lib/locale';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

/**
 * Bottom sheet built on RN Modal — no extra dependency required.
 *
 * Carries its own keyboard avoidance. A Modal is hosted outside the root view,
 * so it is a sibling of `Screen`'s KeyboardAvoidingView rather than a child —
 * a text field in here is unprotected even on a screen that has one, and on
 * iOS the keyboard would rise over the input being typed into.
 */
export function Sheet({ visible, onClose, title, children }: SheetProps) {
  const { t, dir } = useLocale();
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
        onPress={onClose}
        // A Modal is hosted outside the root view, so it inherits nothing from
        // the app's direction style and would always lay out LTR.
        style={{
          flex: 1,
          direction: dir,
          backgroundColor: colors.overlay,
          justifyContent: 'flex-end',
        }}
      >
        <Pressable
          onPress={(event) => event.stopPropagation()}
          style={{
            backgroundColor: colors.surface,
            borderTopStartRadius: radius.lg,
            borderTopEndRadius: radius.lg,
          }}
        >
          <KeyboardAvoidingView
            // Expo sets Android's softwareKeyboardLayoutMode to "resize", so
            // Android already shrinks the window for the keyboard. Adding a
            // behavior on top of that double-adjusts and pushes content away.
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <SafeAreaView edges={['bottom']}>
              <View style={{ padding: spacing.lg, gap: spacing.md }}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <AppText variant="heading">{title ?? ''}</AppText>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('common.close')}
                    hitSlop={hitSlop}
                    onPress={onClose}
                  >
                    <Icon name="close" size={20} color={colors.textMuted} />
                  </Pressable>
                </View>
                {children}
              </View>
            </SafeAreaView>
          </KeyboardAvoidingView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
