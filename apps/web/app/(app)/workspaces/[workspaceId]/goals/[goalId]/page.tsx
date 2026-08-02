import { GoalDetail } from "@/features/planning/goal-detail";
export default async function GoalPage({params}:{params:Promise<{workspaceId:string;goalId:string}>}){const{workspaceId,goalId}=await params;return <GoalDetail workspaceId={workspaceId} goalId={goalId}/>}
