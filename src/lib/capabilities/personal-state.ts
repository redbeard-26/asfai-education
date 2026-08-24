import { z } from "zod";
import { studentRoomSchema, roomMembershipSchema } from "@/lib/capabilities/classroom";
import { progressEnvelopeSchema } from "@/lib/lessons/schemas";
import { verifySignedProgressEnvelope } from "@/lib/lessons/progress";

const timestampSchema = z.string().datetime({ offset: true });

export const signedProgressEnvelopeSchema = z.object({
  envelope: progressEnvelopeSchema,
  signature: z.string().min(1),
  publicKeyPem: z.string().min(1),
  signerFingerprint: z.string().regex(/^[a-f0-9]{64}$/i),
  signerWebId: z.string().url().optional(),
});

export const classroomExchangeStoreSchema = z.object({
  schemaVersion: z.literal("0.1"),
  ownerId: z.string(),
  ownerRole: z.enum(["learner", "teacher"]),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  rooms: z.record(z.string(), studentRoomSchema),
  memberships: z.record(z.string(), roomMembershipSchema),
  inbox: z.array(signedProgressEnvelopeSchema).max(5000),
  outbox: z.array(signedProgressEnvelopeSchema).max(5000),
  receipts: z.record(z.string(), z.object({ receivedAt: timestampSchema, signerFingerprint: z.string() })),
});

export type ClassroomExchangeStore = z.infer<typeof classroomExchangeStoreSchema>;
export type SignedProgressEnvelope = z.infer<typeof signedProgressEnvelopeSchema>;

export function newClassroomExchangeStore(ownerRole: "learner" | "teacher", ownerId = `urn:uuid:${crypto.randomUUID()}`): ClassroomExchangeStore {
  const now = new Date().toISOString();
  return { schemaVersion: "0.1", ownerId, ownerRole, createdAt: now, updatedAt: now, rooms: {}, memberships: {}, inbox: [], outbox: [], receipts: {} };
}

export function parseClassroomExchangeStore(input?: unknown, ownerRole: "learner" | "teacher" = "learner") {
  return input ? classroomExchangeStoreSchema.parse(input) : newClassroomExchangeStore(ownerRole);
}

export function putClassroomRoom(storeInput: unknown, roomInput: unknown) {
  const store = classroomExchangeStoreSchema.parse(storeInput);
  if (store.ownerRole !== "teacher") throw new Error("Only a teacher-owned classroom store can retain room definitions.");
  const room = studentRoomSchema.parse(roomInput);
  const updatedAt = new Date().toISOString();
  return { store: classroomExchangeStoreSchema.parse({ ...store, updatedAt, rooms: { ...store.rooms, [room.id]: room } }), room };
}

export function putClassroomMembership(storeInput: unknown, membershipInput: unknown) {
  const store = classroomExchangeStoreSchema.parse(storeInput);
  if (store.ownerRole !== "learner") throw new Error("Room memberships belong in a learner-owned classroom store.");
  const membership = roomMembershipSchema.parse(membershipInput);
  const updatedAt = new Date().toISOString();
  return { store: classroomExchangeStoreSchema.parse({ ...store, updatedAt, memberships: { ...store.memberships, [membership.id]: membership } }), membership };
}

export function queueClassroomEnvelope(storeInput: unknown, signedInput: unknown) {
  const store = classroomExchangeStoreSchema.parse(storeInput);
  const signed = signedProgressEnvelopeSchema.parse(signedInput);
  const verified = verifySignedProgressEnvelope(signed);
  if (!verified.integrityValid || !verified.signatureValid) throw new Error("The progress envelope signature or integrity digest is invalid.");
  if (!("signerFingerprint" in verified) || verified.signerFingerprint !== signed.signerFingerprint) throw new Error("The signer fingerprint does not match the supplied public key.");
  const expectedRole = store.ownerRole === "teacher" ? "teacher" : "learner";
  if (signed.envelope.senderRole !== expectedRole) throw new Error(`A ${store.ownerRole}-owned outbox cannot send as '${signed.envelope.senderRole}'.`);
  if (store.outbox.some((item) => item.envelope.id === signed.envelope.id)) return { store, duplicate: true };
  return { store: classroomExchangeStoreSchema.parse({ ...store, updatedAt: new Date().toISOString(), outbox: [...store.outbox, signed] }), duplicate: false };
}

export function acceptClassroomEnvelope(storeInput: unknown, signedInput: unknown) {
  const store = classroomExchangeStoreSchema.parse(storeInput);
  const signed = signedProgressEnvelopeSchema.parse(signedInput);
  const verified = verifySignedProgressEnvelope(signed);
  if (!verified.integrityValid || !verified.signatureValid) throw new Error("The progress envelope signature or integrity digest is invalid.");
  if (!("signerFingerprint" in verified) || verified.signerFingerprint !== signed.signerFingerprint) throw new Error("The signer fingerprint does not match the supplied public key.");
  const expectedRole = store.ownerRole === "teacher" ? "teacher" : "learner";
  if (signed.envelope.recipientRole !== expectedRole) throw new Error(`This envelope is addressed to '${signed.envelope.recipientRole}', not '${expectedRole}'.`);
  if (store.receipts[signed.envelope.id]) return { store, duplicate: true, verified };
  const receivedAt = new Date().toISOString();
  return {
    store: classroomExchangeStoreSchema.parse({
      ...store,
      updatedAt: receivedAt,
      inbox: [...store.inbox, signed],
      receipts: { ...store.receipts, [signed.envelope.id]: { receivedAt, signerFingerprint: signed.signerFingerprint } },
    }),
    duplicate: false,
    verified,
  };
}

export function classroomExchangeSummary(storeInput: unknown) {
  const store = classroomExchangeStoreSchema.parse(storeInput);
  return {
    ownerId: store.ownerId,
    ownerRole: store.ownerRole,
    roomCount: Object.keys(store.rooms).length,
    membershipCount: Object.keys(store.memberships).length,
    inboxCount: store.inbox.length,
    outboxCount: store.outbox.length,
    receiptCount: Object.keys(store.receipts).length,
    updatedAt: store.updatedAt,
  };
}
