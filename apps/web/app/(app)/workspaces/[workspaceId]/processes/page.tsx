import { ProcessesView } from "@/features/runtime/processes-view";
export default async function ProcessesPage({params}:{params:Promise<{workspaceId:string}>}){const{workspaceId}=await params;return <ProcessesView workspaceId={workspaceId}/>}
