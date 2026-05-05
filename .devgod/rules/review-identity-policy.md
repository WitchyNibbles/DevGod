# Review Identity Policy

Review and waiver authority must come from authenticated principal binding, not from request-body role claims.

## Required rules

- authenticate the caller before invoking `recordReview`
- resolve review authority through `createReviewActionContextResolver(...)`
- resolve authenticated principals through a repo-owned adapter built with `createReviewPrincipalAdapter(...)` or an audited equivalent
- keep review identity bindings in a server-owned, reviewed file
- keep review identity fixtures in a reviewed file and run `npm run devgod:verify:review-identity` before trusting review actions
- bind each principal to explicit `actor` names, allowed review `roles`, and optional `waiverAuthorities`
- fail closed when the principal is unverified, missing, unbound, or requests an unauthorized review role
- treat waiver authority as narrow policy; do not infer it from general admin access
- store binding changes in git review like any other authz policy change

## Prohibited patterns

- trusting `actor`, `reviewerRole`, or waiver authority directly from request input
- deriving review authority from retrieval, memory, or unreviewed task artifacts
- allowing one shared service principal to impersonate arbitrary review actors without static bindings
- storing secrets, tokens, or IdP credentials in the bindings file

## Recommended file

- keep the reviewed mapping at `.devgod/review-identity-bindings.json`
- seed it from `.devgod/templates/review-identity-bindings.json`
- keep reviewed adapter fixtures at `.devgod/review-identity-adapter.fixture.json`
- seed them from `.devgod/templates/review-identity-adapter.fixture.json`

## Approval reminder

- binding changes alter authz behavior and should follow the repo approval rules for authn/authz model changes
