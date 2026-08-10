import { FeedbackDetail } from '../../../../../components/admin/FeedbackDetail';

export default async function AdminFeedbackDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <FeedbackDetail id={id} />;
}
