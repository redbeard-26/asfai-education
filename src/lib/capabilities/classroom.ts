import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const timestampSchema = z.string().datetime({ offset: true });

export const studentRoomSchema = z.object({
  schemaVersion: z.literal("0.1"),
  id: z.string(),
  version: z.number().int().positive(),
  title: z.string().min(1).max(300),
  description: z.string().max(4000),
  status: z.enum(["draft", "published", "closed"]),
  capabilityIds: z.array(z.string()).min(1).max(50),
  objectiveIds: z.array(z.string()).max(100),
  resourceIds: z.array(z.string()).max(100),
  audience: z.object({ ageRange: z.string().max(100), locale: z.string().max(50).default("en") }),
  access: z.object({ mode: z.enum(["code", "link", "roster"]), joinCodeSalt: z.string().optional(), joinCodeDigest: z.string().optional(), rosterRef: z.string().optional() }),
  policy: z.object({
    teacherVisibility: z.enum(["completion", "scoped-progress", "approved-artifacts"]),
    retainRawConversation: z.literal(false),
    allowedSourceRefs: z.array(z.string()).max(100),
    learnerCanExport: z.boolean().default(true),
    learnerCanDelete: z.boolean().default(true),
    trustedAdultInstructions: z.string().max(2000).optional(),
  }),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  publishedAt: timestampSchema.optional(),
  closedAt: timestampSchema.optional(),
});

export const roomMembershipSchema = z.object({
  schemaVersion: z.literal("0.1"),
  id: z.string(),
  roomId: z.string(),
  roomVersion: z.number().int().positive(),
  participantId: z.string(),
  status: z.enum(["active", "completed", "left"]),
  joinedAt: timestampSchema,
  updatedAt: timestampSchema,
});

function codeDigest(code: string, salt: string) {
  return createHash("sha256").update(`${salt}:${code.trim().toUpperCase()}`).digest("hex");
}

function codeMatches(code: string, salt: string, expected: string) {
  const actual = Buffer.from(codeDigest(code, salt), "hex");
  const stored = Buffer.from(expected, "hex");
  return actual.length === stored.length && timingSafeEqual(actual, stored);
}

export function createStudentRoom(input: {
  title: string;
  description?: string;
  capabilityIds: string[];
  objectiveIds?: string[];
  resourceIds?: string[];
  ageRange: string;
  locale?: string;
  accessMode?: "code" | "link" | "roster";
  rosterRef?: string;
  teacherVisibility?: "completion" | "scoped-progress" | "approved-artifacts";
  allowedSourceRefs?: string[];
  trustedAdultInstructions?: string;
}) {
  const now = new Date().toISOString();
  const accessMode = input.accessMode ?? "code";
  const joinCode = accessMode === "code" ? randomBytes(6).toString("hex").toUpperCase() : undefined;
  const joinCodeSalt = joinCode ? randomBytes(16).toString("hex") : undefined;
  const room = studentRoomSchema.parse({
    schemaVersion: "0.1",
    id: `urn:uuid:${crypto.randomUUID()}`,
    version: 1,
    title: input.title,
    description: input.description ?? "",
    status: "draft",
    capabilityIds: input.capabilityIds,
    objectiveIds: input.objectiveIds ?? [],
    resourceIds: input.resourceIds ?? [],
    audience: { ageRange: input.ageRange, locale: input.locale ?? "en" },
    access: { mode: accessMode, joinCodeSalt, joinCodeDigest: joinCode && joinCodeSalt ? codeDigest(joinCode, joinCodeSalt) : undefined, rosterRef: input.rosterRef },
    policy: {
      teacherVisibility: input.teacherVisibility ?? "scoped-progress",
      retainRawConversation: false,
      allowedSourceRefs: input.allowedSourceRefs ?? [],
      trustedAdultInstructions: input.trustedAdultInstructions,
    },
    createdAt: now,
    updatedAt: now,
  });
  return { room, joinCode, rule: "Store the room in the educator-owned workspace. Give learners the code only after explicit publication." };
}

export function updateStudentRoom(roomInput: unknown, patch: Record<string, unknown>) {
  const room = studentRoomSchema.parse(roomInput);
  if (room.status !== "draft") throw new Error("Published or closed rooms are immutable; create a new version.");
  const updated = studentRoomSchema.parse({ ...room, ...patch, id: room.id, version: room.version + 1, status: "draft", access: patch.access ?? room.access, policy: patch.policy ?? room.policy, audience: patch.audience ?? room.audience, createdAt: room.createdAt, updatedAt: new Date().toISOString() });
  return { room: updated, supersedesVersion: room.version };
}

export function setStudentRoomStatus(roomInput: unknown, status: "published" | "closed") {
  const room = studentRoomSchema.parse(roomInput);
  if (status === "published" && room.status !== "draft") throw new Error("Only a draft room can be published.");
  if (status === "closed" && room.status !== "published") throw new Error("Only a published room can be closed.");
  const now = new Date().toISOString();
  return { room: studentRoomSchema.parse({ ...room, status, updatedAt: now, publishedAt: status === "published" ? now : room.publishedAt, closedAt: status === "closed" ? now : undefined }) };
}

export function joinStudentRoom(input: { room: unknown; code?: string; rosterAuthorized?: boolean; participantId?: string }) {
  const room = studentRoomSchema.parse(input.room);
  if (room.status !== "published") throw new Error(`Room '${room.id}' is ${room.status}.`);
  if (room.access.mode === "code" && (!input.code || !room.access.joinCodeSalt || !room.access.joinCodeDigest || !codeMatches(input.code, room.access.joinCodeSalt, room.access.joinCodeDigest))) throw new Error("The room code is invalid.");
  if (room.access.mode === "roster" && !input.rosterAuthorized) throw new Error("An authenticated roster launch is required.");
  const now = new Date().toISOString();
  const membership = roomMembershipSchema.parse({ schemaVersion: "0.1", id: `urn:uuid:${crypto.randomUUID()}`, roomId: room.id, roomVersion: room.version, participantId: input.participantId ?? `urn:uuid:${crypto.randomUUID()}`, status: "active", joinedAt: now, updatedAt: now });
  return {
    membership,
    visibleToTeacher: room.policy.teacherVisibility,
    transparency: `Your teacher can receive ${room.policy.teacherVisibility.replace(/-/g, " ")} from this room. Raw conversations are not retained or shared by default.`,
    persistence: { owner: "learner", verified: false, nextTool: "asfai_storage" },
  };
}
