import { supabase } from "./supabase";

export type Profile={id:string;name:string;heightCm:number|null};
export type Entry={date:string;weight:number};
export type Milestone={date:string;target:number;actual?:number;future?:boolean};
export type Plan={startDate:string;startWeight:number;targetDate:string;targetWeight:number};

const fail=(message:string)=>new Error(message);
export const normalizeProfileName=(name:string)=>name.trim().toLocaleLowerCase("en-GB");
const profileFields="id,name,height_cm";
const mapProfile=(row:{id:string;name:string;height_cm:number|null})=>({id:row.id,name:row.name,heightCm:row.height_cm==null?null:Number(row.height_cm)});

export async function loadProfiles(){const {data,error}=await supabase.from("weight_profiles").select(profileFields).order("created_at");if(error)throw fail("用户列表读取失败，请重试。");return (data??[]).map(mapProfile)}
export async function createProfile(name:string){const clean=name.trim();if(!clean)throw fail("用户名不能为空。");const {data,error}=await supabase.from("weight_profiles").insert({name:clean,normalized_name:normalizeProfileName(clean)}).select(profileFields).single();if(error?.code==="23505")throw fail("该用户名已存在，请使用其他名称。");if(error)throw fail("用户创建失败，请重试。");return mapProfile(data)}
export async function renameProfile(profileId:string,name:string){const clean=name.trim();if(!clean)throw fail("用户名不能为空。");const {data,error}=await supabase.from("weight_profiles").update({name:clean,normalized_name:normalizeProfileName(clean)}).eq("id",profileId).select(profileFields).single();if(error?.code==="23505")throw fail("该用户名已存在，请使用其他名称。");if(error)throw fail("重命名失败，请重试。");return mapProfile(data)}
export async function updateProfileHeight(profileId:string,heightCm:number){if(!Number.isFinite(heightCm)||heightCm<100||heightCm>250)throw fail("请输入 100–250 cm 之间的身高。");const {data,error}=await supabase.from("weight_profiles").update({height_cm:heightCm}).eq("id",profileId).select(profileFields).single();if(error)throw fail("身高保存失败，请重试。");return mapProfile(data)}
export async function deleteProfile(profileId:string){const {error}=await supabase.from("weight_profiles").delete().eq("id",profileId);if(error)throw fail("删除失败，请重试。");}
export async function loadProfileData(profileId:string){const [{data:entryRows,error:entryError},{data:nodeRows,error:nodeError},{data:planRow,error:planError}]=await Promise.all([supabase.from("weight_entries").select("entry_date,weight").eq("profile_id",profileId).order("entry_date"),supabase.from("weight_milestones").select("milestone_date,target_weight,status,actual_weight").eq("profile_id",profileId).order("milestone_date"),supabase.from("weight_plan").select("start_date,start_weight,target_date,target_weight").eq("profile_id",profileId).maybeSingle()]);if(entryError||nodeError||planError)throw fail("共享数据暂时无法读取，请重试。");return {entries:(entryRows??[]).map(r=>({date:r.entry_date,weight:Number(r.weight)})),milestones:(nodeRows??[]).map(r=>({date:r.milestone_date,target:Number(r.target_weight),actual:r.actual_weight==null?undefined:Number(r.actual_weight),future:r.status==="future"})),plan:planRow?{startDate:planRow.start_date,startWeight:Number(planRow.start_weight),targetDate:planRow.target_date,targetWeight:Number(planRow.target_weight)}:null}}
