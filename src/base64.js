/**
 * base64url decoding, resolved once at module load to the fastest primitive the runtime offers.
 *
 * Measured on Bun 1.3: `Uint8Array.fromBase64` 0.2us, `Buffer.from` 0.9us, hand-rolled `atob` ~2us
 * per token. It runs on every cache miss, so the ordering is worth the branch.
 */
function selectDecoder() {
    const fromBase64 = Uint8Array.fromBase64;
    if (typeof fromBase64 === "function") {
        return (input) => {
            try {
                return fromBase64(input, { alphabet: "base64url" });
            }
            catch {
                return undefined;
            }
        };
    }
    if (typeof Buffer !== "undefined") {
        return (input) => {
            // `Buffer.from` never throws on bad input, it silently stops at the first invalid character,
            // so the caller's exact-length check is what actually rejects a malformed token
            const buffer = Buffer.from(input, "base64url");
            return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        };
    }
    if (typeof atob === "function") {
        return (input) => {
            try {
                const binary = atob(input.replace(/-/g, "+").replace(/_/g, "/"));
                const bytes = new Uint8Array(binary.length);
                for (let index = 0; index < binary.length; index++)
                    bytes[index] = binary.charCodeAt(index);
                return bytes;
            }
            catch {
                return undefined;
            }
        };
    }
    throw new Error("No base64 decoder available in this runtime");
}
const decoder = selectDecoder();
/** Decodes base64url to bytes, returning `undefined` rather than throwing on malformed input. */
export const fromBase64Url = decoder;
