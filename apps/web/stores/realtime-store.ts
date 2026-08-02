"use client";
import { create } from "zustand";
export const useRealtimeStore=create<{connected:boolean;lastEvent:string|null;setConnected:(value:boolean)=>void;setLastEvent:(value:string)=>void}>((set)=>({connected:false,lastEvent:null,setConnected:(connected)=>set({connected}),setLastEvent:(lastEvent)=>set({lastEvent})}));
