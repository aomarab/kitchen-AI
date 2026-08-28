import { CreditCalibrationView } from '../../../../components/admin/CreditCalibrationView';

/**
 * Staff-only credit calibration. The server `StaffGuard` on
 * `/admin/credits/calibration` is the real boundary; the surrounding `(admin)`
 * layout's `AdminGate` only decides whether to render the console.
 */
export default function AdminCreditsPage() {
  return <CreditCalibrationView />;
}
