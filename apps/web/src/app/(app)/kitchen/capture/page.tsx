import { Suspense } from 'react';
import { CaptureFlow } from '../../../../components/kitchen/CaptureFlow';
import { LoadingState } from '../../../../components/ui/states';

export default function CapturePage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <CaptureFlow />
    </Suspense>
  );
}
