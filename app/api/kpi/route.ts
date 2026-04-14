import { NextResponse } from "next/server";
import { pushPayload, updateBaseline } from "@/lib/store";

// The VIP Guest List (CORS Headers)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// The "Pre-flight" check the browser makes before sending data
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// The main function that receives the data
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