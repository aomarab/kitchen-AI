import { Screen } from '../components';
import { LiveAssistantScreen } from '../features/assistant/LiveAssistantScreen';

/**
 * The live assistant is a full-bleed camera surface, so the Screen wrapper
 * carries no padding and no safe-area insets — the screen manages its own insets
 * so the camera reaches the edges while the controls stay clear of them. Screen
 * is still here for the keyboard-aware container the confirm sheet's expiry
 * field depends on.
 */
export default function AssistantRoute() {
  return (
    <Screen padded={false} edges={[]}>
      <LiveAssistantScreen />
    </Screen>
  );
}
