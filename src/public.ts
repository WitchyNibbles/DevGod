export {
  createReviewActionContextResolver,
  createReviewPrincipalAdapter,
  loadReviewIdentityBindings,
  loadReviewIdentityFixtures,
  validateReviewIdentityBindings,
  validateReviewIdentityFixtures,
  verifyReviewIdentityAdapter,
  type AuthenticatedPrincipal,
  type CreateReviewActionContextResolverOptions,
  type ResolveReviewActionContext,
  type ReviewActionContextResolverInput,
  type ReviewIdentityActorBinding,
  type ReviewIdentityBindings,
  type ReviewIdentityFixture,
  type ReviewIdentityFixtureDocument,
  type ReviewPrincipalAdapter,
  type ReviewPrincipalAdapterInput,
  type ReviewPrincipalBinding
} from "./core/review-context.ts";
export { DevgodCoreService } from "./core/service.ts";
export {
  composeReviewIdentityAdapters,
  createHeaderReviewIdentityAdapter,
  createStaticReviewIdentityAdapter
} from "./runtime/review-identity-adapters.ts";
export { MemoryStore } from "./store/memory-store.ts";

type AdminModule = typeof import("./admin.ts");

async function loadAdminModule(): Promise<AdminModule> {
  return import("./admin.ts");
}

export const executeStatusCommandFromArgs: AdminModule["executeStatusCommandFromArgs"] = async (...args) => {
  const admin = await loadAdminModule();
  return admin.executeStatusCommandFromArgs(...args);
};

export const executeReportCommandFromArgs: AdminModule["executeReportCommandFromArgs"] = async (...args) => {
  const admin = await loadAdminModule();
  return admin.executeReportCommandFromArgs(...args);
};

export const executeSeedModernizationProofCommandFromArgs: AdminModule["executeSeedModernizationProofCommandFromArgs"] = async (
  ...args
) => {
  const admin = await loadAdminModule();
  return admin.executeSeedModernizationProofCommandFromArgs(...args);
};
