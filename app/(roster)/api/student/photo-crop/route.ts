import { NextResponse } from "next/server";
import { kvGet, kvPut } from "../../../lib/kv";
import { requirePermission } from "../../../lib/auth";
import { parsePhotoCrop, type PhotoCrop } from "../../../lib/storage";
import { studentKey } from "../../../lib/rosterSchema";

// How to display a student's photo (zoom + pan), stored under
// `photoCrop:{sk}:{id}`. It's metadata, never baked into the pixels, so a
// leader can re-crop at any time without losing the original. The grid gets
// every crop from /api/bootstrap; this route reads one student and writes.

export async function GET(request: Request) {
  const perm = await requirePermission("roster", "view");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  const url = new URL(request.url);
  const key = studentKey("photoCrop", url.searchParams.get("sk"), url.searchParams.get("id"));
  if (!key) return NextResponse.json({ error: "sk and id are required" }, { status: 400 });

  return NextResponse.json((await kvGet<PhotoCrop>(key)) || null);
}

export async function PUT(request: Request) {
  const perm = await requirePermission("roster", "edit");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  const body = await request.json();
  const key = studentKey("photoCrop", body.sk, body.id);
  if (!key) return NextResponse.json({ error: "sk and id are required" }, { status: 400 });
  const crop = parsePhotoCrop({ zoom: body.zoom, offX: body.offX, offY: body.offY });
  if (!crop) return NextResponse.json({ error: "zoom, offX, and offY are required" }, { status: 400 });

  await kvPut(key, crop);

  return NextResponse.json({ success: true });
}
