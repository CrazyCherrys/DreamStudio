CREATE TYPE "execution_profile_routing_role" AS ENUM ('primary_generation', 'reference_edit');

ALTER TABLE "ai_model_execution_profiles"
  ADD COLUMN "routing_role" "execution_profile_routing_role";

ALTER TABLE "ai_model_execution_profile_revisions"
  ADD COLUMN "routing_role" "execution_profile_routing_role";

CREATE INDEX "ai_model_execution_profiles_routing_role_idx"
  ON "ai_model_execution_profiles"("routing_role");

CREATE INDEX "ai_model_execution_profile_revisions_routing_role_idx"
  ON "ai_model_execution_profile_revisions"("routing_role");
