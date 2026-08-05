-- §18 — a machine belongs to the actor that registered it, and only that
-- actor may speak as it: heartbeat, claim orders, report results. Before
-- this, the machine id in the path was the only thing those routes checked,
-- so any authenticated actor could pull another machine's orders.
--
-- Machines registered before this migration have no recorded owner. They are
-- given a sentinel that matches no credential, which means they can no longer
-- act until they register again under their own identity. That is the point:
-- the alternative is guessing an owner, and a guessed owner is a granted
-- permission nobody asked for.
ALTER TABLE "worker_nodes"
  ADD COLUMN "registeredByType" "ActorType" NOT NULL DEFAULT 'SERVICE',
  ADD COLUMN "registeredById"   TEXT        NOT NULL DEFAULT 'unregistered';

-- The defaults exist only to carry existing rows across. Every row written
-- from here on names its real owner.
ALTER TABLE "worker_nodes" ALTER COLUMN "registeredByType" DROP DEFAULT;
ALTER TABLE "worker_nodes" ALTER COLUMN "registeredById"   DROP DEFAULT;

-- CreateIndex
CREATE INDEX "worker_nodes_registeredByType_registeredById_idx" ON "worker_nodes"("registeredByType", "registeredById");
