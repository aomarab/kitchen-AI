import { View } from 'react-native';
import { Button } from '../../components';

interface ShoppingFooterProps {
  title: string;
  disabled: boolean;
  loading: boolean;
  bottomPadding: number;
  onPress: () => void;
}

export function ShoppingFooter({
  title,
  disabled,
  loading,
  bottomPadding,
  onPress,
}: ShoppingFooterProps) {
  return (
    <View style={{ paddingBottom: bottomPadding }}>
      <Button title={title} icon="check" disabled={disabled} loading={loading} onPress={onPress} />
    </View>
  );
}
