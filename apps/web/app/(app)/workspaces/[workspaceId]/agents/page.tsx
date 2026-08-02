import { AgentsView } from "@/features/runtime/agents-view";
export default async function AgentsPage({params}:{params:Promise<{workspaceId:string}>}){const{workspaceId}=await params;return <AgentsView workspaceId={workspaceId}/>}
