import { ArtifactDetail } from "@/features/records/artifact-detail";
export default async function ArtifactPage({params}:{params:Promise<{workspaceId:string;artifactId:string}>}){const{workspaceId,artifactId}=await params;return <ArtifactDetail workspaceId={workspaceId} artifactId={artifactId}/>}
