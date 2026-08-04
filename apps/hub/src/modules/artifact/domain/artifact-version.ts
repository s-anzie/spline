import { ActorRef } from "../../identity/domain/actor";

/**
 * §15.2 — each change produces a new version and the old ones stay readable.
 * The §4.10 fields version/checksum/storage_ref live here, not on the
 * artifact: that is what "each change produces a version" means.
 */
export interface ArtifactVersion {
  version: number;
  checksum: string;
  storageRef: string;
  sizeBytes: number | null;
  createdBy: ActorRef;
  createdAt: Date;
  note: string | null;
}

export interface NewArtifactVersion {
  checksum: string;
  storageRef: string;
  sizeBytes?: number;
  note?: string;
}
