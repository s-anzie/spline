import { BadRequestException, Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../../identity/interface";
import { RegisterMachineUseCase } from "../application/register-machine.use-case";
import { LocalMachine } from "../domain/local-machine";
import { RegisterMachineDto } from "./dto/register-machine.dto";

function toMachineResponse(machine: LocalMachine) {
  return {
    id: machine.id.toString(),
    hostname: machine.hostname,
    os: machine.os,
    workspaceIds: machine.workspaceIds,
    runtimeStatus: machine.runtimeStatus,
    lastSeenAt: machine.lastSeenAt?.toISOString() ?? null,
    createdAt: machine.createdAt.toISOString(),
    updatedAt: machine.updatedAt.toISOString(),
  };
}

/** Global registration — no workspace yet at this point, so JwtAuthGuard only (see MachineController for workspace-scoped routes). */
@Controller("machines")
@UseGuards(JwtAuthGuard)
export class MachineRegistrationController {
  constructor(private readonly registerMachineUseCase: RegisterMachineUseCase) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterMachineDto) {
    const result = await this.registerMachineUseCase.execute(dto);
    if (result.isFailure) {
      throw new BadRequestException(result.error.message);
    }
    return { ...toMachineResponse(result.value.machine), token: result.value.plainTextToken };
  }
}
