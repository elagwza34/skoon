import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { waiveAccountability, WasteError } from '@/lib/staff-waste-write'
import { unauthenticatedStaffResponse } from '@/lib/api-auth-response'
export async function POST(r:Request,{params}:{params:Promise<{id:string}>}){const s=await getStaffSession();if(!s)return unauthenticatedStaffResponse();try{const {id}=await params;return NextResponse.json({waiver:await waiveAccountability(s,id,await r.json())})}catch(e){const x=e instanceof WasteError?e:null;return NextResponse.json({error:x?.message??'بيانات غير صالحة'},{status:x?.status??400})}}
