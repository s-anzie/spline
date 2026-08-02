import { ExecutionView } from "@/features/runtime/execution-view";
export default async function ExecutionPage({params}:{params:Promise<{workspaceId:string}>}){const{workspaceId}=await params;return <ExecutionView workspaceId={workspaceId}/>}
