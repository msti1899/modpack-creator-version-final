import { generateKeyPairSync, sign } from "node:crypto";

const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
export const clerk = {
  jwtKey: keys.publicKey.export({ type: "spki", format: "pem" }).toString(),
  issuer: "https://clerk.example.test", authorizedParties: ["http://localhost:3000"],
};
export function clerkToken(claims = {}) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const content = `${encode({ alg: "RS256", typ: "JWT", kid: "fixture" })}.${encode({
    sub: "user_player", sid: "sess_player", iss: clerk.issuer, azp: clerk.authorizedParties[0],
    email: "player@example.test", role: "authenticated", iat: now, nbf: now - 1, exp: now + 300, ...claims,
  })}`;
  return `${content}.${sign("RSA-SHA256", Buffer.from(content), keys.privateKey).toString("base64url")}`;
}
