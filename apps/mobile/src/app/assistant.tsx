import { Screen } from '../components';
import { LiveAssistantScreen } from '../features/assistant/LiveAssistantScreen';

/** The assistant manages its own text, voice and full-bleed camera layouts. */
export default function AssistantRoute() {
  return (
    <Screen padded={false} edges={[]}>
      <LiveAssistantScreen initialMode="text" />
    </Screen>
  );
}
