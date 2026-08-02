import { SetMetadata } from "@nestjs/common";

export const SKIP_RESOURCE_CHECK_METADATA_KEY = "spline:skip_resource_check";

/**
 * Opts a handler out of PermissionsGuard's generic "does :xId already belong
 * to :workspaceId" check. Needed for actions whose entire job is to
 * establish that membership (e.g. linking a machine to a workspace for the
 * first time) — the generic check would otherwise require the membership to
 * already exist before allowing the request that creates it.
 */
export const SkipResourceCheck = (): MethodDecorator =>
  SetMetadata(SKIP_RESOURCE_CHECK_METADATA_KEY, true);
