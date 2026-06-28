import { redirect } from 'next/navigation';

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ task_id: string }>;
}) {
  const { task_id: taskId } = await params;
  redirect(`/console/tasks/${taskId}`);
}
