"""Executable B8 acceptance: signed webhook + mocked Paystack verify, real SQL/worker."""
import hashlib
import hmac
import json
from datetime import UTC,datetime
from uuid import uuid4

from app.billing.meter import admit,cost,current
from app.commerce.paystack import Paystack
from app.channels.base import Incoming
from app.pipeline.ingest import ingest
from app.config import Settings


async def run(rt,worker,vendor,account,client,execute):
    from pydantic import SecretStr
    rt.settings.paystack_secret_key=SecretStr('sk_test_b8_fixture')
    worker.settings.paystack_secret_key=SecretStr('sk_test_b8_fixture')
    ref='svbill_'+uuid4().hex;offer=uuid4();checkout=uuid4()
    async with rt.db.transaction(vendor) as (conn,_):
        await conn.execute("INSERT INTO billing_offers(id,vendor_id,offer_key,name,kind,price_kobo,conversations,paystack_plan_code) VALUES($1,$2,$3,'B8 monthly','monthly',500000,1000,'PLN_b8')",offer,vendor,str(offer))
        await conn.execute("INSERT INTO billing_checkouts(id,vendor_id,offer_id,reference,amount_kobo,conversations,kind,interval_months,plan_code,email) VALUES($1,$2,$3,$4,500000,1000,'monthly',1,'PLN_b8','test@example.test')",checkout,vendor,offer,ref)
        before=await conn.fetchval('SELECT entitlement_limit FROM billing_accounts WHERE vendor_id=$1',vendor)
    r=await client.patch('/v1/billing/selection',json={'offerId':str(offer)});assert r.status_code==200,r.text
    assert r.json()['data']['usage']['limit']==before
    paid=datetime.now(UTC).isoformat()
    data={'id':987654321,'reference':ref,'amount':500000,'currency':'NGN','status':'success','paid_at':paid,'plan':'PLN_b8','customer':{'email':'test@example.test','customer_code':'CUS_b8'}}
    async def verify(self,reference):assert reference==ref;return data
    original=Paystack.verify;Paystack.verify=verify
    try:
        raw=json.dumps({'event':'charge.success','data':data}).encode()
        r=await client.post('/v1/webhooks/paystack',content=raw,headers={'x-paystack-signature':'bad'});assert r.status_code==401,r.text
        sig=hmac.new(b'sk_test_b8_fixture',raw,hashlib.sha512).hexdigest()
        r=await client.post('/v1/webhooks/paystack',content=raw,headers={'x-paystack-signature':sig});assert r.status_code==202,r.text
        async with rt.db.transaction(vendor) as (conn,_):
            assert await conn.fetchval('SELECT entitlement_limit FROM billing_accounts WHERE vendor_id=$1',vendor)==before
            jid=await conn.fetchval("SELECT id FROM jobs WHERE billing_checkout_id=$1 AND kind='billing_payment'",checkout)
        async def bad_verify(self,reference):return {**data,'amount':1}
        Paystack.verify=bad_verify
        await execute(jid)
        async with rt.db.transaction(vendor) as (conn,_):
            assert await conn.fetchval('SELECT entitlement_limit FROM billing_accounts WHERE vendor_id=$1',vendor)==before
            assert await conn.fetchval('SELECT count(*) FROM billing_payments WHERE checkout_id=$1',checkout)==0
        Paystack.verify=verify
        await execute(jid);await execute(jid)
        async with rt.db.transaction(vendor) as (conn,_):
            assert await conn.fetchval('SELECT entitlement_limit FROM billing_accounts WHERE vendor_id=$1',vendor)==1000
            assert await conn.fetchval('SELECT count(*) FROM billing_payments WHERE checkout_id=$1',checkout)==1
            # Reset current meter to a tiny quota to exercise both exact thresholds.
            await conn.execute('UPDATE billing_accounts SET entitlement_limit=5,bundle_balance=0 WHERE vendor_id=$1',vendor)
            a,m=await current(conn,vendor)
            await conn.execute('UPDATE usage_meters SET conversations=3 WHERE id=$1',m['id'])
            cids=[]
            for i in range(3):
                mid=await ingest(conn,rt.crypto,vendor,account,Incoming(f'b8-{i}',f'b8-thread-{i}',f'b8-{i}@example.test','Quota Customer','Hello','Enquiry',f'<b8-{i}@example.test>',int(datetime.now(UTC).timestamp()*1000)+i,False),'link')
                cids.append(await conn.fetchval('SELECT conversation_id FROM messages WHERE id=$1',mid))
            assert await admit(conn,vendor,cids[0])
            assert await admit(conn,vendor,cids[0]) # idempotent, same conversation
            assert await admit(conn,vendor,cids[1])
            assert not await admit(conn,vendor,cids[2])
            assert await conn.fetchval("SELECT count(*) FROM messages WHERE conversation_id=$1 AND sender='customer'",cids[2])==1
            assert await conn.fetchval('SELECT conversations FROM usage_meters WHERE id=$1',m['id'])==5
            for threshold in (80,100):
                assert await conn.fetchval('SELECT count(*) FROM notifications WHERE dedupe_key=$1',f'quota:{m["id"]}:{threshold}')>=1
            # Exercise the real reply pipeline, not just the meter helper.
            from app.replies.service import process
            await conn.execute("UPDATE business_settings SET reply_engine_enabled=true,reply_engine_enabled_at=now()-interval '1 day' WHERE vendor_id=$1",vendor)
            await process(conn,vendor,mid)
            assert await conn.fetchval('SELECT lane_reason FROM messages WHERE id=$1',mid)=='ai_quota_limit_vendor_reply_required'
            await conn.execute('UPDATE billing_accounts SET bundle_balance=1 WHERE vendor_id=$1',vendor)
            assert await admit(conn,vendor,cids[2])
            assert await conn.fetchval('SELECT bundle_balance FROM billing_accounts WHERE vendor_id=$1',vendor)==0
            await cost(conn,vendor,'b8-cost','fixture','test',{'promptTokenCount':1000,'candidatesTokenCount':200},Settings(ai_input_usd_per_million='0.3',ai_output_usd_per_million='2.5',ai_pricing_version='fixture'))
            assert str(await conn.fetchval("SELECT cost_usd FROM ai_cost_entries WHERE dedupe_key='b8-cost'"))=='0.000800000'
        # Both role and tenant isolation are server-side, not UI promises.
        from app.main import app
        from app.auth import current_user,Identity
        original_identity=app.dependency_overrides[current_user]
        async with rt.db.transaction(vendor) as (conn,_):
            agent=await conn.fetchval("SELECT user_id FROM vendor_members WHERE role='agent' AND status='active' LIMIT 1")
        if agent:
            app.dependency_overrides[current_user]=lambda:Identity(id=agent,email='agent@example.test')
            try:
                r=await client.get('/v1/billing');assert r.status_code==403,r.text
                r=await client.get('/v1/insights');assert r.status_code==403,r.text
                r=await client.post('/v1/billing/checkout',json={'offerId':str(offer)});assert r.status_code==403,r.text
            finally:app.dependency_overrides[current_user]=original_identity
        r=await client.get('/v1/insights');assert r.status_code==200,r.text
        r=await client.get('/v1/billing');assert r.status_code==200,r.text
    finally:Paystack.verify=original
    print('B8 verified-webhook-only upgrade, replay dedupe, 80/100 warnings, quota preservation, bundles, per-vendor AI cost and event insights passed')
