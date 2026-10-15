import {importReducer,initialImport} from './import';
import type {Extraction} from '../api/documents';
const extraction:Extraction={id:'e',status:'ready',blocks:[],warnings:[],engine:'native'};
it('invalidates extracted text when pages or OCR engine change',()=>{
 const state={...initialImport,result:extraction};
 for(const action of [{type:'from',value:'201'},{type:'to',value:'300'},{type:'range',value:true},{type:'engine',value:'docling'}] as const)expect(importReducer(state,action).result).toBeNull();
});
it('new upload clears range and extraction associated with old file',()=>{
 const result=importReducer({...initialImport,range:true,from:'201',to:'300',result:extraction},{type:'document',value:{id:'new',name:'note.txt',kind:'txt',pageCount:null,sheets:[]}});
 expect(result).toMatchObject({range:false,from:'1',to:'1',result:null,document:{id:'new'}});
});
