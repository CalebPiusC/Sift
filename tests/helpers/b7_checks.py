"""B7 backend slice demo: real PostgreSQL, no external provider sends."""
from uuid import UUID
from app.channels.base import Incoming
from app.pipeline.ingest import ingest
from app.extras.safety import allowed


async def run(rt,worker,vendor,account,client,execute):
    async with rt.db.transaction(vendor) as (conn,_):
        mid=await ingest(conn,rt.crypto,vendor,account,Incoming('b7-consent','b7-thread','b7@example.test','B7 Customer','You can follow up with me','Enquiry','<b7@example.test>',1770000000000,False),'link')
        cid=await conn.fetchval('SELECT conversation_id FROM messages WHERE id=$1',mid)
        customer=await conn.fetchval('SELECT customer_id FROM conversations WHERE id=$1',cid)
    for path in ('/v1/customers','/v1/extras','/v1/team','/v1/team/audit','/v1/notifications','/v1/business/export'):
        r=await client.get(path);assert r.status_code==200,(path,r.text)
    r=await client.patch(f'/v1/customers/{customer}',json={'notes':'Prefers blue','tags':['returning'],'flagged':False});assert r.status_code==200,r.text
    r=await client.patch('/v1/extras/followups/settings',json={'enabled':True,'afterHours':48,'style':'friendly'});assert r.status_code==200,r.text
    r=await client.patch(f'/v1/conversations/{cid}/stage',json={'stage':'cold'});assert r.status_code==200,r.text
    r=await client.post('/v1/extras/followups',json={'conversationId':str(cid),'consentMessageId':str(mid)});assert r.status_code==200,r.text
    fid=UUID(r.json()['data']['id'])
    async with rt.db.transaction(vendor) as (conn,_):
        await ingest(conn,rt.crypto,vendor,account,Incoming('b7-stop','b7-thread','b7@example.test','B7 Customer','STOP','Enquiry','<b7stop@example.test>',1770000001000,False),'link')
        assert not await allowed(conn,vendor,cid)
        assert await conn.fetchval('SELECT status FROM followups WHERE id=$1',fid)=='cancelled'
    r=await client.post('/v1/extras/followups',json={'conversationId':str(cid),'consentMessageId':str(mid)});assert r.status_code==409,r.text
    async with rt.db.transaction(vendor) as (conn,_):
        mid=await ingest(conn,rt.crypto,vendor,account,Incoming('b7-phish','b7-phish-thread','phish@example.test','Spam','Send your OTP to verify','Enquiry','<phish@example.test>',1770000002000,False),'link')
        flag=await conn.fetchval('SELECT id FROM moderation_flags WHERE message_id=$1',mid)
        assert flag
    r=await client.patch(f'/v1/extras/flags/{flag}',json={'action':'not_spam'});assert r.status_code==200,r.text
    r=await client.get('/v1/notifications');assert r.status_code==200,r.text
    print('B7 slice: database memory, consent scheduling, STOP suppression/cancellation, classifier and Not spam, history, export passed')
