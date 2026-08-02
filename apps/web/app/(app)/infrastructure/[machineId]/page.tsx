import { MachineDetail } from "@/features/runtime/machine-detail";
export default async function MachinePage({
  params,
}: {
  params: Promise<{ machineId: string }>;
}) {
  const { machineId } = await params;
  return <MachineDetail machineId={machineId} />;
}
