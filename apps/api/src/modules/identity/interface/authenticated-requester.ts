import { ActorType } from "@repo/db";
import { Request } from "express";

export interface AuthenticatedRequester {
  type: ActorType;
  id: string;
}

export interface RequestWithRequester extends Request {
  requester?: AuthenticatedRequester;
}
