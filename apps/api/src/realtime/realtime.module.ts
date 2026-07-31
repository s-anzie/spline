import { Module } from "@nestjs/common";

import { AgentModule } from "../modules/agent/agent.module";
import { RealtimeGateway } from "./realtime.gateway";

@Module({
  imports: [AgentModule],
  providers: [RealtimeGateway],
})
export class RealtimeModule {}
