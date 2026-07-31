/**
 * Same rationale as AGENT_TOKEN_PREFIX: opaque, instantly-revocable token,
 * shape "machine_<credentialId>.<secret>". This token authenticates a
 * LocalMachine daemon's outbound WS connection to MachineGateway only — it
 * never flows through RequesterResolver/JwtAuthGuard (a machine isn't an
 * ActorType/RBAC actor).
 */
export const MACHINE_TOKEN_PREFIX = "machine_";
