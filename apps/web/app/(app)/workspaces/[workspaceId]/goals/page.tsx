import { GoalsPortfolio } from "@/features/planning/goals-portfolio";
export default async function GoalsPage({params}:{params:Promise<{workspaceId:string}>}){const{workspaceId}=await params;return <GoalsPortfolio workspaceId={workspaceId}/>}
