import { NextResponse } from "next/server";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:2300";

export async function POST() {
  const res = NextResponse.redirect(APP_URL);
  res.cookies.delete("irh_access_token");
  res.cookies.delete("irh_refresh_token");
  res.cookies.delete("irh_token_expires_at");
  res.cookies.delete("irh_refresh_expires_at");
  return res;
}
