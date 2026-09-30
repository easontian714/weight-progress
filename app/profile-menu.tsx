"use client";
import { useState } from "react";
import { deleteProfile, renameProfile, type Profile } from "../lib/weight-repository";

type Props={profiles:Profile[];activeProfileId:string;busy:boolean;onSelect(id:string):void;onProfilesChanged(profiles:Profile[],activeId:string):void;onNotice(message:string):void};

export function ProfileMenu({profiles,activeProfileId,busy,onSelect,onProfilesChanged,onNotice}:Props){
  const [mode,setMode]=useState<"rename"|"delete"|null>(null),[name,setName]=useState(""),[saving,setSaving]=useState(false);
  const active=profiles.find(p=>p.id===activeProfileId);
  function open(next:typeof mode){setMode(next);setName(next==="rename"?active?.name??"":"")}
  async function submit(e:React.FormEvent){e.preventDefault();setSaving(true);try{
    if(mode==="rename"&&active){const updated=await renameProfile(active.id,name);onProfilesChanged(profiles.map(p=>p.id===updated.id?updated:p),updated.id);onNotice("用户名已更新。");}
    setMode(null);
  }catch(error){onNotice(error instanceof Error?error.message:"保存失败，请重试。")}finally{setSaving(false)}}
  async function remove(){if(!active||profiles.length<=1)return;setSaving(true);try{await deleteProfile(active.id);const next=profiles.filter(p=>p.id!==active.id),nextId=next[0].id;onProfilesChanged(next,nextId);onNotice("已删除 "+active.name+" 及其全部数据。");setMode(null)}catch(error){onNotice(error instanceof Error?error.message:"删除失败，请重试。")}finally{setSaving(false)}}
  return <>
    <div className="profile-menu">
      <label className="profile-switcher"><span>用户</span><select aria-label="选择用户" value={activeProfileId} disabled={busy} onChange={e=>onSelect(e.target.value)}>{profiles.map(profile=><option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
      <button className="profile-more" type="button" aria-label="重命名当前用户" title="重命名当前用户" onClick={()=>open("rename")}>✎</button>
      <button className="profile-more danger" type="button" aria-label="删除当前用户" title={profiles.length<=1?"必须保留至少一个用户":"删除当前用户"} disabled={profiles.length<=1} onClick={()=>open("delete")}>−</button>
    </div>
    {mode==="rename"&&<div className="backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setMode(null)}}><form className="dialog" onSubmit={submit}><button type="button" className="close" onClick={()=>setMode(null)} aria-label="关闭">×</button><p className="eyebrow">PROFILE</p><h2>重命名当前用户</h2><label>用户名<input autoFocus value={name} onChange={e=>setName(e.target.value)} maxLength={40} required/></label><button className="primary" disabled={saving}>{saving?"正在保存…":"保存"}</button></form></div>}
    {mode==="delete"&&active&&<div className="backdrop"><div className="dialog"><button type="button" className="close" onClick={()=>setMode(null)} aria-label="关闭">×</button><p className="eyebrow">DELETE PROFILE</p><h2>删除 {active.name}？</h2><p>该用户的计划、体重记录和每周节点都会永久删除，此操作无法恢复。</p><div className="dialog-actions"><button className="text" onClick={()=>setMode(null)}>取消</button><button className="primary destructive" disabled={saving} onClick={()=>void remove()}>{saving?"正在删除…":"确认删除"}</button></div></div></div>}
  </>
}
