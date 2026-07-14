import { requireApiSession } from "@/lib/auth/api";
import { guestServeUrl } from "@/lib/guest";
import { NextResponse } from "next/server";
import QRCode from "qrcode";

export async function GET(request: Request) {
  const { error } = await requireApiSession();
  if (error) return error;

  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }

  const serveUrl = guestServeUrl(token);
  const dataUrl = await QRCode.toDataURL(serveUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 512,
    color: { dark: "#0a0908", light: "#ffffff" },
  });

  return NextResponse.json({ url: serveUrl, qrDataUrl: dataUrl });
}
