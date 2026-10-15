export function apiErrorMessage(payload:unknown,fallback:string):string{
 if(!payload||typeof payload!=='object')return fallback;
 const detail=(payload as {detail?:unknown}).detail;
 if(typeof detail==='string'&&detail.trim())return detail;
 if(detail&&typeof detail==='object'){
  const message=(detail as {message?:unknown}).message;
  if(typeof message==='string'&&message.trim())return message;
 }
 return fallback;
}
