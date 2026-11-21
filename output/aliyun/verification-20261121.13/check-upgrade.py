from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import uuid4
from contextlib import closing
import json,os,socket,sqlite3,subprocess,time
from urllib.request import Request,urlopen

folder=Path(__file__).resolve().parent
with TemporaryDirectory(prefix='petshop-approved-upgrade-') as temp:
    db=Path(temp)/'private.sqlite'
    with socket.socket() as probe:
        probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
    origin=f'http://127.0.0.1:{port}'
    def api(route,body=None,token=None):
        data=None if body is None else json.dumps(body).encode()
        headers={'Content-Type':'application/json'}
        if token:headers['Authorization']='Bearer '+token
        with urlopen(Request(origin+'/petshop-api/v1/'+route,data=data,headers=headers),timeout=10) as response:
            return json.load(response)
    def start(path,existing):
        child=subprocess.Popen(['node','server.mjs'],cwd=path,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,
          env={**os.environ,'PORT':str(port),'PETSHOP_ORIGIN':origin,'PETSHOP_DB':str(db),'PETSHOP_REQUIRE_EXISTING':str(int(existing))},
          creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        for _ in range(100):
            try:api('health');return child
            except OSError:time.sleep(.1)
        child.terminate();raise RuntimeError('Local account service unavailable')
    def records():
        with closing(sqlite3.connect(db)) as connection:
            return connection.execute('SELECT id,password_hash,snapshot FROM trial_accounts').fetchone(),connection.execute('SELECT digest FROM trial_sessions').fetchall()
    credentials={'username':'本版升级验收','password':uuid4().hex}
    child=start(folder/'previous-runtime',False)
    try:
        account=api('auth/register',credentials);shop=api('shop',token=account['token'])
        command={'type':'onboarding.openRoom','args':{},'profileId':shop['profileId'],'version':shop['version'],'requestId':uuid4().hex}
        receipt=api('action',command,account['token']);api('shop',token=account['token'])
        before,sessions=records()
    finally:child.terminate();child.wait(timeout=10)
    with closing(sqlite3.connect(db)) as migration:
        migration.executescript((folder/'runtime/schema.sql').read_text(encoding='utf-8'))
    child=start(folder/'runtime',True)
    try:
        login=api('auth/login',credentials)
        restored=api('shop',token=account['token'])
        after,new_sessions=records()
        old_state,new_state=json.loads(before[2])['state'],json.loads(after[2])['state']
        assert before[:2]==after[:2]
        assert set(sessions).issubset(new_sessions)
        for field in ('profileId','coins','care','pets','rooms','onboarding'):
            assert old_state.get(field)==new_state.get(field),(field,old_state.get(field),new_state.get(field))
        replay=api('action',command,login['token']);assert replay==receipt
        assert new_state['show'].get('scoringVersion')==2
        assert new_state['show'].get('onlinePublic') is True
        assert new_state['show']['calendar']==old_state['show']['calendar']
        letter=api('page',{'page':'openingGuide','args':{}},login['token'])['page']
        assert len(letter['visual']['openingBooklet'])==9
        fresh=api('auth/register',{'username':'正式权限验收','password':uuid4().hex})
        fresh_shop=api('shop',token=fresh['token'])
        assert fresh_shop['coins']==680
        assert not fresh_shop['featureAccess']['show']['unlocked']
        try:
            api('action',{'type':'localTest.addCoins','args':{},'profileId':fresh_shop['profileId'],'version':fresh_shop['version'],'requestId':uuid4().hex},fresh['token'])
            raise AssertionError('local cheat allowed')
        except Exception as error:
            assert getattr(error,'code',None) in (400,409),error
        assert api('shop',token=fresh['token'])['coins']==680
        report={'previous':'2026.11.21.12','candidate':'2026.11.21.13','isolatedSQLite':True,
          'identityAndPasswordPreserved':True,'sessionsPreserved':True,'petsCoinsRoomsAndGuidePreserved':True,
          'priorActionReplayedOnce':True,'permanentNinePageLetter':True,'productionScoringVersion':2,'sharedPublicShows':True,'normalFeatureLocks':True,'walletCheatRejected':True,'productionDatabaseUsed':False}
        (folder/'upgrade-results.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
        print(json.dumps(report),flush=True)
    finally:child.terminate();child.wait(timeout=10)
