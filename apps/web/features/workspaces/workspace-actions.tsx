"use client";

import { FormEvent,useState } from "react";
import { Archive,Copy,MoreHorizontal,Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuSeparator,DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { LoadingButton } from "@/components/ui/loading-button";
import type { Workspace } from "@/lib/api/types";
import { useWorkspaceStore } from "@/stores/workspace-store";

type Mode="rename"|"duplicate"|"archive"|null;
export function WorkspaceActions({workspace}:{workspace:Workspace}){const[mode,setMode]=useState<Mode>(null);const update=useWorkspaceStore(s=>s.updateWorkspace);const loading=useWorkspaceStore(s=>s.loading);const error=useWorkspaceStore(s=>s.error);async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();if(!mode)return;const value=String(new FormData(e.currentTarget).get("name")??"");try{await update(workspace.id,mode,value);setMode(null);}catch{/* L'erreur reste visible. */}}return <><DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs"/>}><MoreHorizontal/></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={()=>setMode("rename")}><Pencil/>Renommer</DropdownMenuItem><DropdownMenuItem onClick={()=>setMode("duplicate")}><Copy/>Dupliquer</DropdownMenuItem><DropdownMenuSeparator/><DropdownMenuItem onClick={()=>setMode("archive")} variant="destructive"><Archive/>Archiver</DropdownMenuItem></DropdownMenuContent></DropdownMenu><Dialog open={mode!==null} onOpenChange={open=>!open&&setMode(null)}><DialogContent className="border-white/10 bg-[#1b1918] text-[#f2efea]"><DialogHeader><DialogTitle>{mode==="rename"?"Renommer le workspace":mode==="duplicate"?"Dupliquer le workspace":"Archiver le workspace"}</DialogTitle><DialogDescription>{mode==="archive"?"Il disparaîtra des espaces actifs. Cette action est enregistrée par le backend.":"Choisissez un nom explicite pour éviter toute confusion entre les contextes."}</DialogDescription></DialogHeader><form onSubmit={submit} className="grid gap-4">{mode!=="archive"&&<Input name="name" required autoFocus defaultValue={mode==="duplicate"?`${workspace.name} — copie`:workspace.name}/>} {error&&<p className="text-[10px] text-red-300">{error}</p>}<LoadingButton type="submit" loading={loading} loadingText="Traitement…" variant={mode==="archive"?"destructive":"default"}>{mode==="archive"?"Confirmer l’archivage":mode==="duplicate"?"Créer la copie":"Enregistrer"}</LoadingButton></form></DialogContent></Dialog></>}
