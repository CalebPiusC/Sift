"""B5 exercises real API/DB/Redis/worker; only Meta/Gemini HTTP is fake."""
import asyncio
import hashlib
import hmac
import json
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import httpx

from app.channels.base import Outgoing
from app.channels.gmail import ChannelError
from app.whatsapp.cloud import Cloud, http_client, sandbox
from app.whatsapp.codes import Codes
from app.pipeline.tokens import adapter_for
import app.pipeline.worker as worker_module


async def run(rt, worker, vendor, client, execute):
    settings=rt.settings
    settings.whatsapp_mode='sandbox'
    settings.meta_app_secret='sandbox-webhook-secret'
    settings.meta_verify_token='sandbox-verify-token'
    # Assignments must preserve pydantic SecretStr (settings is not validate_assignment).
    from pydantic import SecretStr
    settings.meta_app_secret=SecretStr('sandbox-webhook-secret')
    settings.meta_verify_token=SecretStr('sandbox-verify-token')
    settings.whatsapp_helper_phone_id='sandbox-helper'
    settings.whatsapp_helper_number='2348000000000'
    async with rt.db.transaction(vendor) as (conn,_):
        member=await conn.fetchval("SELECT id FROM vendor_members WHERE vendor_id=$1 AND role='owner'",vendor)
        await conn.execute("INSERT INTO products(vendor_id,name,price_kobo,lowest_price_kobo,stock_count) VALUES($1,'Black sneakers helper',2000000,1500000,9)",vendor)
    clock=[1000.0]
    codes=Codes(rt.queue.redis,rt.crypto,lambda:clock[0])
    owner=uuid4()
    first=await codes.issue(vendor,owner)
    assert len(first['code'])==4 and first['code'].isdigit()
    newer=await codes.issue(vendor,owner)
    assert await codes.consume('2348111111111',first['code'])=='invalid'
    assert isinstance(await codes.consume('2348111111111',newer['code']),dict)
    assert await codes.consume('2348111111111',newer['code'])=='invalid'
    expiring=await codes.issue(vendor,owner)
    clock[0]+=600
    assert await codes.consume('2348222222222',expiring['code'])=='invalid'
    locked=await codes.issue(vendor,owner)
    bad=next(f'{n:04d}' for n in range(10000) if rt.crypto.digest('wa-code', f'{n:04d}') != locked['hash'] and f'{n:04d}' not in (first['code'],newer['code'],expiring['code']))
    for _ in range(4):assert await codes.consume('2348333333333',bad)=='invalid'
    assert await codes.consume('2348333333333',bad)=='locked'
    assert await codes.consume('2348333333333',locked['code'])=='locked'
    # Other senders are unaffected. Concurrent consumes have exactly one winner.
    results=await asyncio.gather(*[codes.consume('2348444444444',locked['code']) for _ in range(8)])
    assert sum(isinstance(x,dict) for x in results)==1
    clock[0]+=899
    assert await codes.consume('2348333333333',bad)=='locked'
    clock[0]+=1
    fresh=await codes.issue(vendor,owner)
    assert isinstance(await codes.consume('2348333333333',fresh['code']),dict)
    recovered=await codes.issue(vendor,owner)
    binding=await codes.consume('2348777777777',recovered['code'],'wamid.code-recovery')
    assert isinstance(binding,dict)
    assert await codes.consume('2348777777777',recovered['code'],'wamid.code-recovery')==binding
    assert await codes.consume('2348888888888',recovered['code'],'wamid.code-recovery')=='invalid'
    assert await codes.consume('2348777777777',recovered['code'],'wamid.different-event')=='invalid'
    from unittest.mock import patch
    preserved=await codes.issue(vendor,owner)
    occupied=await codes.issue(vendor,uuid4())
    with patch('app.whatsapp.codes.secrets.randbelow',return_value=int(occupied['code'])):
        try:await codes.issue(vendor,owner);assert False,'Collision was allowed'
        except ValueError:pass
    assert isinstance(await codes.consume('2348999999999',preserved['code']),dict)
    r=await client.get('/v1/webhooks/whatsapp',params={'hub.mode':'subscribe','hub.verify_token':'sandbox-verify-token','hub.challenge':'123456'})
    assert r.status_code==200 and r.text=='123456',r.text
    r=await client.get('/v1/webhooks/whatsapp',params={'hub.mode':'subscribe','hub.verify_token':'bad','hub.challenge':'123'})
    assert r.status_code==403
    r=await client.post('/v1/channels/connections',json={'channel':'whatsapp'});assert r.status_code==200,r.text
    attempt=r.json()['data']['id']
    r=await client.post(f'/v1/channels/whatsapp/signup/{attempt}/complete',json={});assert r.status_code==200,r.text
    account=UUID(r.json()['data']['id'])
    assert (await client.post(f'/v1/channels/whatsapp/signup/{attempt}/complete',json={})).status_code==409
    count=[0]
    async def incoming(phone_id,kind='text',text='Hello',media='sandbox-audio',sender='2348555555555',message_id=None):
        count[0]+=1
        mid=message_id or f'wamid.b5-{count[0]}'
        m={'id':mid,'from':sender,'timestamp':str(int(datetime.now(UTC).timestamp())),'type':kind}
        m['text' if kind=='text' else kind]={'body':text} if kind=='text' else {'id':media}
        payload={'object':'whatsapp_business_account','entry':[{'changes':[{'field':'messages','value':{'metadata':{'phone_number_id':phone_id},'contacts':[{'profile':{'name':'WhatsApp customer'}}],'messages':[m]}}]}]}
        raw=json.dumps(payload).encode()
        sig='sha256='+hmac.new(b'sandbox-webhook-secret',raw,hashlib.sha256).hexdigest()
        r=await client.post('/v1/webhooks/whatsapp',content=raw,headers={'x-hub-signature-256':sig})
        if r.status_code!=202:
            from app.whatsapp.service import accept
            await accept(rt,payload['entry'][0]['changes'][0]['value'])
        assert r.status_code==202,r.text
        async with rt.db.transaction(vendor) as (conn,_):
            jid=await conn.fetchval("SELECT j.id FROM jobs j JOIN webhook_events e ON e.id=j.webhook_event_id WHERE e.provider='whatsapp' AND e.provider_event_id=$1",mid)
        if jid:
            await execute(jid)
            async with rt.db.transaction(vendor) as (conn,_):job=await conn.fetchrow('SELECT * FROM jobs WHERE id=$1',jid)
            if job['status']!='succeeded':
                from app.whatsapp.service import process
                await process(worker,job)
                assert False,job['last_error_code']
        return mid
    r=await client.post('/v1/webhooks/whatsapp',json={'object':'whatsapp_business_account'},headers={'x-hub-signature-256':'sha256=bad'});assert r.status_code==401
    await incoming('sandbox-'+str(vendor),text='Hello',message_id='wamid.duplicate')
    await incoming('sandbox-'+str(vendor),text='Hello',message_id='wamid.duplicate')
    async with rt.db.transaction(vendor) as (conn,_):
        assert await conn.fetchval("SELECT count(*) FROM messages WHERE provider_account_id=$1 AND provider_message_id='wamid.duplicate'",account)==1
    # Full B3 verified reply -> WhatsApp text outbox, with customer-specific window.
    async with rt.db.transaction(vendor) as (conn,_):
        await conn.execute("UPDATE business_settings SET reply_engine_enabled=true,reply_engine_enabled_at=now()-interval '1 minute',hours_enabled=false WHERE vendor_id=$1",vendor)
        greeting_mid=await conn.fetchval("SELECT id FROM messages WHERE provider_account_id=$1 AND provider_message_id='wamid.duplicate'",account)
        reply_job=await conn.fetchval("SELECT id FROM jobs WHERE message_id=$1 AND kind='reply'",greeting_mid)
    await execute(reply_job)
    async with rt.db.transaction(vendor) as (conn,_):
        send_job=await conn.fetchval("SELECT id FROM jobs WHERE kind='send' AND conversation_id=(SELECT conversation_id FROM messages WHERE id=$1) AND status='queued' ORDER BY created_at DESC LIMIT 1",greeting_mid)
    worker_module.adapter_for=adapter_for
    assert send_job,'No verified greeting was queued'
    await execute(send_job)
    assert sandbox.sent[-1]['type']=='text'
    audio_id=await incoming('sandbox-'+str(vendor),kind='audio')
    async with rt.db.transaction(vendor) as (conn,_):
        msg=await conn.fetchrow('SELECT * FROM messages WHERE provider_account_id=$1 AND provider_message_id=$2',account,audio_id)
        assert msg['voice_transcript']=='black sneakers finished' and msg['kind']=='voice'
        cid=msg['conversation_id']
        event=await conn.fetchrow('SELECT * FROM webhook_events WHERE provider_event_id=$1',audio_id)
        assert bytes(event['media_ciphertext'])!=sandbox.audio and event['media_mime']=='audio/ogg'
        assert event['processed_at']
    media_response=await client.get(f"/v1/messages/{msg['id']}/media");assert media_response.status_code==200 and media_response.content==sandbox.audio,media_response.text
    assert media_response.headers['cache-control']=='private, no-store'
    image_id=await incoming('sandbox-'+str(vendor),kind='image',media='sandbox-image')
    async with rt.db.transaction(vendor) as (conn,_):
        image=await conn.fetchrow('SELECT * FROM messages WHERE provider_account_id=$1 AND provider_message_id=$2',account,image_id)
        assert image['lane']=='paused' and image['lane_reason']=='media_review'
        image_reply_job=await conn.fetchval("SELECT id FROM jobs WHERE message_id=$1 AND kind='reply'",image['id'])
    if image_reply_job:await execute(image_reply_job)
    # Exercise actual outbox through the common adapter, not B2's fake Gmail object.
    worker_module.adapter_for=adapter_for
    r=await client.post('/v1/channels/whatsapp/templates/send',json={'conversationId':str(cid),'name':'hello_world','language':'en_US'});assert r.status_code==200,r.text
    async with rt.db.transaction(vendor) as (conn,_):
        await conn.execute("UPDATE conversations SET last_customer_at=now()-interval '25 hours' WHERE id=$1",cid)
        jid=await conn.fetchval("SELECT id FROM jobs WHERE message_id=$1 AND kind='send'",UUID(r.json()['data']['id']))
    await execute(jid)
    assert sandbox.sent[-1]['type']=='template'
    async with rt.db.transaction(vendor) as (conn,_):
        assert await conn.fetchval('SELECT status FROM messages WHERE id=$1',UUID(r.json()['data']['id']))=='sent'
    async with http_client(settings) as http:
        cloud=Cloud(settings,'sandbox-token','sandbox-phone','sandbox-waba',http,datetime.now(UTC)-timedelta(hours=24))
        for operation in (cloud.send(Outgoing('2348555555555','not allowed','','','','')),cloud.send_template('2348555555555','not_approved','en_US')):
            try:await operation;assert False,'Unsafe send allowed'
            except ChannelError as error:assert error.code in ('WHATSAPP_TEMPLATE_REQUIRED','WHATSAPP_TEMPLATE_NOT_APPROVED')
    # Authenticated link code -> signed helper webhook -> voice transcript -> prompt -> YES.
    r=await client.post('/v1/channels/whatsapp/helper/codes',json={})
    if r.status_code!=200:
        from app.whatsapp.api import new_code
        from app.auth import Identity
        async with rt.db.transaction(vendor) as (conn,_):uid=await conn.fetchval('SELECT user_id FROM vendor_members WHERE id=$1',member)
        await new_code(rt,Identity(id=uid,email='test@example.test'),vendor)
    assert r.status_code==200,r.text
    link=r.json()['data'];assert len(link['code'])==4
    await incoming('sandbox-helper',text=link['code'],sender='2348666666666')
    r=await client.get('/v1/channels/whatsapp/helper');assert r.json()['data']['status']=='linked',r.text
    sandbox.transcript='Black sneakers helper finished'
    await incoming('sandbox-helper',kind='audio',sender='2348666666666')
    assert 'Reply YES' in sandbox.sent[-1]['text']['body'],sandbox.sent[-1]
    async with rt.db.transaction(vendor) as (conn,_):
        assert await conn.fetchval("SELECT stock_count FROM products WHERE name='Black sneakers helper'")==9
    await incoming('sandbox-helper',text='YES',sender='2348666666666',message_id='wamid.helper-yes')
    assert sandbox.sent[-1]['text']['body']=='Updated Black sneakers helper.',sandbox.sent[-1]
    await incoming('sandbox-helper',text='YES',sender='2348666666666',message_id='wamid.helper-yes')
    async with rt.db.transaction(vendor) as (conn,_):
        assert await conn.fetchval("SELECT stock_count FROM products WHERE name='Black sneakers helper'")==0
        assert await conn.fetchval("SELECT count(*) FROM audit_log WHERE action='catalogue.instruction.confirmed'")==1
    # App uses the exact same parser/confirmation functions as helper transcripts.
    p=await client.post('/v1/catalogue/text-proposals',json={'text':'set Black sneakers helper stock to 8'});assert p.status_code==200,p.text
    proposal=p.json()['data']
    body={'productId':proposal['candidates'][0]['id']}
    confirmed=await client.post(f"/v1/catalogue/text-proposals/{proposal['id']}/confirm",json=body);assert confirmed.status_code==200,confirmed.text
    again=await client.post(f"/v1/catalogue/text-proposals/{proposal['id']}/confirm",json=body);assert again.status_code==200,again.text
    async with rt.db.transaction(vendor) as (conn,_):assert await conn.fetchval("SELECT stock_count FROM products WHERE name='Black sneakers helper'")==8
    await incoming('sandbox-helper',text='how many orders today',sender='2348666666666')
    assert 'orders created today (Africa/Lagos)' in sandbox.sent[-1]['text']['body']
    # Stale helper proposal cannot overwrite a catalogue change made after its prompt.
    await incoming('sandbox-helper',text='set Black sneakers helper stock to 12',sender='2348666666666')
    async with rt.db.transaction(vendor) as (conn,_):
        await conn.execute("UPDATE products SET revision=revision+1 WHERE name='Black sneakers helper'")
    await incoming('sandbox-helper',text='YES',sender='2348666666666')
    assert 'Catalogue changed' in sandbox.sent[-1]['text']['body']
    async with rt.db.transaction(vendor) as (conn,_):
        assert await conn.fetchval("SELECT stock_count FROM products WHERE name='Black sneakers helper'")==8
        manager=await conn.fetchval("SELECT id FROM vendor_members WHERE vendor_id=$1 AND role='manager' LIMIT 1",vendor)
        assert manager
        await conn.execute("UPDATE helper_links SET member_id=$2,pending_proposal_id=NULL WHERE member_id=$1 AND status='linked'",member,manager)
        await conn.execute("UPDATE vendor_members SET status='suspended' WHERE id=$1",manager)
    sent_before=len(sandbox.sent)
    await incoming('sandbox-helper',text='set Black sneakers helper stock to 99',sender='2348666666666')
    assert len(sandbox.sent)==sent_before,'Revoked membership retained helper authority'
    async with rt.db.transaction(vendor) as (conn,_):
        await conn.execute("UPDATE vendor_members SET status='active' WHERE id=$1",manager)
    denied=await client.get(f"/v1/messages/{msg['id']}/media",headers={'X-Vendor-Id':str(uuid4())})
    assert denied.status_code==403,denied.text
    print('B5 sandbox Embedded Signup -> signed text/audio/image -> private media/transcript -> approved-template outbox; helper voice -> YES catalogue update; Redis code expiry/replacement/once-only/5-try lockout/concurrency passed')
