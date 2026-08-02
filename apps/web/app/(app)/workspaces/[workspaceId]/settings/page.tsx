import { IntegratedSettings } from "@/features/workspaces/integrated-settings";
export default async function WorkspaceSettingsPage({params}:{params:Promise<{workspaceId:string}>}){const{workspaceId}=await params;return <IntegratedSettings workspaceId={workspaceId}/>}
