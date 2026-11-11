"""Real database integration; fake only the Gmail boundary inherited from B2."""
import json
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from app.replies import service
from app.pipeline.jobs import enqueue

async def run(rt,worker,vendor,account,cid,client,execute,fake):
    async with rt.db.transaction(vendor) as (conn,_):
        await conn.execute("INSERT INTO products(vendor_id,name,price_kobo,lowest_price_kobo,stock_count) VALUES($1,'Ankara',1500000,1200000,8)",vendor)
        await conn.execute('UPDATE business_settings SET reply_engine_enabled=true WHERE vendor_id=$1',vendor)
        await conn.execute("UPDATE conversations SET human_mode=false,human_mode_until=NULL WHERE id=$1",cid)
    async def incoming(text):
        async with rt.db.transaction(vendor) as (conn,_):
            return await conn.fetchval("INSERT INTO messages(vendor_id,conversation_id,sender,content,status) VALUES($1,$2,'customer',$3,'received') RETURNING id",vendor,cid,text)
    async def process(mid):
        async with rt.db.transaction(vendor) as (conn,_):
            job=await conn.fetchval("SELECT id FROM jobs WHERE kind='reply' AND message_id=$1",mid)
        assert job, 'Inbound trigger must durably schedule reply processing'
        await execute(job)
    # Automatic price, then repeat processing: one outgoing intent only.
    mid=await incoming('Ankara price please')
    await process(mid);await process(mid)
    async with rt.db.transaction(vendor) as (conn,_):
        assert await conn.fetchval('SELECT lane FROM messages WHERE id=$1',mid)=='auto'
        jobs=await conn.fetch("SELECT j.id,m.content FROM jobs j JOIN messages m ON m.id=j.message_id WHERE m.reply_to_message_id=$1 AND j.kind='send'",mid)
        assert len(jobs)==1 and '₦15,000' in jobs[0]['content']
    await execute(jobs[0]['id'])
    # Discount below floor is never automatic, even if negotiation is on.
    mid2=await incoming('Ankara give it for N100 please')
    await process(mid2)
    async with rt.db.transaction(vendor) as (conn,_):
        a=await conn.fetchrow('SELECT * FROM approvals WHERE message_id=$1',mid2)
        assert a and a['safety_reason']=='discount_below_floor'
        assert abs((a['holding_reply_due_at']-a['created_at']).total_seconds()-300)<1
        assert await conn.fetchval("SELECT count(*) FROM jobs WHERE approval_id=$1 AND kind='holding_reply'",a['id'])==1
    response=await client.get('/v1/approvals');assert response.status_code==200,response.text
    # Edit cannot invent a price. Once-only decisions and duplicate requests are idempotent.
    response=await client.post(f"/v1/approvals/{a['id']}/decision",json={'action':'edit','editedReply':'Ankara costs N100'})
    assert response.status_code==409,response.text
    response=await client.post(f"/v1/approvals/{a['id']}/decision",json={'action':'edit','editedReply':'Ankara costs N15,000'})
    assert response.status_code==200,response.text
    response=await client.post(f"/v1/approvals/{a['id']}/decision",json={'action':'edit','editedReply':'Ankara costs N15,000'})
    assert response.status_code==200,response.text
    response=await client.post(f"/v1/approvals/{a['id']}/decision",json={'action':'reject'})
    assert response.status_code==409,response.text
    # Facts change after approval but before worker send: provider never sees it.
    async with rt.db.transaction(vendor) as (conn,_):
        outgoing=await conn.fetchval('SELECT outgoing_message_id FROM approvals WHERE id=$1',a['id'])
        job=await conn.fetchval("SELECT id FROM jobs WHERE message_id=$1 AND kind='send'",outgoing)
        await conn.execute("UPDATE products SET price_kobo=1600000 WHERE vendor_id=$1 AND name='Ankara'",vendor)
    before=fake.sends
    await execute(job)
    assert fake.sends==before
    async with rt.db.transaction(vendor) as (conn,_):
        assert await conn.fetchval('SELECT status FROM messages WHERE id=$1',outgoing)=='blocked'
        assert await conn.fetchval("SELECT count(*) FROM approvals WHERE message_id=$1 AND status='pending'",outgoing)==1
    # Automatic price also cannot survive a stale stock/price revision.
    mid3=await incoming('Ankara price please');await process(mid3)
    async with rt.db.transaction(vendor) as (conn,_):
        job=await conn.fetchval("SELECT j.id FROM jobs j JOIN messages m ON m.id=j.message_id WHERE m.reply_to_message_id=$1 AND j.kind='send'",mid3)
        await conn.execute("UPDATE products SET stock_count=7 WHERE vendor_id=$1 AND name='Ankara'",vendor)
    await execute(job);assert fake.sends==before
    # Durable human mode pauses incoming engine work and hand-back is API-backed.
    r=await client.patch(f'/v1/conversations/{cid}/human-mode',json={'until':(datetime.now(UTC)+timedelta(minutes=5)).isoformat()});assert r.status_code==200,r.text
    paused=await incoming('Ankara price please');await process(paused)
    async with rt.db.transaction(vendor) as (conn,_):assert await conn.fetchval('SELECT lane FROM messages WHERE id=$1',paused)=='paused'
    r=await client.patch(f'/v1/conversations/{cid}/human-mode',json={'until':None});assert r.status_code==200,r.text
    # Unsafe settings may not add refund to the auto lane.
    r=await client.patch('/v1/settings/reply-engine',json={'enabled':True,'autoIntents':['refund'],'autoNegotiation':True});assert r.status_code==422,r.text
    # Stale pending cards refresh and require a second explicit decision.
    pending=await incoming('Ankara discount N100 please');await process(pending)
    async with rt.db.transaction(vendor) as (conn,_):
        stale_id=await conn.fetchval('SELECT id FROM approvals WHERE message_id=$1',pending)
        await conn.execute("UPDATE products SET stock_count=6 WHERE vendor_id=$1 AND name='Ankara'",vendor)
    r=await client.post(f'/v1/approvals/{stale_id}/decision',json={'action':'send'});assert r.status_code==409,r.text
    r=await client.get('/v1/approvals');assert any(a['id']==str(stale_id) and a['safetyReason']=='stale_facts' for a in r.json()['data']['items']),r.text
    r=await client.post(f'/v1/approvals/{stale_id}/decision',json={'action':'reject'});assert r.status_code==200,r.text
    r=await client.post(f'/v1/approvals/{stale_id}/decision',json={'action':'reject'});assert r.status_code==200,r.text
    # A queued automatic reply rechecks human mode before provider send; hand-back resumes it.
    fresh=await incoming('Ankara price please');await process(fresh)
    async with rt.db.transaction(vendor) as (conn,_):
        queued=await conn.fetchval("SELECT j.id FROM jobs j JOIN messages m ON m.id=j.message_id WHERE m.reply_to_message_id=$1 AND j.kind='send'",fresh)
    r=await client.patch(f'/v1/conversations/{cid}/human-mode',json={'until':(datetime.now(UTC)+timedelta(minutes=5)).isoformat()});assert r.status_code==200
    count=fake.sends;await execute(queued);assert fake.sends==count
    r=await client.patch(f'/v1/conversations/{cid}/human-mode',json={'until':None});assert r.status_code==200
    await execute(queued);assert fake.sends==count+1
    # Customer voice is a transcript input, not a vendor recording feature.
    async with rt.db.transaction(vendor) as (conn,_):
        voice=await conn.fetchval("INSERT INTO messages(vendor_id,conversation_id,sender,content,kind,voice_transcript,voice_duration_seconds) VALUES($1,$2,'customer','Voice note','voice','Abeg Ankara price please',5) RETURNING id",vendor,cid)
    await process(voice)
    async with rt.db.transaction(vendor) as (conn,_):
        assert await conn.fetchval('SELECT detected_language FROM messages WHERE id=$1',voice)=='mixed'
        assert await conn.fetchval('SELECT lane FROM messages WHERE id=$1',voice)=='auto'
    # The manual reply API is not an alternate route around the final numeric verifier.
    r=await client.post('/v1/messages',headers={'Idempotency-Key':'b3-manual-unbacked-0001'},json={'conversationId':str(cid),'text':'Ankara costs N100'})
    assert r.status_code==202,r.text
    from uuid import UUID
    manual=UUID(r.json()['data']['id'])
    async with rt.db.transaction(vendor) as (conn,_):
        manual_job=await conn.fetchval("SELECT id FROM jobs WHERE message_id=$1 AND kind='send'",manual)
    count=fake.sends;await execute(manual_job);assert fake.sends==count
    async with rt.db.transaction(vendor) as (conn,_):assert await conn.fetchval('SELECT status FROM messages WHERE id=$1',manual)=='blocked'
    print('B3 automatic price, below-floor approval, once-only edits, stale approved/auto replies, holding schedule, takeover and settings checks passed')
