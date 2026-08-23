import { buildSkillBundle } from "@/lib/skill-bundle";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ skill: string }> }) {
  const { skill } = await params;
  const name = skill.replace(/\.(skill|zip)$/, "");
  const zip = buildSkillBundle(name);
  if (!zip) {
    return new Response(`Unknown skill '${name}'.`, {
      status: 404,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }
  return new Response(zip.slice(), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${name}.skill"`,
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
