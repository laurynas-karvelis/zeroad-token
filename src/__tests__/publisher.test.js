import { beforeEach, describe, expect, test } from "bun:test";
import { PLAN, PUBLISHER_HEADER, TOKEN_HEADER, TOKEN_HEADER_LOWERCASE } from "../constants";
import { createPublisher } from "../publisher";
import { REJECTED } from "../rejection";
import { TOKEN_CHARACTERS } from "../token";
import { bindToHostname, corruptAt, createAuthority, issueCredential, mintToken, } from "./__fixtures__/authority";
const HOSTNAME = "example.com";
const PUBLISHER_ID = "pub_7Fq2xR9nKd";
let authority;
let publisher;
function build(overrides = {}) {
    return createPublisher({
        publisherId: PUBLISHER_ID,
        hostnames: HOSTNAME,
        publicKey: authority.publicKey,
        ...overrides,
    });
}
beforeEach(() => {
    authority = createAuthority();
    publisher = build();
});
describe("createPublisher", () => {
    test("exposes the response header ready to spread into setHeader", () => {
        expect(publisher.headerName).toBe(PUBLISHER_HEADER);
        expect(publisher.headerValue).toBe(`${PUBLISHER_ID}; v=1`);
        expect(publisher.header).toEqual([PUBLISHER_HEADER, `${PUBLISHER_ID}; v=1`]);
    });
    test("exposes the request header name in both casings", () => {
        expect(publisher.tokenHeaderName).toBe(TOKEN_HEADER);
        expect(publisher.tokenHeaderNameLowercase).toBe(TOKEN_HEADER_LOWERCASE);
        expect(publisher.tokenHeaderNameLowercase).toBe(TOKEN_HEADER.toLowerCase());
    });
    test("canonicalises configured hostnames", () => {
        const multi = build({
            hostnames: ["  Example.COM:8080 ", "https://www.example.com/blog"],
        });
        expect(multi.hostnames).toEqual(["example.com", "www.example.com"]);
    });
    test("rejects a publisher id that could inject a header", () => {
        expect(() => build({ publisherId: "pub_abc\r\nX-Evil: 1" })).toThrow(/printable ASCII/);
        expect(() => build({ publisherId: "" })).toThrow(/printable ASCII/);
        expect(() => build({ publisherId: "has space" })).toThrow(/printable ASCII/);
    });
    test("rejects an empty hostname list", () => {
        expect(() => build({ hostnames: [] })).toThrow(/At least one hostname/);
        expect(() => build({ hostnames: "   " })).toThrow(/At least one hostname/);
    });
    test("rejects a public key that is not Ed25519 SPKI", () => {
        expect(() => build({ publicKey: "bm90LWEta2V5" })).toThrow(/SPKI DER Ed25519/);
    });
    test("rejects a negative clock tolerance", () => {
        expect(() => build({ clockToleranceSeconds: -1 })).toThrow(/clockToleranceSeconds/);
    });
});
describe("verify - accepting a genuine token", () => {
    test("accepts a token bound to the configured hostname", async () => {
        const result = await publisher.verify(mintToken(authority, HOSTNAME));
        expect(result.subscriber).toBe(true);
        if (!result.subscriber)
            throw new Error("unreachable");
        expect(result.plan).toBe(PLAN.FREEDOM);
        expect(result.planName).toBe("Freedom");
        expect(result.hostname).toBe(HOSTNAME);
        expect(result.cached).toBe(false);
        expect(result.expiresAt).toBeInstanceOf(Date);
        expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });
    test("accepts the hostname passed explicitly, in any casing or with a port", async () => {
        const token = mintToken(authority, HOSTNAME);
        for (const host of ["example.com", "EXAMPLE.com", "example.com:443", "example.com."]) {
            const result = await publisher.verify(token, host);
            expect(result.subscriber).toBe(true);
        }
    });
    test("takes the first value when the header arrived more than once", async () => {
        const token = mintToken(authority, HOSTNAME);
        const result = await publisher.verify([token, mintToken(authority, "elsewhere.example")]);
        expect(result.subscriber).toBe(true);
    });
    test("serves several hostnames independently", async () => {
        const multi = build({ hostnames: ["example.com", "www.example.com"] });
        const apex = await multi.verify(mintToken(authority, "example.com"), "example.com");
        const www = await multi.verify(mintToken(authority, "www.example.com"), "www.example.com");
        expect(apex.subscriber).toBe(true);
        expect(www.subscriber).toBe(true);
    });
    test("does not fold www into the apex domain", async () => {
        const multi = build({ hostnames: ["example.com", "www.example.com"] });
        const result = await multi.verify(mintToken(authority, "www.example.com"), "example.com");
        expect(result).toMatchObject({
            subscriber: false,
            reason: REJECTED.WRONG_HOSTNAME,
        });
    });
});
describe("verify - visitors without a usable token", () => {
    test.each([
        ["undefined", undefined],
        ["null", null],
        ["empty string", ""],
        ["empty array", []],
    ])("reports %s as missing", async (_label, token) => {
        const result = await publisher.verify(token);
        expect(result).toMatchObject({
            subscriber: false,
            reason: REJECTED.MISSING,
            cached: false,
        });
    });
    test.each([
        ["too short", "abc"],
        ["too long", "a".repeat(TOKEN_CHARACTERS + 1)],
        ["right length, not base64url", "!".repeat(TOKEN_CHARACTERS)],
    ])("reports %s as malformed", async (_label, token) => {
        const result = await publisher.verify(token);
        expect(result).toMatchObject({
            subscriber: false,
            reason: REJECTED.MALFORMED,
        });
    });
    test("reports an unknown plan byte as malformed", async () => {
        const token = mintToken(authority, HOSTNAME, { plan: 99 });
        expect(await publisher.verify(token)).toMatchObject({
            subscriber: false,
            reason: REJECTED.MALFORMED,
        });
    });
    test("reports a future protocol version distinctly, so the fix is obvious", async () => {
        const token = mintToken(authority, HOSTNAME, { version: 2 });
        expect(await publisher.verify(token)).toMatchObject({
            subscriber: false,
            reason: REJECTED.UNSUPPORTED_VERSION,
        });
    });
    test("rejects an expired token", async () => {
        const token = mintToken(authority, HOSTNAME, {
            expiresAt: Math.floor(Date.now() / 1000) - 3600,
        });
        expect(await publisher.verify(token)).toMatchObject({
            subscriber: false,
            reason: REJECTED.EXPIRED,
        });
    });
    test("allows clock tolerance either side of expiry", async () => {
        const justExpired = Math.floor(Date.now() / 1000) - 30;
        const strict = build({ clockToleranceSeconds: 0 });
        const lenient = build({ clockToleranceSeconds: 120 });
        const token = mintToken(authority, HOSTNAME, { expiresAt: justExpired });
        expect(await strict.verify(token)).toMatchObject({
            subscriber: false,
            reason: REJECTED.EXPIRED,
        });
        expect((await lenient.verify(token)).subscriber).toBe(true);
    });
    test("rejects a hostname this publisher does not serve", async () => {
        const result = await publisher.verify(mintToken(authority, "other.example"), "other.example");
        expect(result).toMatchObject({
            subscriber: false,
            reason: REJECTED.UNKNOWN_HOSTNAME,
            hostname: "other.example",
        });
    });
    test("demands a hostname when several are configured", async () => {
        const multi = build({ hostnames: ["a.example", "b.example"] });
        expect(multi.verify(mintToken(authority, "a.example"))).rejects.toThrow(/several hostnames/);
    });
});
describe("verify - attacks the two-tier binding is meant to stop", () => {
    test("one publisher cannot replay a visitor's token at another", async () => {
        // Site A receives a real token, bound to Site A, and tries to spend it at Site B
        const harvested = mintToken(authority, "site-a.example");
        const siteB = build({ hostnames: "site-b.example" });
        const result = await siteB.verify(harvested);
        expect(result).toMatchObject({
            subscriber: false,
            reason: REJECTED.WRONG_HOSTNAME,
        });
    });
    test("rebinding a harvested credential fails without the ephemeral private key", async () => {
        const credential = issueCredential(authority);
        const attackersKey = issueCredential(authority).ephemeralPrivateKey;
        // Everything Site A holds is in `credential.prefix`; the private key is not, so the best it can do
        // is sign the new hostname with some other key it controls
        const forged = bindToHostname(credential, "site-b.example", {
            signingKey: attackersKey,
        });
        const siteB = build({ hostnames: "site-b.example" });
        expect(await siteB.verify(forged)).toMatchObject({
            subscriber: false,
            reason: REJECTED.WRONG_HOSTNAME,
        });
    });
    test("a token signed by anybody but the authority is forged", async () => {
        const impostor = createAuthority();
        const result = await publisher.verify(mintToken(impostor, HOSTNAME));
        expect(result).toMatchObject({
            subscriber: false,
            reason: REJECTED.FORGED,
        });
    });
    test("editing the plan invalidates the authority signature", async () => {
        const token = corruptAt(mintToken(authority, HOSTNAME), 1);
        expect(await publisher.verify(token)).toMatchObject({
            subscriber: false,
            reason: REJECTED.MALFORMED,
        });
    });
    test("extending the expiry invalidates the authority signature", async () => {
        // 0x70000000 is in 2029 and its top byte is 0x70, so flipping that byte's low bit pushes the
        // expiry further out rather than into the past - the point is to prove the signature catches an
        // upgrade attempt, not to re-test the expiry check
        const token = mintToken(authority, HOSTNAME, { expiresAt: 0x70000000 });
        const extended = corruptAt(token, 5);
        expect((await publisher.verify(token)).subscriber).toBe(true);
        expect(await publisher.verify(extended)).toMatchObject({
            subscriber: false,
            reason: REJECTED.FORGED,
        });
    });
    test.each([
        ["ephemeral public key", 6],
        ["authority signature", 38],
        ["nonce", 102],
        ["hostname signature", 110],
    ])("tampering with the %s is caught", async (_field, offset) => {
        const result = await publisher.verify(corruptAt(mintToken(authority, HOSTNAME), offset));
        expect(result.subscriber).toBe(false);
        if (result.subscriber)
            throw new Error("unreachable");
        const cryptographicFailures = [REJECTED.FORGED, REJECTED.WRONG_HOSTNAME];
        expect(cryptographicFailures).toContain(result.reason);
    });
    test("a token from a different origin is not admitted by spoofing the Host header", async () => {
        // The allowlist is the whole defence here: an attacker binds a token to a domain they own and
        // sends it with a Host header naming that domain
        const attackerToken = mintToken(authority, "attacker.example");
        expect(await publisher.verify(attackerToken, "attacker.example")).toMatchObject({
            subscriber: false,
            reason: REJECTED.UNKNOWN_HOSTNAME,
        });
        expect(await publisher.verify(attackerToken, HOSTNAME)).toMatchObject({
            subscriber: false,
            reason: REJECTED.WRONG_HOSTNAME,
        });
    });
});
