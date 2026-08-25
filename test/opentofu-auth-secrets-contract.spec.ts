import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = join(import.meta.dirname, "..");
const rootDirectory = join(repositoryRoot, "infrastructure/opentofu/roots/auth-secrets");

function _readRootFiles(): string {
	return readdirSync(rootDirectory)
		.filter((fileName) => fileName.endsWith(".tf"))
		.sort()
		.map((fileName) => readFileSync(join(rootDirectory, fileName), "utf8"))
		.join("\n");
}

describe("OpenTofu auth secrets contract", () => {
	const root = _readRootFiles();

	it("should pin the approved toolchain and isolate both environment states", () => {
		expect(root).toContain('required_version = "= 1.12.6"');
		expect(root).toContain('version = "= 0.19.21"');
		expect(root).toContain('version = "= 3.9.0"');
		expect(root).toContain('version = "= 4.3.0"');

		for (const environment of ["staging", "production"]) {
			const backend = readFileSync(
				join(repositoryRoot, `infrastructure/opentofu/environments/${environment}/auth-secrets.s3.tfbackend`),
				"utf8",
			);
			expect(backend.trim()).toBe(`key = "${environment}/auth-secrets/terraform.tfstate"`);
		}
	});

	it("should generate only ephemeral keys with the approved algorithms and encodings", () => {
		expect(root).toMatch(/ephemeral\s+"random_bytes"\s+"refresh_token_hmac_v1"/);
		expect(root).toMatch(/ephemeral\s+"random_bytes"\s+"whatsapp_webhook_verify_token"/);
		expect(root.match(/length\s*=\s*32/g)).toHaveLength(2);
		expect(root).toMatch(/ephemeral\s+"tls_private_key"\s+"microservices_auth_jwt_v1"/);
		expect(root).toMatch(/algorithm\s*=\s*"ECDSA"/);
		expect(root).toMatch(/ecdsa_curve\s*=\s*"P256"/);
		expect(root).toContain("refresh_token_hmac_key_base64url = trimsuffix(");
		expect(root).toContain('replace(ephemeral.random_bytes.refresh_token_hmac_v1.base64, "+", "-")');
		expect(root).toContain('replace(ephemeral.random_bytes.whatsapp_webhook_verify_token.base64, "+", "-")');
		expect(root).toMatch(/replace\([\s\S]*?"\/",[\s\S]*?"_"/);
		expect(root).toContain("private_key_pem_pkcs8");
		expect(root).toContain("-----BEGIN PRIVATE KEY-----");
		expect(root).toContain("-----END PRIVATE KEY-----");
		expect(root).toContain("\\\\s");
		expect(root).not.toMatch(/resource\s+"(?:random_bytes|tls_private_key)"/);
	});

	it("should deliver exactly three generated authentication secrets through Infisical write-only values", () => {
		expect(root.match(/resource\s+"infisical_secret"/g)).toHaveLength(3);
		expect(root.match(/folder_path\s*=\s*"\/generated\/api\/runtime"/g)).toHaveLength(2);
		expect(root).toContain('folder_path      = "/generated/webhooks/runtime"');
		expect(root).toContain('name             = "AUTH_REFRESH_TOKEN_HMAC_KEY_V1_BASE64URL"');
		expect(root).toContain('name             = "MICROSERVICES_AUTH_JWT_PRIVATE_KEY_V1_PKCS8_BASE64"');
		expect(root).toContain('name             = "WHATSAPP_AUTH_WEBHOOK_VERIFY_TOKEN"');
		expect(root.match(/value_wo\s*=/g)).toHaveLength(3);
		expect(root.match(/value_wo_version\s*=/g)).toHaveLength(3);
		expect(root).toMatch(/refresh_token_hmac_key_version\s*=\s*1/);
		expect(root).toMatch(/microservices_auth_jwt_key_version\s*=\s*1/);
		expect(root).toMatch(/whatsapp_webhook_verify_token_version\s*=\s*1/);
		expect(root.match(/prevent_destroy\s*=\s*true/g)).toHaveLength(3);
		expect(root).not.toMatch(/^\s*value\s*=/m);
		expect(root).not.toMatch(/\boutput\s+"/);
	});

	it("should not commit credentials, generated key material, or KMS resources", () => {
		expect(root).not.toMatch(/-----BEGIN PRIVATE KEY-----\s+[A-Za-z0-9+/]{32,}/);
		expect(root).not.toMatch(/\binfisical_kms_/);
		expect(root).not.toMatch(/(?:api_token|api_key|access_key|secret_access_key|private_key|password)\s*=\s*"[^"$]+"/i);
	});

	it("should preserve the API and Webhooks runtime variable contracts", () => {
		const environmentValidation = readFileSync(
			join(repositoryRoot, "apps/api/src/core/config/env.validation.ts"),
			"utf8",
		);
		const wrangler = readFileSync(join(repositoryRoot, "apps/api/wrangler.jsonc"), "utf8");
		const webhooksWrangler = readFileSync(join(repositoryRoot, "apps/workers/webhooks/wrangler.jsonc"), "utf8");

		for (const secretName of [
			"AUTH_REFRESH_TOKEN_HMAC_KEY_V1_BASE64URL",
			"MICROSERVICES_AUTH_JWT_PRIVATE_KEY_V1_PKCS8_BASE64",
		]) {
			expect(environmentValidation).toContain(secretName);
			expect(wrangler).toContain(secretName);
		}
		expect(webhooksWrangler).toContain("WHATSAPP_AUTH_WEBHOOK_VERIFY_TOKEN");
		expect(root).not.toContain('name             = "META_APP_SECRET"');
	});
});
