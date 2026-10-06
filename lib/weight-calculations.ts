export type Entry={date:string;weight:number};
export type Plan={startDate:string;startWeight:number;targetDate:string;targetWeight:number};
export type MilestoneInput={date:string;target:number};
export type MilestoneState="future"|"completed"|"missed"|"unrecorded";
export type TrendRange="7d"|"30d"|"all";

const dayMs=86_400_000;
const utc=(date:string)=>Date.parse(date+"T00:00:00Z");
const days=(start:string,end:string)=>(utc(end)-utc(start))/dayMs;

export const roundWeight=(value:number)=>Math.round(value*10)/10;

export function plannedWeightAt(plan:Plan,date:string){
  if(date<=plan.startDate)return roundWeight(plan.startWeight);
  if(date>=plan.targetDate)return roundWeight(plan.targetWeight);
  const ratio=days(plan.startDate,date)/Math.max(1,days(plan.startDate,plan.targetDate));
  return roundWeight(plan.startWeight+(plan.targetWeight-plan.startWeight)*ratio);
}

export function planDifferenceLabel(actual:number,planned:number){
  const difference=roundWeight(actual-planned);
  if(difference===0)return "当前正好达到计划体重";
  return `当前${difference>0?"高于":"低于"}计划体重 ${Math.abs(difference).toFixed(1)} kg`;
}

export function latestEntryOnOrBefore(entries:Entry[],date:string){
  return entries.filter(entry=>entry.date<=date).sort((a,b)=>b.date.localeCompare(a.date))[0];
}

export function deriveMilestone(node:MilestoneInput,entries:Entry[],today:string){
  if(node.date>today)return {...node,state:"future" as const};
  const reference=latestEntryOnOrBefore(entries,node.date);
  if(!reference)return {...node,state:"unrecorded" as const};
  return {...node,state:reference.weight<=node.target?"completed" as const:"missed" as const,actual:reference.weight,referenceDate:reference.date};
}

export function achievementAt(actual:number,date:string,plan:Plan){
  if(date<plan.startDate)return "outside-plan" as const;
  return actual<=plannedWeightAt(plan,date)?"achieved" as const:"missed" as const;
}

export function filterEntriesByRange(entries:Entry[],range:TrendRange){
  const sorted=[...entries].sort((a,b)=>a.date.localeCompare(b.date));
  if(range==="all"||sorted.length===0)return sorted;
  const end=sorted.at(-1)!.date,inclusiveDays=range==="7d"?7:30;
  const startDate=new Date(utc(end)-(inclusiveDays-1)*dayMs).toISOString().slice(0,10);
  return sorted.filter(entry=>entry.date>=startDate);
}
