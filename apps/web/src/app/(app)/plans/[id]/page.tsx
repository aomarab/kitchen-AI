import { PlanDetailContainer } from '../../../../components/plans/PlanDetailContainer';

export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PlanDetailContainer id={id} />;
}
