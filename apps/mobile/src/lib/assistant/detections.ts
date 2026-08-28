import type { RecognitionSession, RecognizedItem } from '@kitchen/contracts';
import type { DetectedItem } from './realtime-port';
import { uuidv4 } from '../uuid';

/**
 * Turns the assistant's live detections into the {@link RecognitionSession} the
 * existing capture review flow already knows how to confirm.
 *
 * This is the bridge that keeps the "never auto-write" rule intact: detections
 * are never written to inventory directly. They become an ordinary recognition
 * session, are shown in the same {@link import('../../features/capture/ReviewList').ReviewList}
 * the photo and receipt flows use, and only reach the append-only ledger when
 * the user confirms — through `buildInventoryInputs(rows, 'assistant')`, exactly
 * as web does (`LiveAssistantView.tsx#toRecognized`).
 *
 * The mapping is faithful because the ingredient catalog is global and
 * append-only: a name or category dropped here is filed wrong for every
 * household, forever. So both names and the category are carried through, and
 * the match is `created` with a null id — the API resolves or creates the
 * catalog row on confirm, the same way the photo path does.
 */
export function detectionsToSession(detections: DetectedItem[]): RecognitionSession {
  const items: RecognizedItem[] = detections.map((item) => ({
    tempId: item.id,
    match: {
      ingredientId: null,
      strategy: 'created',
      confidence: item.confidence,
      rawName: item.nameEn,
    },
    nameEn: item.nameEn,
    nameAr: item.nameAr,
    category: item.category,
    // The assistant may not be able to count ("some tomatoes"); default to one
    // so the row is editable rather than zero-quantity and silently dropped.
    quantity: item.quantity ?? 1,
    unit: item.unit,
    confidence: item.confidence,
    suggestedExpiresAt: null,
    suggestedLocationType: 'fridge',
    // Nobody took a photo — the live feed is never uploaded — so there is no key.
    photoKey: null,
  }));

  return {
    id: uuidv4(),
    items,
    emptyPhotoKeys: [],
    createdAt: new Date().toISOString(),
  };
}
