import type {Document,Extraction} from '../api/documents';
export type ImportState={document:Document|null;range:boolean;from:string;to:string;engine:'native'|'docling';result:Extraction|null};
export const initialImport:ImportState={document:null,range:false,from:'1',to:'1',engine:'native',result:null};
export type ImportAction={type:'document';value:Document}|{type:'range';value:boolean}|{type:'from'|'to';value:string}|{type:'engine';value:'native'|'docling'}|{type:'result';value:Extraction};
export function importReducer(state:ImportState,action:ImportAction):ImportState{
 switch(action.type){
  case 'document':return {...initialImport,engine:state.engine,document:action.value,to:String(action.value.pageCount||1)};
  case 'result':return {...state,result:action.value};
  default:return {...state,[action.type]:action.value,result:null};
 }
}
