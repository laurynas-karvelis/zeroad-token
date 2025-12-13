import { generateKeys } from "../crypto";
import { log } from "../logger";

const { privateKey, publicKey } = generateKeys();

log("info", "Public Key:", publicKey);
log("info", "Private Key:", privateKey);
