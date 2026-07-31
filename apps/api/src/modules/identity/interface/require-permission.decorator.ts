import { SetMetadata } from "@nestjs/common";

import { Permission } from "../domain/permission";

export const PERMISSION_METADATA_KEY = "spline:required_permission";

export const RequirePermission = (permission: Permission): MethodDecorator =>
  SetMetadata(PERMISSION_METADATA_KEY, permission);
