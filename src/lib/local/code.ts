const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const CODE_LENGTH = 8;
const UNBIASED_LIMIT = 256 - (256 % ALPHABET.length);

export const CODE_RE = /^[a-hjkmnp-z2-9]{8}$/;

export function newMatchCode(): string {
  let code = "";
  while (code.length < CODE_LENGTH) {
    for (const byte of crypto.getRandomValues(new Uint8Array(CODE_LENGTH * 2))) {
      if (byte < UNBIASED_LIMIT && code.length < CODE_LENGTH) code += ALPHABET[byte % ALPHABET.length];
    }
  }
  return code;
}
