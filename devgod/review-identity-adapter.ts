import { createReviewPrincipalAdapter } from "../src/index.ts";

export const reviewIdentityAdapters = {
  devgod_local_seed: createReviewPrincipalAdapter(async ({ authContext }) => {
    const candidate =
      typeof authContext === "object" && authContext !== null
        ? (authContext as Record<string, unknown>)
        : {};

    if (candidate.verified !== true) {
      throw new Error("Auth context principal is not verified");
    }

    const provider = String(candidate.provider ?? "");
    const subject = String(candidate.subject ?? "");
    if (provider !== "devgod-local-seed") {
      throw new Error("Auth context principal provider must be devgod-local-seed");
    }

    switch (subject) {
      case "reviewer-actor":
      case "security-actor":
      case "qa-actor":
        return {
          provider,
          subject,
          verified: true,
          displayName: typeof candidate.displayName === "string" ? candidate.displayName : undefined,
          email: typeof candidate.email === "string" ? candidate.email : undefined
        };
      default:
        throw new Error(`Auth context principal subject is not allowed: ${subject}`);
    }
  })
};

export default createReviewPrincipalAdapter(async () => {
  throw new Error(
      "Select DEVGOD_REVIEW_IDENTITY_BACKEND from reviewIdentityAdapters for local review actions"
  );
});
