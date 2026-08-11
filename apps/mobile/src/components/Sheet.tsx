import type { ReactNode } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { colors, hitSlop, radius, spacing } from '../theme';
import { useLocale } from '../lib/locale';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

/** Bottom sheet built on RN Modal — no extra dependency required. */
export function Sheet({ visible, onClose, title, children }: SheetProps) {
  const { t, dir } = useLocale();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
        onPress={onClose}
        // A Modal is hosted outside the root view, so it inherits nothing from
        // the app's direction style and would always lay out LTR.
        style={{ flex: 1, direction: dir, backgroundColor: colors.overlay, justifyContent: 'flex-end' }}
      >
        <Pressable
          onPress={(event) => event.stopPropagation()}
          style={{
            backgroundColor: colors.surface,
            borderTopStartRadius: radius.lg,
            borderTopEndRadius: radius.lg,
          }}
        >
          <SafeAreaView edges={['bottom']}>
            <View style={{ padding: spacing.lg, gap: spacing.md }}>
              <View
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
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
        </Pressable>
      </Pressable>
    </Modal>
  );
}
