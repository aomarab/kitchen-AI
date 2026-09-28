import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText } from './AppText';
import { IconButton } from './IconButton';
import { spacing } from '../theme';
import { useTheme } from '../theme/useTheme';
import { useLocale } from '../lib/locale';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

export function Sheet({ visible, onClose, title, children }: SheetProps) {
  const { t, dir } = useLocale();
  const { colors, shadow } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
        onPress={onClose}
        style={{
          flex: 1,
          direction: dir,
          backgroundColor: colors.overlay,
          justifyContent: 'flex-end',
        }}
      >
        <Pressable
          onPress={(event) => event.stopPropagation()}
          style={{ backgroundColor: colors.surface, ...shadow.sheet }}
        >
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <SafeAreaView edges={['bottom']}>
              <View style={{ paddingTop: spacing.sm, paddingHorizontal: spacing.gutter }}>
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={{ alignItems: 'center', paddingBottom: spacing.xs }}
                >
                  <View style={{ width: 36, height: 4, backgroundColor: colors.border }} />
                </View>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.sm,
                    paddingBottom: spacing.xs,
                  }}
                >
                  <AppText variant="title" accessibilityRole="header" style={{ flex: 1 }}>
                    {title ?? ''}
                  </AppText>
                  <IconButton
                    icon="close"
                    tone="plain"
                    accessibilityLabel={t('common.close')}
                    onPress={onClose}
                  />
                </View>
              </View>
              <View
                style={{
                  paddingTop: spacing.xs,
                  paddingHorizontal: spacing.gutter,
                  paddingBottom: spacing.gutter,
                  gap: spacing.lg,
                }}
              >
                {children}
              </View>
            </SafeAreaView>
          </KeyboardAvoidingView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
