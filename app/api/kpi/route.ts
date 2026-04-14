import { NextResponse } from "next/server";
import { pushPayload, updateBaseline, getPayloads } from "@/lib/store";

// The VIP Guest List (CORS Headers)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// The "Pre-flight" check for CORS
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// ⬇️ THE MISSING READ FUNCTION (For the Dashboard) ⬇️
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : 500;

    const payloads = await getPayloads(limit);
    return NextResponse.json(payloads, { headers: corsHeaders });
  } catch (error) {
    return NextResponse.json(
      { error: "Error fetching data" }, 
      { status: 500, headers: corsHeaders }
    );
  }
}

// ⬇️ THE WRITE FUNCTION (For the Extension) ⬇️
export async function POST(req: Request) {
  try {
    const data = await req.json();
    await pushPayload(data);
    await updateBaseline(data);
    return NextResponse.json({ success: true }, { headers: corsHeaders });
  } catch (error) {
    return NextResponse.json(
      { error: "Error saving data" }, 
      { status: 500, headers: corsHeaders }
    );
  }
}