"use client";

import { create } from "zustand";
import { planningApi } from "@/lib/api/planning";
import type { Goal, GoalStatus, Priority, Task, TaskStatus } from "@/lib/api/types";
import { useAuthStore } from "./auth-store";

type PlanningState = {
  workspaceId: string | null; goals: Goal[]; tasks: Task[];
  loading: boolean; mutating: boolean; error: string | null;
  load: (workspaceId: string, force?: boolean) => Promise<void>;
  createGoal: (workspaceId: string, input: { title: string; description?: string; priority?: Priority }) => Promise<Goal>;
  createTask: (workspaceId: string, input: { title: string; description?: string; goalId?: string; priority?: Priority }) => Promise<Task>;
  updateGoal:(goalId:string,input:unknown)=>Promise<void>;
  updateTask:(taskId:string,input:unknown)=>Promise<void>;
  linkTaskToGoal:(taskId:string,goalId:string)=>Promise<void>;
  goalAction:(goalId:string,action:"status"|"blocker"|"validate"|"reject",value?:string)=>Promise<void>;
  taskAction:(taskId:string,action:"status"|"blocker"|"validate"|"reject"|"assign",value?:string,actorType?:string)=>Promise<void>;
  reset: () => void;
};

function token() {
  const value = useAuthStore.getState().token;
  if (!value) throw new Error("Session requise");
  return value;
}

export const usePlanningStore = create<PlanningState>((set, get) => ({
  workspaceId: null, goals: [], tasks: [], loading: false, mutating: false, error: null,
  load: async (workspaceId, force = false) => {
    if (get().workspaceId === workspaceId && !force) return;
    const changingWorkspace = get().workspaceId !== workspaceId;
    set({
      workspaceId,
      goals: changingWorkspace ? [] : get().goals,
      tasks: changingWorkspace ? [] : get().tasks,
      loading: changingWorkspace,
      error: null,
    });
    try {
      const [goals, tasks] = await Promise.all([planningApi.goals(workspaceId, token()), planningApi.tasks(workspaceId, token())]);
      if (get().workspaceId === workspaceId) set({ goals, tasks, loading: false });
    } catch (error) {
      if (get().workspaceId === workspaceId) set({ loading: false, error: error instanceof Error ? error.message : "Plan indisponible" });
    }
  },
  createGoal: async (workspaceId, input) => {
    set({ mutating: true, error: null });
    try { const goal = await planningApi.createGoal(workspaceId, input, token()); set((state) => ({ goals: [...state.goals, goal], mutating: false })); return goal; }
    catch (error) { set({ mutating: false, error: error instanceof Error ? error.message : "Création impossible" }); throw error; }
  },
  createTask: async (workspaceId, input) => {
    set({ mutating: true, error: null });
    try { const task = await planningApi.createTask(workspaceId, input, token()); set((state) => ({ tasks: [...state.tasks, task], mutating: false })); return task; }
    catch (error) { set({ mutating: false, error: error instanceof Error ? error.message : "Création impossible" }); throw error; }
  },
  updateGoal:async(goalId,input)=>{const workspaceId=get().workspaceId;if(!workspaceId)return;set({mutating:true,error:null});try{const goal=await planningApi.updateGoal(workspaceId,goalId,input,token());set(state=>({goals:state.goals.map(item=>item.id===goal.id?goal:item),mutating:false}));}catch(error){set({mutating:false,error:error instanceof Error?error.message:"Mise à jour impossible"});throw error;}},
  updateTask:async(taskId,input)=>{const workspaceId=get().workspaceId;if(!workspaceId)return;set({mutating:true,error:null});try{const task=await planningApi.updateTask(workspaceId,taskId,input,token());set(state=>({tasks:state.tasks.map(item=>item.id===task.id?task:item),mutating:false}));}catch(error){set({mutating:false,error:error instanceof Error?error.message:"Mise à jour impossible"});throw error;}},
  linkTaskToGoal:async(taskId,goalId)=>{const workspaceId=get().workspaceId;if(!workspaceId)return;set({mutating:true,error:null});try{const task=await planningApi.linkTaskToGoal(workspaceId,taskId,goalId,token());const [goals,tasks]=await Promise.all([planningApi.goals(workspaceId,token()),planningApi.tasks(workspaceId,token())]);set({goals,tasks:tasks.map(item=>item.id===task.id?task:item),mutating:false});}catch(error){set({mutating:false,error:error instanceof Error?error.message:"Rattachement impossible"});throw error;}},
  goalAction:async(goalId,action,value)=>{
    const workspaceId=get().workspaceId;if(!workspaceId)return;set({mutating:true,error:null});
    try{let goal:Goal;if(action==="status")goal=await planningApi.goalStatus(workspaceId,goalId,value as GoalStatus,token());else if(action==="blocker")goal=await planningApi.goalBlocker(workspaceId,goalId,value??"",token());else goal=await planningApi.goalReview(workspaceId,goalId,action,token());set(state=>({goals:state.goals.map(item=>item.id===goal.id?goal:item),mutating:false}));}
    catch(error){set({mutating:false,error:error instanceof Error?error.message:"Action impossible"});throw error;}
  },
  taskAction:async(taskId,action,value,actorType="AGENT")=>{
    const workspaceId=get().workspaceId;if(!workspaceId)return;set({mutating:true,error:null});
    try{let task:Task;if(action==="status")task=await planningApi.taskStatus(workspaceId,taskId,value as TaskStatus,token());else if(action==="blocker")task=await planningApi.taskBlocker(workspaceId,taskId,value??"",token());else if(action==="assign")task=await planningApi.assignTask(workspaceId,taskId,actorType,value??"",token());else task=await planningApi.taskReview(workspaceId,taskId,action,token());set(state=>({tasks:state.tasks.map(item=>item.id===task.id?task:item),mutating:false}));}
    catch(error){set({mutating:false,error:error instanceof Error?error.message:"Action impossible"});throw error;}
  },
  reset: () => set({ workspaceId: null, goals: [], tasks: [], loading: false, mutating: false, error: null }),
}));
