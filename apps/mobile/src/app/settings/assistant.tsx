import { useRouter } from 'expo-router';
import { Screen, Header } from '../../components';
import { useLocale } from '../../lib/locale';
import { AssistantPersonaPicker } from '../../features/settings/AssistantPersonaPicker';

export default function AssistantPersonaSettings() {
  const { t } = useLocale();
  const router = useRouter();
  return (
    <Screen scroll>
      <Header title={t('mobile.assistant.personaTitle')} onBack={() => router.back()} />
      <AssistantPersonaPicker />
    </Screen>
  );
}
