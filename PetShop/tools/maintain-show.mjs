import { readFile } from 'node:fs/promises';
import { credentialPath, maintenanceDirectory } from '../server/local-maintenance.mjs';

const [command,id,...parts]=process.argv.slice(2);
try {
  if(!(command==='list'&&!id) && !(command==='void'&&id&&parts.length)){
    throw Error('用法：node tools/maintain-show.mjs list 或 node tools/maintain-show.mjs void 期号 "技术原因"');
  }
  const port=Number(process.env.PETSHOP_PORT||17888);
  if(!Number.isInteger(port)||port<1||port>65535)throw Error('维护端口无效。');
  const key=await readFile(credentialPath(maintenanceDirectory,port),'utf8').catch(()=>{
    throw Error('未找到当前系统用户的本机维护凭据。请确认该端口正在运行支持赛事维护的宠物店服务。');
  });
  const response=await fetch('http://127.0.0.1:'+port+'/api/local-show-maintenance',{
    method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},
    body:JSON.stringify({command,id,reason:parts.join(' ')}),
  });
  const data=await response.json();
  if(!response.ok)throw Error(data.error||'赛事维护失败。');
  if(command==='list'){console.log('本机店主 '+data.profileId);console.table(data.rounds);}
  else console.log(data.id+' 已作废。原因：'+data.reason+'。退还原报名费 '+data.refund+' 金币。');
} catch(err) {
  console.error(err.message);process.exitCode=1;
}
