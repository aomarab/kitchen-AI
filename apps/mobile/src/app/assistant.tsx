import { useLocalSearchParams } from 'expo-router';
import { Screen } from '../components';
import { LiveAssistantScreen } from '../features/assistant/LiveAssistantScreen';
import { assistantModeFromParam } from '../lib/assistant/mode';

/**
 * The assistant manages its own text, voice and full-bleed camera layouts.
 * `?mode=voice|live` lets Home's shortcuts open straight into a mode; anything
 * else opens text chat.
 */
export default function AssistantRoute() {
  const params = useLocalSearchParams<{ mode?: string }>();

  return (
    <Screen padded={false} edges={[]}>
      <LiveAssistantScreen initialMode={assistantModeFromParam(params.mode)} />
    </Screen>
  );
}
