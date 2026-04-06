export type GdprModuleManifest = {
	id: string;
	displayName: string;
	version: string;
	description: string;
	author: string;
	license: string;
	repository?: string;
	homepage?: string;
	compatibility: {
		dashCommerce: string;
		emDash?: string;
	};
	capabilities: string[];
	entrypoint: string;
	migrations?: string[];
	configSchema?: string;
};

export const gdprModuleManifest: GdprModuleManifest = {
	id: "dashcommerce.gdpr",
	displayName: "DashingCommerce GDPR Module",
	version: "0.1.0",
	description:
		"Optional reference module that provides GDPR workflows (access, erase, anonymize, audit) through public commerce extension seams.",
	author: "TBD",
	license: "MIT",
	compatibility: {
		dashCommerce: ">=1.4 <2.0",
		emDash: ">=2.1 <3.0",
	},
	capabilities: [
		"gdpr.data-export",
		"gdpr.erase",
		"gdpr.pseudonymize",
		"gdpr.rectify",
		"gdpr.access",
		"gdpr.retention",
		"gdpr.admin-ui",
		"gdpr.jobs",
	],
	entrypoint: "dist/index.js",
	migrations: ["0001_create_gdpr_tables"],
	configSchema: "gdpr-config",
};
