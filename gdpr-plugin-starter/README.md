# DashingCommerce GDPR Starter Scaffold

This folder is a handoff starting point for a `dashcommerce.gdpr` extension module.

Use this as a low-risk reference copy:

- `manifest.ts`: module manifest and compatibility contract
- `src/types.ts`: provider contracts and request/status enums
- `src/module.ts`: `registerModule(host)` lifecycle scaffold and extension seam usage
- `src/index.ts`: module entrypoint exports

This scaffold intentionally does not touch core commerce behavior.

Recommended next steps:

1. Replace all placeholder host types/method signatures with the actual public host API.
2. Move this folder into a dedicated module repository/package.
3. Add migration scripts and persistence layer in the same namespace (`dc_gdpr_*`).
4. Implement real provider adapters and orchestration services.
5. Add tests for:
	- manifest compatibility checks
	- route mount + hooks registration
	- provider failures and partial completion states
	- idempotent request replay

