import { Checkbox } from '../../components';

interface ShoppingCheckboxProps {
  checked: boolean;
  label: string;
  onPress: () => void;
}

const SHOPPING_CHECKBOX_TARGET_SIZE = 44;

export function ShoppingCheckbox({ checked, label, onPress }: ShoppingCheckboxProps) {
  return (
    <Checkbox
      checked={checked}
      accessibilityLabel={label}
      onPress={onPress}
      style={{ width: SHOPPING_CHECKBOX_TARGET_SIZE, height: SHOPPING_CHECKBOX_TARGET_SIZE }}
    />
  );
}
