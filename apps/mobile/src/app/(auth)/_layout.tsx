import { Stack } from 'expo-router';
import { colors } from '../../theme';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        // Sign-in and create-account are two halves of one panel, reached by a
        // link rather than navigation. Sliding a whole screen across made the
        // swap look like it had travelled somewhere it had not.
        animation: 'fade',
      }}
    />
  );
}
