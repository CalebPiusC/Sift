"""Native integration harness. Google is a fake adapter; PostgreSQL/Redis/processes are real."""
import asyncio
import json
import os
import signal
import subprocess
import sys
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import httpx
from redislite import Redis

from app.auth import Identity, current_user
from app.channels.base import Incoming
from app.config import Settings, get_settings
from app.main import app
from app.pipeline.api import Runtime, runtime
from app.pipeline.crypto import b64
from app.pipeline.ingest import ingest
from app.pipeline.jobs import claim, enqueue
from app.pipeline.worker import Worker
import app.pipeline.worker as worker_module

async def main():
    redis = Redis(serverconfig={'port': '0'})
    socket = redis.connection_pool.connection_kwargs['path']
    settings = Settings(database_url=os.environ['DATABASE_URL'], redis_url=f'unix://{socket}', pipeline_enabled=True,
        pipeline_keys=json.dumps({'v1': b64(b'k'*32)}), identity_pepper=b64(b'p'*32),pipeline_lease_seconds=1)
    rt = Runtime(settings)
    fixtures=json.loads(os.environ['B2_FIXTURE'])
    f=fixtures['own']
    vendor=UUID(f['vendor'])
    account=UUID(f['ids']['channel_accounts'])
    user=UUID(f['users']['owner'])
    app.dependency_overrides[get_settings]=lambda:settings
    app.dependency_overrides[runtime]=lambda:rt
    app.dependency_overrides[current_user]=lambda:Identity(id=user,email='test@example.test')
    try:
        async with rt.db.transaction(vendor) as (conn,_):
            await conn.execute("UPDATE channel_accounts SET channel='email',provider='gmail',status='connected' WHERE id=$1",account)
            item=Incoming('gmail-1','thread-1','ada@example.test','Ada','Good afternoon, is this available?','Enquiry','<one@example.test>',1700000000000,False)
            mid=await ingest(conn,rt.crypto,vendor,account,item,'https://mail.google.com/mail/u/0/#all/thread-1')
            assert await ingest(conn,rt.crypto,vendor,account,item,'link')==mid
            cid=await conn.fetchval('SELECT conversation_id FROM messages WHERE id=$1',mid)
            old=Incoming('gmail-older','thread-1','ada@example.test','Ada','Older','Enquiry','<old@example.test>',1600000000000,False)
            await ingest(conn,rt.crypto,vendor,account,old,'link')
            assert await conn.fetchval('SELECT last_message_id FROM conversations WHERE id=$1',cid)==mid
        headers={'X-Vendor-Id':str(vendor),'Idempotency-Key':'integration-send-0001'}
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='https://test',headers=headers) as client:
            r=await client.get('/v1/conversations');assert r.status_code==200,r.text
            r=await client.get('/v1/messages',params={'conversationId':str(cid),'limit':1});assert r.status_code==200,r.text
            assert r.json()['data']['hasMore']
            cursor=r.json()['data']['nextCursor']
            r=await client.get('/v1/messages',params={'conversationId':str(cid),'cursor':cursor});assert r.status_code==200,r.text
            body={'conversationId':str(cid),'text':'Thank you for your enquiry.'}
            r=await client.post('/v1/messages',json=body);assert r.status_code==202,r.text
            sent_id=r.json()['data']['id']
            r=await client.post('/v1/messages',json=body);assert r.json()['data']['id']==sent_id,r.text
            r=await client.post('/v1/messages',json={**body,'text':'Changed'});assert r.status_code==409,r.text
            r=await client.get('/v1/messages',params={'conversationId':fixtures['other']['ids']['conversations']});assert r.status_code==404,r.text
            r=await client.get('/v1/jobs/dead');assert r.status_code==200,r.text
            r=await client.patch(f'/v1/conversations/{cid}/human-mode',json={'until':(datetime.now(UTC)+timedelta(minutes=5)).isoformat()});assert r.status_code==200,r.text
            r=await client.post(f'/v1/conversations/{cid}/read');assert r.status_code==200,r.text
        # Exercise the actual outbox worker against a fake Gmail boundary only.
        class FakeGmail:
            sends=0
            async def find_sent(self,rfc):return None
            async def send(self,outgoing):
                self.sends+=1
                assert outgoing.recipient=='ada@example.test'
                assert outgoing.thread_id=='thread-1'
                return 'provider-sent-'+str(self.sends)
        fake=FakeGmail()
        async def fake_adapter(*args):return fake
        worker_module.adapter_for=fake_adapter
        worker=Worker(settings,db=rt.db,queue=rt.queue)
        async def execute(jid):
            async with rt.db.transaction(vendor) as (conn,_):
                job=await conn.fetchrow("UPDATE jobs SET status='running',attempts=attempts+1,lease_token=$2,locked_until=now()+interval '60 seconds' WHERE id=$1 RETURNING *",jid,uuid4())
            await worker.run_job(job)
        async with rt.db.transaction(vendor) as (conn,_):
            jid=await conn.fetchval("SELECT id FROM jobs WHERE message_id=$1 AND kind='send'",UUID(sent_id))
        await execute(jid)
        async with rt.db.transaction(vendor) as (conn,_):
            assert await conn.fetchval('SELECT status FROM messages WHERE id=$1',UUID(sent_id))=='sent'
            # Echo from Sent reconciles with the original outgoing message, never a second bubble.
            rfc=await conn.fetchval('SELECT rfc_message_id FROM messages WHERE id=$1',UUID(sent_id))
            echo=Incoming('provider-sent-1','thread-1','ada@example.test','Ada','Thank you','Enquiry',rfc,1800000000000,True)
            assert await ingest(conn,rt.crypto,vendor,account,echo,'link')==UUID(sent_id)
            # Simulate crash after sending state persisted, before provider response committed.
            await conn.execute("UPDATE messages SET status='sending',provider_message_id=NULL WHERE id=$1",UUID(sent_id))
        await execute(jid)
        async with rt.db.transaction(vendor) as (conn,_):
            assert await conn.fetchval('SELECT delivery_error_code FROM messages WHERE id=$1',UUID(sent_id))=='DELIVERY_UNCERTAIN'
        await execute(jid) # Explicit reconciliation retry must NOT blindly send again.
        assert fake.sends==1
        async with rt.db.transaction(vendor) as (conn,_):
            await conn.execute("UPDATE conversations SET human_mode=false,human_mode_until=NULL WHERE id=$1",cid)
            # A holding reply is durable and idempotent even when its handler runs twice.
            aid=await conn.fetchval("INSERT INTO approvals(vendor_id,conversation_id,message_id,customer_message,facts,proposed_reply,reason,holding_reply_due_at) VALUES($1,$2,$3,'Enquiry','{}','Review needed','unknown_intent',now()-interval '1 second') RETURNING id",vendor,cid,mid)
            hj=await conn.fetchval("SELECT id FROM jobs WHERE approval_id=$1 AND kind='holding_reply'",aid)
        await execute(hj)
        await execute(hj)
        async with rt.db.transaction(vendor) as (conn,_):
            assert await conn.fetchval("SELECT count(*) FROM jobs WHERE approval_id=$1 AND kind='send'",aid)==1
            sj=await conn.fetchval("SELECT id FROM jobs WHERE approval_id=$1 AND kind='send'",aid)
        await execute(sj)
        async with rt.db.transaction(vendor) as (conn,_):
            assert await conn.fetchval('SELECT holding_reply_sent_at IS NOT NULL FROM approvals WHERE id=$1',aid)
        # Actual child process claims a delayed job then is SIGKILLed; next worker reclaims expired lease.
        async with rt.db.transaction(vendor) as (conn,_):
            await conn.execute("UPDATE jobs SET status='succeeded' WHERE status='queued'")
            await conn.execute("UPDATE conversations SET human_mode_until=now()-interval '1 second' WHERE id=$1",cid)
            jid=await enqueue(conn,vendor,'takeover_timeout','kill-test',conversation_id=cid)
        script='''import asyncio,os\nfrom uuid import UUID, uuid4\nfrom app.config import Settings\nfrom app.pipeline.db import Database\nfrom app.pipeline.jobs import claim\nasync def go():\n d=Database(Settings(database_url=os.environ['DATABASE_URL']))\n async with d.transaction(UUID(os.environ['VENDOR'])) as (c,_):\n  j=await claim(c,UUID(os.environ['VENDOR']),1)\n print('claimed',flush=True)\n await asyncio.Event().wait()\nasyncio.run(go())'''
        child=subprocess.Popen([sys.executable,'-c',script],env={**os.environ,'VENDOR':str(vendor)},stdout=subprocess.PIPE,text=True)
        try:
            assert await asyncio.to_thread(child.stdout.readline)=='claimed\n'
            child.send_signal(signal.SIGKILL)
            await asyncio.to_thread(child.wait)
        finally:
            if child.poll() is None:child.kill();child.wait()
        await asyncio.sleep(1.1)
        worker=Worker(settings,db=rt.db,queue=rt.queue)
        # Restart and execute all due timeout jobs; no Gmail network calls are made.
        for _ in range(4):
            async with rt.db.transaction(vendor) as (conn,_):job=await claim(conn,vendor,5)
            if job:await worker.run_job(job)
        async with rt.db.transaction(vendor) as (conn,_):
            assert await conn.fetchval('SELECT status FROM jobs WHERE id=$1',jid)=='succeeded'
            assert not await conn.fetchval('SELECT human_mode FROM conversations WHERE id=$1',cid)
        await rt.queue.wake(vendor)
        assert await rt.queue.next_vendor()==str(vendor)
        from b3_checks import run as b3_checks
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='https://test',headers=headers) as client:
            await b3_checks(rt,worker,vendor,account,cid,client,execute,fake)
        from b4_checks import run as b4_checks
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='https://test',headers=headers) as client:
            await b4_checks(rt,worker,vendor,account,cid,client,execute,fake)
        from b5_checks import run as b5_checks
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='https://test',headers=headers) as client:
            await b5_checks(rt,worker,vendor,client,execute)
        from b7_checks import run as b7_checks
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='https://test',headers=headers) as client:
            await b7_checks(rt,worker,vendor,account,client,execute)
        from b8_checks import run as b8_checks
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='https://test',headers=headers) as client:
            await b8_checks(rt,worker,vendor,account,client,execute)
        from b9_checks import run as b9_checks
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='https://test',headers=headers) as client:
            await b9_checks(rt,worker,vendor,account,client,execute)
        print('B2 native APIs, dedupe, out-of-order, tenant isolation, idempotency, durable lease kill/restart and Redis checks passed')
    finally:
        await rt.queue.close()
        await rt.db.close()
        redis.shutdown()

asyncio.run(main())
