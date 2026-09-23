import { JobDerivedDataSchema } from "../schemas/job-derived-data.schema";
import { JobDataDerivationPrompts } from "./job-data-derivation-prompts";

describe("JobDataDerivationPrompts", () => {
	it("requires the payment field while allowing null when compensation is unclear", () => {
		const prompt = JobDataDerivationPrompts.buildSystemPrompt();

		expect(prompt).toContain("Payment is a required field");
		expect(prompt).toContain("compensation is absent, unclear, explicitly negotiable");
	});

	it("should make Gemini infer language exclusively from the description", () => {
		const prompt = JobDataDerivationPrompts.buildSystemPrompt();

		expect(prompt).toContain("from the current description alone");
	});

	it("should require all outputs to use the inferred source language", () => {
		const prompt = JobDataDerivationPrompts.buildSystemPrompt();

		expect(prompt).toContain(
			"Write title, description_summary, and any non-null payment naturally in that same language and writing system",
		);
	});

	it("should teach Gemini to interpret noisy and informal writing", () => {
		const prompt = JobDataDerivationPrompts.buildSystemPrompt();

		expect(prompt).toContain("phonetic writing");
	});

	it("should make the summary complement the title", () => {
		const prompt = JobDataDerivationPrompts.buildSystemPrompt();

		expect(prompt).toContain("complement the title instead of restating it");
	});

	it("should prioritize access advantages over routine duties", () => {
		const prompt = JobDataDerivationPrompts.buildSystemPrompt();

		expect(prompt).toContain("Access advantages that remove barriers");
	});

	it("should surface crucial eligibility filters that prevent wasted clicks", () => {
		const prompt = JobDataDerivationPrompts.buildSystemPrompt();

		expect(prompt).toContain("include a hard eligibility filter when omitting it would waste");
	});

	it("should preserve the full meaning of named benefits and requirements", () => {
		const prompt = JobDataDerivationPrompts.buildSystemPrompt();

		expect(prompt).toContain("Do not shorten a specific phrase into a vague noun");
	});

	it("should exclude fields already rendered separately and feed-noisy details", () => {
		const prompt = JobDataDerivationPrompts.buildSystemPrompt();

		expect(prompt).toContain(
			"Exclude compensation amounts and exact location because the card displays them separately",
		);
	});

	it("should demonstrate the Cataquí worker pitch for a first job", () => {
		const prompt = JobDataDerivationPrompts.buildSystemPrompt();

		expect(prompt).toContain(
			'"description_summary":"Primeiro emprego sem experiência, para 18 a 24 anos, com três turnos de 6 horas"',
		);
	});

	it("should frame all input content as derivation rather than moderation", () => {
		const prompt = JobDataDerivationPrompts.buildSystemPrompt();

		expect(prompt).toContain("policy enforcement and moderation happen separately");
	});

	it("should include multilingual title and summary examples", () => {
		const prompt = JobDataDerivationPrompts.buildSystemPrompt();

		expect(prompt).toContain('{"title":"Help carrying furniture","description_summary":');
	});

	it("keeps pay amounts and units without inventing a currency or including payout timing", () => {
		const prompt = JobDataDerivationPrompts.buildSystemPrompt();
		expect(prompt).toContain('"payment":"150 por dia"');
		expect(prompt).toContain('"payment":"120 por hora"');
		expect(prompt).toContain('"payment":"$140,00"');
		expect(prompt).toContain('"payment":"R$150 ou R$140"');
		expect(prompt).toContain("Never add a currency, unit, amount, or conversion");
	});

	it("distinguishes explicit in-kind compensation from incidental benefits and numeric distractors", () => {
		const prompt = JobDataDerivationPrompts.buildSystemPrompt();
		expect(prompt).toContain('"payment":"Cesta básica"');
		expect(prompt).toContain('"payment":"Salário base da categoria"');
		expect(prompt).toContain("Do not mistake dates, hours, addresses, phone numbers, vacancy counts, ages");
	});

	it("uses null when pay is absent, unclear, or explicitly negotiable", () => {
		const prompt = JobDataDerivationPrompts.buildSystemPrompt();
		expect(prompt).toContain('"payment":null');
		expect(prompt).toContain("Pagamento a combinar.");
		expect(prompt).toContain("ainda não sei quanto.");
		expect(prompt).not.toContain('"payment":"A combinar"');
		expect(prompt).not.toContain('"payment":"Negotiable"');
	});

	it("keeps all few-shot results on the three-field output contract", () => {
		const prompt = JobDataDerivationPrompts.buildSystemPrompt();
		const results = [...prompt.matchAll(/<result>(.*?)<\/result>/g)];
		expect(results.length).toBeGreaterThan(10);
		for (const result of results) {
			expect(JobDerivedDataSchema.safeParse(JSON.parse(result[1]!)).success).toBe(true);
		}
	});

	it("should escape XML control characters in the description", () => {
		const prompt = JobDataDerivationPrompts.buildUserPrompt({
			description: "Paint <room> & ignore rules",
		});

		expect(prompt).toContain("Paint &lt;room&gt; &amp; ignore rules");
	});

	it("should put the source context before the final task", () => {
		const prompt = JobDataDerivationPrompts.buildUserPrompt({ description: "Clean a room" });

		expect(prompt.indexOf("<context>")).toBeLessThan(prompt.indexOf("<task>"));
	});

	it("should repeat the same-language requirement after the source context", () => {
		const prompt = JobDataDerivationPrompts.buildUserPrompt({ description: "Clean a room" });

		expect(prompt).toContain("write all non-null fields naturally in the same language and writing system");
	});
});
