import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { fileURLToPath } from "node:url";
import { DeviceProtectedStorage } from "@/lib/device-protected-storage";
import type {
  ClassroomAssignmentExport,
  ClassroomConnectInput,
  ClassroomConnectorAdapter,
  ClassroomEvaluationExport,
  ClassroomImportInput,
  ClassroomMaterial,
  ClassroomPageInput,
  ClassroomWorkExport,
} from "@/lib/classroom-connectors/contract";

const CLASSROOM_API = "https://classroom.googleapis.com/v1";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO = "https://www.googleapis.com/oauth2/v3/userinfo";

interface GoogleTokenResponse {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
}

interface GoogleCourse {
  id: string;
  name: string;
  section?: string;
  descriptionHeading?: string;
  room?: string;
  courseState?: string;
  alternateLink?: string;
}

interface GoogleCourseWork {
  id: string;
  courseId?: string;
  title: string;
  description?: string;
  state?: string;
  alternateLink?: string;
  creationTime?: string;
  updateTime?: string;
  dueDate?: { year?: number; month?: number; day?: number };
  maxPoints?: number;
  workType?: string;
  associatedWithDeveloper?: boolean;
  materials?: GoogleAttachment[];
}

interface GoogleStudent {
  userId: string;
  profile?: { id?: string; name?: { fullName?: string; givenName?: string; familyName?: string } };
}

interface GoogleAttachment {
  driveFile?: { id?: string; title?: string; alternateLink?: string; thumbnailUrl?: string };
  link?: { url?: string; title?: string; thumbnailUrl?: string };
  youtubeVideo?: { id?: string; title?: string; alternateLink?: string; thumbnailUrl?: string };
  form?: { formUrl?: string; title?: string; responseUrl?: string; thumbnailUrl?: string };
}

interface GoogleSubmission {
  id: string;
  courseId?: string;
  courseWorkId?: string;
  userId?: string;
  state?: string;
  late?: boolean;
  assignedGrade?: number;
  draftGrade?: number;
  alternateLink?: string;
  creationTime?: string;
  updateTime?: string;
  assignmentSubmission?: { attachments?: GoogleAttachment[] };
  shortAnswerSubmission?: { answer?: string };
  multipleChoiceSubmission?: { answer?: string };
}

interface GoogleAdapterOptions {
  clientId?: string;
  clientSecret?: string;
  credentialsFile?: string;
  authorizationStorage?: DeviceProtectedStorage;
  fetchImpl?: typeof fetch;
  initialAccessToken?: string;
  initialRefreshToken?: string;
}

type GoogleConfigurationSource = "options" | "environment" | "credentials-file" | "none";

type SavedGoogleAuthorization = {
  schemaVersion: "1";
  refreshToken: string;
  accountEmail?: string;
  grantedScopes: string[];
  role: ClassroomConnectInput["role"];
  readOnly: boolean;
  includeDriveContent: boolean;
  savedAt: string;
};

export const GOOGLE_AUTHORIZATION_KEY = "google-classroom-authorization-v1";

function readGoogleOAuthClient(filePath?: string) {
  if (!filePath) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as {
      installed?: { client_id?: string; client_secret?: string };
    };
    const clientId = parsed.installed?.client_id;
    if (!clientId) return undefined;
    return { clientId, clientSecret: parsed.installed?.client_secret };
  } catch {
    return undefined;
  }
}

function resolveGoogleOAuthClient(options: GoogleAdapterOptions) {
  if (options.clientId !== undefined || options.clientSecret !== undefined) {
    return { clientId: options.clientId, clientSecret: options.clientSecret, source: "options" as const };
  }
  if (process.env.ASFAI_GOOGLE_CLASSROOM_CLIENT_ID) {
    return {
      clientId: process.env.ASFAI_GOOGLE_CLASSROOM_CLIENT_ID,
      clientSecret: process.env.ASFAI_GOOGLE_CLASSROOM_CLIENT_SECRET,
      source: "environment" as const,
    };
  }
  const candidates = [
    options.credentialsFile,
    process.env.ASFAI_GOOGLE_CLASSROOM_CREDENTIALS_FILE,
    fileURLToPath(new URL("./google-oauth-client.json", import.meta.url)),
    fileURLToPath(new URL("./google-oauth-public-client.json", import.meta.url)),
  ];
  for (const candidate of candidates) {
    const credentials = readGoogleOAuthClient(candidate);
    if (credentials) return { ...credentials, source: "credentials-file" as const };
  }
  return { clientId: undefined, clientSecret: undefined, source: "none" as const };
}

function parseSavedGoogleAuthorization(value: string): SavedGoogleAuthorization {
  const parsed = JSON.parse(value) as Partial<SavedGoogleAuthorization>;
  if (
    parsed.schemaVersion !== "1"
    || typeof parsed.refreshToken !== "string"
    || !parsed.refreshToken
    || !Array.isArray(parsed.grantedScopes)
    || parsed.grantedScopes.some((scope) => typeof scope !== "string")
    || (parsed.role !== "learner" && parsed.role !== "teacher")
    || typeof parsed.readOnly !== "boolean"
    || typeof parsed.includeDriveContent !== "boolean"
    || typeof parsed.savedAt !== "string"
  ) {
    throw new Error("invalid saved Google authorization");
  }
  return parsed as SavedGoogleAuthorization;
}

function base64Url(value: Buffer) {
  return value.toString("base64url");
}

function scopesFor(input: ClassroomConnectInput) {
  const scopes = new Set(["openid", "email", "https://www.googleapis.com/auth/classroom.courses.readonly"]);
  if (input.role === "teacher") {
    scopes.add(`https://www.googleapis.com/auth/classroom.coursework.students${input.readOnly ? ".readonly" : ""}`);
    scopes.add("https://www.googleapis.com/auth/classroom.student-submissions.students.readonly");
    scopes.add("https://www.googleapis.com/auth/classroom.rosters.readonly");
  } else {
    scopes.add(`https://www.googleapis.com/auth/classroom.coursework.me${input.readOnly ? ".readonly" : ""}`);
    scopes.add("https://www.googleapis.com/auth/classroom.student-submissions.me.readonly");
  }
  if (!input.readOnly) scopes.add("https://www.googleapis.com/auth/drive.file");
  if (input.includeDriveContent) scopes.add("https://www.googleapis.com/auth/drive.readonly");
  return [...scopes];
}

export function googleClassroomScopes(input: ClassroomConnectInput) {
  return scopesFor(input);
}

function normalizeCourse(course: GoogleCourse) {
  return {
    id: course.id,
    name: course.name,
    section: course.section,
    descriptionHeading: course.descriptionHeading,
    room: course.room,
    state: course.courseState,
    url: course.alternateLink,
  };
}

function normalizeAssignment(assignment: GoogleCourseWork) {
  const dueDate = assignment.dueDate?.year && assignment.dueDate.month && assignment.dueDate.day
    ? `${assignment.dueDate.year}-${String(assignment.dueDate.month).padStart(2, "0")}-${String(assignment.dueDate.day).padStart(2, "0")}`
    : undefined;
  return {
    id: assignment.id,
    courseId: assignment.courseId,
    title: assignment.title,
    description: assignment.description,
    state: assignment.state,
    workType: assignment.workType,
    maxPoints: assignment.maxPoints,
    dueDate,
    createdAt: assignment.creationTime,
    updatedAt: assignment.updateTime,
    url: assignment.alternateLink,
    associatedWithProviderApp: assignment.associatedWithDeveloper ?? false,
    materials: (assignment.materials ?? []).map(normalizeAttachment),
  };
}

function normalizeAttachment(attachment: GoogleAttachment) {
  if (attachment.driveFile) return { type: "drive_file", id: attachment.driveFile.id, title: attachment.driveFile.title, url: attachment.driveFile.alternateLink, thumbnailUrl: attachment.driveFile.thumbnailUrl };
  if (attachment.link) return { type: "link", title: attachment.link.title, url: attachment.link.url, thumbnailUrl: attachment.link.thumbnailUrl };
  if (attachment.youtubeVideo) return { type: "youtube_video", id: attachment.youtubeVideo.id, title: attachment.youtubeVideo.title, url: attachment.youtubeVideo.alternateLink, thumbnailUrl: attachment.youtubeVideo.thumbnailUrl };
  if (attachment.form) return { type: "form", title: attachment.form.title, url: attachment.form.responseUrl ?? attachment.form.formUrl, thumbnailUrl: attachment.form.thumbnailUrl };
  return { type: "unknown" };
}

export function normalizeGoogleSubmission(submission: GoogleSubmission) {
  return {
    id: submission.id,
    courseId: submission.courseId,
    assignmentId: submission.courseWorkId,
    userId: submission.userId,
    state: submission.state,
    late: submission.late ?? false,
    assignedGrade: submission.assignedGrade,
    draftGrade: submission.draftGrade,
    shortAnswer: submission.shortAnswerSubmission?.answer,
    multipleChoiceAnswer: submission.multipleChoiceSubmission?.answer,
    attachments: (submission.assignmentSubmission?.attachments ?? []).map(normalizeAttachment),
    createdAt: submission.creationTime,
    updatedAt: submission.updateTime,
    url: submission.alternateLink,
  };
}

function materialForGoogle(material: ClassroomMaterial) {
  if (material.type === "link") return { link: { url: material.url, title: material.title } };
  if (material.type === "drive_file") return { driveFile: { id: material.id, title: material.title } };
  return { youtubeVideo: { id: material.id, title: material.title } };
}

function dueDateForGoogle(value?: string) {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
}

function cleanErrorBody(value: string) {
  try {
    const parsed = JSON.parse(value) as { error?: { code?: number; message?: string; status?: string } };
    return parsed.error ? `${parsed.error.status ?? parsed.error.code ?? "Google API error"}: ${parsed.error.message ?? "Request failed"}` : value;
  } catch {
    return value.slice(0, 1000);
  }
}

export class GoogleClassroomAdapter implements ClassroomConnectorAdapter {
  readonly provider = "google";
  private readonly clientId?: string;
  private readonly clientSecret?: string;
  private readonly configurationSource: GoogleConfigurationSource;
  private readonly authorizationStorage?: DeviceProtectedStorage;
  private readonly fetchImpl: typeof fetch;
  private accessToken?: string;
  private refreshToken?: string;
  private expiresAt?: number;
  private grantedScopes: string[] = [];
  private role?: ClassroomConnectInput["role"];
  private readOnly?: boolean;
  private includeDriveContent = false;
  private accountEmail?: string;
  private callbackServer?: Server;
  private authorizationUrl?: string;
  private authError?: string;
  private authorizationRestored = false;
  private restoreAttempted = false;
  private restorePromise?: Promise<void>;

  constructor(options: GoogleAdapterOptions = {}) {
    const configuration = resolveGoogleOAuthClient(options);
    this.clientId = configuration.clientId;
    this.clientSecret = configuration.clientSecret;
    this.configurationSource = configuration.source;
    this.authorizationStorage = options.authorizationStorage;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.accessToken = options.initialAccessToken;
    this.refreshToken = options.initialRefreshToken;
    this.expiresAt = options.initialAccessToken ? Date.now() + 3_600_000 : undefined;
  }

  private statusSnapshot() {
    return {
      provider: this.provider,
      configured: Boolean(this.clientId),
      configurationSource: this.configurationSource,
      requiredConfiguration: this.clientId ? [] : ["Google Desktop OAuth client configuration"],
      authorizationPending: Boolean(this.authorizationUrl),
      isLoggedIn: Boolean((this.accessToken || this.refreshToken) && !this.authError),
      accountEmail: this.accountEmail,
      role: this.role,
      readOnly: this.readOnly,
      includeDriveContent: this.includeDriveContent,
      grantedScopes: this.grantedScopes,
      error: this.authError,
      capabilities: ["courses", "learners", "assignments", "submission-import", "assignment-export", "work-attachment-export", "grade-passback"],
      limitations: [
        "Google permits attachment access and submission modification only for coursework associated with the same Developer Console project.",
        "Detailed ASFAI feedback is saved owner-side; the Classroom API supports grade/state passback but not private feedback comments.",
      ],
      authorizationPersistence: {
        persistsAcrossChatsAndRestarts: Boolean(this.authorizationStorage),
        restoredFromDevice: this.authorizationRestored,
        protectedBy: this.authorizationStorage?.protection,
        removal: "Authorization remains available until the user explicitly asks ASFAI to forget Google Classroom on this device or revokes ASFAI in their Google Account.",
      },
      credentialBoundary: "Google passwords, authorization codes, access tokens, refresh tokens, and client secrets are never accepted as MCP input or returned as output. Reusable Google authorization is protected for the current device user.",
    };
  }

  async status() {
    await this.restoreSavedAuthorization();
    return this.statusSnapshot();
  }

  private tokenClientParameters() {
    if (!this.clientId) throw new Error("Google Classroom is not configured.");
    const parameters: Record<string, string> = { client_id: this.clientId };
    if (this.clientSecret) parameters.client_secret = this.clientSecret;
    return parameters;
  }

  private async persistAuthorization() {
    if (!this.authorizationStorage || !this.refreshToken || !this.role || this.readOnly === undefined) return;
    const authorization: SavedGoogleAuthorization = {
      schemaVersion: "1",
      refreshToken: this.refreshToken,
      accountEmail: this.accountEmail,
      grantedScopes: this.grantedScopes,
      role: this.role,
      readOnly: this.readOnly,
      includeDriveContent: this.includeDriveContent,
      savedAt: new Date().toISOString(),
    };
    await this.authorizationStorage.withSessionLease(() => this.authorizationStorage!.set(GOOGLE_AUTHORIZATION_KEY, JSON.stringify(authorization)));
  }

  private async refreshAccessToken() {
    if (!this.refreshToken) throw new Error("Google Classroom is not authenticated.");
    const response = await this.fetchImpl(GOOGLE_TOKEN, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ...this.tokenClientParameters(), refresh_token: this.refreshToken, grant_type: "refresh_token" }),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(cleanErrorBody(text));
    const token = JSON.parse(text) as GoogleTokenResponse;
    this.accessToken = token.access_token;
    this.expiresAt = Date.now() + (token.expires_in ?? 3600) * 1000;
    if (token.refresh_token) this.refreshToken = token.refresh_token;
    if (token.scope) this.grantedScopes = token.scope.split(/\s+/).filter(Boolean);
  }

  private async restoreSavedAuthorization() {
    if (this.accessToken || this.refreshToken || this.restoreAttempted || !this.authorizationStorage || !this.clientId) return;
    if (this.restorePromise) return await this.restorePromise;
    this.restoreAttempted = true;
    this.restorePromise = (async () => {
      try {
        const raw = await this.authorizationStorage!.withSessionLease(() => this.authorizationStorage!.get(GOOGLE_AUTHORIZATION_KEY));
        if (!raw) return;
        const saved = parseSavedGoogleAuthorization(raw);
        this.refreshToken = saved.refreshToken;
        this.accountEmail = saved.accountEmail;
        this.grantedScopes = saved.grantedScopes;
        this.role = saved.role;
        this.readOnly = saved.readOnly;
        this.includeDriveContent = saved.includeDriveContent;
        await this.refreshAccessToken();
        this.authorizationRestored = true;
        this.authError = undefined;
        await this.persistAuthorization();
      } catch {
        this.accessToken = undefined;
        this.refreshToken = undefined;
        this.expiresAt = undefined;
        this.authError = "The saved Google Classroom authorization could not be refreshed. Connect again to replace it, or revoke ASFAI in the Google Account if access should end.";
      }
    })();
    await this.restorePromise;
  }

  private async closeCallbackServer() {
    if (!this.callbackServer) return;
    const server = this.callbackServer;
    this.callbackServer = undefined;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  async connect(input: ClassroomConnectInput) {
    if (!this.clientId) {
      throw new Error("Google Classroom is not configured. An administrator must package or install a Google Desktop OAuth client with the Classroom API enabled.");
    }
    await this.restoreSavedAuthorization();
    const scopes = scopesFor(input);
    const savedGrantIsSufficient = Boolean(this.accessToken || this.refreshToken)
      && !this.authError
      && scopes.every((scope) => this.grantedScopes.includes(scope));
    if (savedGrantIsSufficient) {
      this.role = input.role;
      this.readOnly = input.readOnly;
      this.includeDriveContent = input.includeDriveContent;
      await this.persistAuthorization();
      return {
        ...this.statusSnapshot(),
        authorizationUrl: undefined,
        requestedScopes: scopes,
        instruction: "The saved Google Classroom authorization was restored for this device user. Continue without opening a web page.",
      };
    }
    await this.closeCallbackServer();
    this.authorizationUrl = undefined;
    this.authError = undefined;
    this.role = input.role;
    this.readOnly = input.readOnly;
    this.includeDriveContent = input.includeDriveContent;
    const port = input.port ?? Number(process.env.ASFAI_CLASSROOM_OAUTH_PORT ?? 18766);
    const callbackUrl = `http://127.0.0.1:${port}/classroom/callback`;
    const state = base64Url(randomBytes(32));
    const verifier = base64Url(randomBytes(48));
    const challenge = base64Url(createHash("sha256").update(verifier).digest());

    this.callbackServer = createServer(async (request, response) => {
      const incoming = new URL(request.url ?? "/", callbackUrl);
      if (incoming.pathname !== "/classroom/callback") {
        response.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("Not found");
        return;
      }
      try {
        if (incoming.searchParams.get("state") !== state) throw new Error("Google OAuth state validation failed.");
        const providerError = incoming.searchParams.get("error");
        if (providerError) throw new Error(`Google authorization ended with ${providerError}.`);
        const code = incoming.searchParams.get("code");
        if (!code) throw new Error("Google did not return an authorization code.");
        const tokenResponse = await this.fetchImpl(GOOGLE_TOKEN, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            ...this.tokenClientParameters(),
            code,
            code_verifier: verifier,
            grant_type: "authorization_code",
            redirect_uri: callbackUrl,
          }),
        });
        const tokenText = await tokenResponse.text();
        if (!tokenResponse.ok) throw new Error(cleanErrorBody(tokenText));
        const token = JSON.parse(tokenText) as GoogleTokenResponse;
        this.accessToken = token.access_token;
        this.refreshToken = token.refresh_token ?? this.refreshToken;
        if (!this.refreshToken) throw new Error("Google did not issue reusable authorization. Remove ASFAI from the Google Account and connect again.");
        this.expiresAt = Date.now() + (token.expires_in ?? 3600) * 1000;
        this.grantedScopes = token.scope?.split(/\s+/).filter(Boolean) ?? scopes;
        this.authorizationUrl = undefined;
        const userResponse = await this.fetchImpl(GOOGLE_USERINFO, { headers: { authorization: `Bearer ${this.accessToken}` } });
        if (userResponse.ok) this.accountEmail = ((await userResponse.json()) as { email?: string }).email;
        this.authorizationRestored = false;
        await this.persistAuthorization();
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end("<!doctype html><title>ASFAI Classroom connected</title><h1>Classroom connected</h1><p>You can close this window and continue in chat.</p>");
      } catch (error) {
        this.authError = error instanceof Error ? error.message : String(error);
        this.authorizationUrl = undefined;
        response.writeHead(400, { "content-type": "text/html; charset=utf-8" }).end("<!doctype html><title>ASFAI Classroom connection failed</title><h1>Classroom connection failed</h1><p>Return to chat for details.</p>");
      } finally {
        setTimeout(() => void this.closeCallbackServer(), 250);
      }
    });
    await new Promise<void>((resolve, reject) => {
      this.callbackServer!.once("error", reject);
      this.callbackServer!.listen(port, "127.0.0.1", resolve);
    });

    const authorization = new URL(GOOGLE_AUTH);
    authorization.search = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: callbackUrl,
      response_type: "code",
      scope: scopes.join(" "),
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
    }).toString();
    this.authorizationUrl = authorization.toString();
    return {
      ...this.statusSnapshot(),
      callbackUrl,
      authorizationUrl: this.authorizationUrl,
      requestedScopes: scopes,
      instruction: "Open the authorization URL and approve access on Google's page once. Never paste Google credentials, authorization codes, or tokens into chat. The protected authorization is then reused across chats and restarts until the user explicitly forgets it or revokes ASFAI in their Google Account.",
    };
  }

  async disconnect() {
    await this.closeCallbackServer();
    this.authorizationUrl = undefined;
    return {
      ...await this.status(),
      instruction: "The reusable Google Classroom authorization remains protected on this device. Use forget_authorization only when the user explicitly asks to remove it.",
    };
  }

  async forgetAuthorization() {
    await this.closeCallbackServer();
    this.accessToken = undefined;
    this.refreshToken = undefined;
    this.expiresAt = undefined;
    this.authorizationUrl = undefined;
    this.accountEmail = undefined;
    this.grantedScopes = [];
    this.role = undefined;
    this.readOnly = undefined;
    this.includeDriveContent = false;
    this.authorizationRestored = false;
    this.restoreAttempted = true;
    this.restorePromise = undefined;
    this.authError = undefined;
    if (this.authorizationStorage) {
      await this.authorizationStorage.withSessionLease(() => this.authorizationStorage!.delete(GOOGLE_AUTHORIZATION_KEY));
    }
    return {
      ...this.statusSnapshot(),
      instruction: "Google Classroom authorization was removed from this device. The user may also revoke ASFAI in their Google Account.",
    };
  }

  private async token() {
    await this.restoreSavedAuthorization();
    if (this.accessToken && (!this.expiresAt || this.expiresAt > Date.now() + 60_000)) return this.accessToken;
    if (!this.refreshToken || !this.clientId) throw new Error("Google Classroom is not authenticated. Call connect and complete browser authorization first.");
    try {
      await this.refreshAccessToken();
      this.authError = undefined;
      await this.persistAuthorization();
      return this.accessToken!;
    } catch (error) {
      this.authError = "Google Classroom authorization could not be refreshed. Connect again if the user still wants access.";
      throw error;
    }
  }

  private async requestJson<T>(url: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${await this.token()}`);
    if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
    const response = await this.fetchImpl(url, { ...init, headers });
    const text = await response.text();
    if (!response.ok) throw new Error(cleanErrorBody(text));
    return (text ? JSON.parse(text) : {}) as T;
  }

  async listCourses(input: ClassroomPageInput) {
    const url = new URL(`${CLASSROOM_API}/courses`);
    url.searchParams.set("courseStates", "ACTIVE");
    url.searchParams.set("pageSize", String(input.pageSize ?? 50));
    if (input.pageToken) url.searchParams.set("pageToken", input.pageToken);
    const result = await this.requestJson<{ courses?: GoogleCourse[]; nextPageToken?: string }>(url.toString());
    return { provider: this.provider, courses: (result.courses ?? []).map(normalizeCourse), nextPageToken: result.nextPageToken };
  }

  async listLearners(input: ClassroomPageInput & { courseId: string }) {
    if (this.role !== "teacher") throw new Error("Reconnect to Google Classroom with role:'teacher' to list the course roster.");
    const url = new URL(`${CLASSROOM_API}/courses/${encodeURIComponent(input.courseId)}/students`);
    url.searchParams.set("pageSize", String(input.pageSize ?? 50));
    if (input.pageToken) url.searchParams.set("pageToken", input.pageToken);
    const result = await this.requestJson<{ students?: GoogleStudent[]; nextPageToken?: string }>(url.toString());
    return {
      provider: this.provider,
      courseId: input.courseId,
      learners: (result.students ?? []).map((student) => ({
        id: student.userId,
        displayName: student.profile?.name?.fullName,
        givenName: student.profile?.name?.givenName,
        familyName: student.profile?.name?.familyName,
      })),
      nextPageToken: result.nextPageToken,
    };
  }

  async listAssignments(input: ClassroomPageInput & { courseId: string }) {
    const url = new URL(`${CLASSROOM_API}/courses/${encodeURIComponent(input.courseId)}/courseWork`);
    url.searchParams.set("pageSize", String(input.pageSize ?? 50));
    url.searchParams.set("orderBy", "updateTime desc");
    if (input.pageToken) url.searchParams.set("pageToken", input.pageToken);
    const result = await this.requestJson<{ courseWork?: GoogleCourseWork[]; nextPageToken?: string }>(url.toString());
    return { provider: this.provider, courseId: input.courseId, assignments: (result.courseWork ?? []).map(normalizeAssignment), nextPageToken: result.nextPageToken };
  }

  private assignmentUrl(courseId: string, assignmentId: string) {
    return `${CLASSROOM_API}/courses/${encodeURIComponent(courseId)}/courseWork/${encodeURIComponent(assignmentId)}`;
  }

  private async driveText(fileId: string, maxBytes: number) {
    if (!this.includeDriveContent) return { warning: "Reconnect with includeDriveContent:true to import Drive attachment text." };
    const metadata = await this.requestJson<{ name?: string; mimeType?: string; size?: string; webViewLink?: string; capabilities?: { canDownload?: boolean } }>(
      `${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,webViewLink,capabilities(canDownload)`,
    );
    if (metadata.capabilities?.canDownload === false) return { name: metadata.name, mimeType: metadata.mimeType, url: metadata.webViewLink, warning: "The owner disabled downloading this attachment." };
    let downloadUrl: string | undefined;
    if (metadata.mimeType === "application/vnd.google-apps.document") downloadUrl = `${DRIVE_API}/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent("text/plain")}`;
    else if (metadata.mimeType === "application/vnd.google-apps.spreadsheet") downloadUrl = `${DRIVE_API}/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent("text/csv")}`;
    else if (metadata.mimeType?.startsWith("text/") || metadata.mimeType === "application/json") downloadUrl = `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`;
    if (!downloadUrl) return { name: metadata.name, mimeType: metadata.mimeType, url: metadata.webViewLink, warning: "This attachment type is preserved by reference; automatic text extraction is not supported." };
    const headers = new Headers({ authorization: `Bearer ${await this.token()}` });
    const response = await this.fetchImpl(downloadUrl, { headers });
    if (!response.ok) throw new Error(cleanErrorBody(await response.text()));
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) return { name: metadata.name, mimeType: metadata.mimeType, url: metadata.webViewLink, warning: `Attachment exceeds the ${maxBytes}-byte import limit.` };
    return { name: metadata.name, mimeType: metadata.mimeType, url: metadata.webViewLink, text: new TextDecoder().decode(bytes), digest: createHash("sha256").update(bytes).digest("hex") };
  }

  async importWork(input: ClassroomImportInput) {
    const assignment = await this.requestJson<GoogleCourseWork>(this.assignmentUrl(input.courseId, input.assignmentId));
    const warnings: string[] = [];
    if (!assignment.associatedWithDeveloper) warnings.push("Google may omit attachments or reject later modifications because this coursework was not created by the configured developer project.");
    let submissions: GoogleSubmission[];
    let nextPageToken: string | undefined;
    if (input.submissionId) {
      submissions = [await this.requestJson<GoogleSubmission>(`${this.assignmentUrl(input.courseId, input.assignmentId)}/studentSubmissions/${encodeURIComponent(input.submissionId)}`)];
    } else {
      const url = new URL(`${this.assignmentUrl(input.courseId, input.assignmentId)}/studentSubmissions`);
      url.searchParams.set("pageSize", String(input.pageSize ?? 50));
      if (input.pageToken) url.searchParams.set("pageToken", input.pageToken);
      if (input.userId) url.searchParams.append("userIds", input.userId);
      const result = await this.requestJson<{ studentSubmissions?: GoogleSubmission[]; nextPageToken?: string }>(url.toString());
      submissions = result.studentSubmissions ?? [];
      nextPageToken = result.nextPageToken;
    }
    const assignmentMaterialContent: Record<string, unknown> = {};
    if (input.includeAttachmentContent) {
      for (const material of assignment.materials ?? []) {
        const normalizedMaterial = normalizeAttachment(material);
        if (normalizedMaterial.type === "drive_file" && normalizedMaterial.id) {
          try { assignmentMaterialContent[normalizedMaterial.id] = await this.driveText(normalizedMaterial.id, input.maxContentBytes); }
          catch (error) { assignmentMaterialContent[normalizedMaterial.id] = { warning: error instanceof Error ? error.message : String(error) }; }
        }
      }
    }
    const normalized = [];
    for (const submission of submissions) {
      const item = normalizeGoogleSubmission(submission);
      const attachmentContent: Record<string, unknown> = {};
      if (input.includeAttachmentContent) {
        for (const attachment of item.attachments) {
          if (attachment.type === "drive_file" && attachment.id) {
            try { attachmentContent[attachment.id] = await this.driveText(attachment.id, input.maxContentBytes); }
            catch (error) { attachmentContent[attachment.id] = { warning: error instanceof Error ? error.message : String(error) }; }
          }
        }
      }
      normalized.push({ ...item, attachmentContent });
    }
    return {
      schemaVersion: "0.1",
      provider: this.provider,
      courseId: input.courseId,
      assignment: normalizeAssignment(assignment),
      assignmentMaterialContent,
      objectiveIds: input.objectiveIds,
      submissions: normalized,
      nextPageToken,
      importedAt: new Date().toISOString(),
      warnings,
      serverRetainedStudentData: false,
      next: "Evaluate only the selected learner's demonstrated work against the supplied objectives, create concise evidence, and save it owner-side before any optional grade passback.",
    };
  }

  async createAssignment(input: { courseId: string; assignment: ClassroomAssignmentExport; objectiveIds: string[]; confirmed: boolean }) {
    const body = {
      title: input.assignment.title,
      description: input.assignment.description,
      state: input.assignment.state,
      workType: "ASSIGNMENT",
      maxPoints: input.assignment.maxPoints,
      dueDate: dueDateForGoogle(input.assignment.dueDate),
      materials: input.assignment.materials.map(materialForGoogle),
      submissionModificationMode: "MODIFIABLE_UNTIL_TURNED_IN",
    };
    if (!input.confirmed) return { provider: this.provider, preview: body, objectiveIds: input.objectiveIds, requiresConfirmation: true, externalMutationPerformed: false };
    this.requireWritable("create an assignment");
    if (this.role !== "teacher") throw new Error("Reconnect to Google Classroom with role:'teacher' to create an assignment.");
    const created = await this.requestJson<GoogleCourseWork>(`${CLASSROOM_API}/courses/${encodeURIComponent(input.courseId)}/courseWork`, { method: "POST", body: JSON.stringify(body) });
    return { provider: this.provider, assignment: normalizeAssignment(created), objectiveIds: input.objectiveIds, externalMutationPerformed: true };
  }

  private async createDriveTextFile(work: ClassroomWorkExport) {
    const boundary = `asfai-${base64Url(randomBytes(18))}`;
    const metadata = JSON.stringify({ name: work.fileName ?? "ASFAI learner work.txt", mimeType: work.contentType });
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${work.contentType}; charset=UTF-8\r\n\r\n${work.content}\r\n--${boundary}--`;
    return this.requestJson<{ id: string; name?: string; mimeType?: string; webViewLink?: string }>(`${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name,mimeType,webViewLink`, {
      method: "POST",
      headers: { "content-type": `multipart/related; boundary=${boundary}` },
      body,
    });
  }

  async exportWork(input: { courseId: string; assignmentId: string; submissionId: string; work: ClassroomWorkExport; objectiveIds: string[]; confirmed: boolean }) {
    const preview = { attachmentCount: input.work.links.length + input.work.driveFileIds.length + (input.work.content ? 1 : 0), turnIn: input.work.turnIn, objectiveIds: input.objectiveIds };
    if (!input.confirmed) return { provider: this.provider, preview, requiresConfirmation: true, externalMutationPerformed: false };
    this.requireWritable("export or turn in work");
    const assignment = await this.requestJson<GoogleCourseWork>(this.assignmentUrl(input.courseId, input.assignmentId));
    if (!assignment.associatedWithDeveloper) throw new Error("Google permits submission attachment changes only for coursework created by the same Developer Console project.");
    const attachments: GoogleAttachment[] = [
      ...input.work.links.map((link) => ({ link })),
      ...input.work.driveFileIds.map((id) => ({ driveFile: { id } })),
    ];
    let createdFile: { id: string; name?: string; mimeType?: string; webViewLink?: string } | undefined;
    if (input.work.content) {
      createdFile = await this.createDriveTextFile(input.work);
      attachments.push({ driveFile: { id: createdFile.id, title: createdFile.name, alternateLink: createdFile.webViewLink } });
    }
    const submissionUrl = `${this.assignmentUrl(input.courseId, input.assignmentId)}/studentSubmissions/${encodeURIComponent(input.submissionId)}`;
    let submission = await this.requestJson<GoogleSubmission>(`${submissionUrl}:modifyAttachments`, { method: "POST", body: JSON.stringify({ addAttachments: attachments }) });
    if (input.work.turnIn) submission = await this.requestJson<GoogleSubmission>(`${submissionUrl}:turnIn`, { method: "POST", body: "{}" });
    return { provider: this.provider, submission: normalizeGoogleSubmission(submission), createdFile, objectiveIds: input.objectiveIds, externalMutationPerformed: true };
  }

  async returnEvaluation(input: { courseId: string; assignmentId: string; submissionId: string; evaluation: ClassroomEvaluationExport; objectiveIds: string[]; confirmed: boolean }) {
    const preview = { score: input.evaluation.score, publishGrade: input.evaluation.publishGrade, returnSubmission: input.evaluation.returnSubmission, objectiveIds: input.objectiveIds };
    if (!input.confirmed) return { provider: this.provider, preview, requiresConfirmation: true, externalMutationPerformed: false };
    this.requireWritable("return an evaluation");
    if (this.role !== "teacher") throw new Error("Reconnect to Google Classroom with role:'teacher' to return an evaluation.");
    const assignment = await this.requestJson<GoogleCourseWork>(this.assignmentUrl(input.courseId, input.assignmentId));
    if (!assignment.associatedWithDeveloper) throw new Error("Google permits grade passback only for coursework created by the same Developer Console project.");
    if (assignment.maxPoints !== undefined && input.evaluation.score > assignment.maxPoints) throw new Error(`Score ${input.evaluation.score} exceeds the assignment maximum of ${assignment.maxPoints}.`);
    const submissionUrl = `${this.assignmentUrl(input.courseId, input.assignmentId)}/studentSubmissions/${encodeURIComponent(input.submissionId)}`;
    const grade = input.evaluation.publishGrade
      ? { draftGrade: input.evaluation.score, assignedGrade: input.evaluation.score }
      : { draftGrade: input.evaluation.score };
    const updateMask = input.evaluation.publishGrade ? "draftGrade,assignedGrade" : "draftGrade";
    let submission = await this.requestJson<GoogleSubmission>(`${submissionUrl}?updateMask=${encodeURIComponent(updateMask)}`, { method: "PATCH", body: JSON.stringify(grade) });
    if (input.evaluation.returnSubmission) submission = await this.requestJson<GoogleSubmission>(`${submissionUrl}:return`, { method: "POST", body: "{}" });
    return {
      provider: this.provider,
      submission: normalizeGoogleSubmission(submission),
      objectiveIds: input.objectiveIds,
      externalMutationPerformed: true,
      detailedFeedbackLocation: "Save detailed objective-level evidence and feedback through asfai_personal_storage; Google Classroom receives only grade and submission state through this API.",
    };
  }

  private requireWritable(action: string) {
    if (this.readOnly !== false) throw new Error(`Reconnect to Google Classroom with readOnly:false to ${action}.`);
  }
}
