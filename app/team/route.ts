import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/** `/team?id=2379133`, from the "My team" form: on to that team's sheet, or back to the tools if the id isn't a team number. */
export function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id")?.trim() ?? "";
  const ok = /^[1-9]\d{0,9}$/.test(id);
  return NextResponse.redirect(new URL(ok ? `/team/${id}` : "/tools#prices", request.url));
}
