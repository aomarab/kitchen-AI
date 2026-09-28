import { View } from 'react-native';
import { Button } from '../../components';

interface ShoppingFooterProps {
  title: string;
  disabled: boolean;
  loading: boolean;
  onPress: () => void;
}

export function ShoppingFooter({ title, disabled, loading, onPress }: ShoppingFooterProps) {
  return (
    <View>
      <Button title={title} icon="check" disabled={disabled} loading={loading} onPress={onPress} />
    </View>
  );
}
