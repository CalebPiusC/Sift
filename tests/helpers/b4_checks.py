import asyncio
import hashlib
import hmac
import json
from uuid import UUID,uuid4

from pydantic import SecretStr

from app.commerce import domain,paystack


async def run(rt,worker,vendor,account,cid,client,execute,fake):
    rt.settings.paystack_secret_key=SecretStr('sk_test_local_fake_boundary_only')
    rt.settings.public_web_url='https://shop.example.test'
    async with rt.db.transaction(vendor) as (conn,_):
        await conn.execute("INSERT INTO products(vendor_id,name,price_kobo,lowest_price_kobo,stock_count) VALUES($1,'Order sandal',1500000,1200000,5)",vendor)
    async def incoming(text):
        async with rt.db.transaction(vendor) as (conn,_):
            mid=await conn.fetchval("INSERT INTO messages(vendor_id,conversation_id,sender,content) VALUES($1,$2,'customer',$3) RETURNING id",vendor,cid,text)
            jid=await conn.fetchval("SELECT id FROM jobs WHERE kind='reply' AND message_id=$1",mid)
        await execute(jid)
        async with rt.db.transaction(vendor) as (conn,_):
            assert await conn.fetchval('SELECT status FROM jobs WHERE id=$1',jid)=='succeeded'
        return mid
    await incoming('I want to buy Order sandal please')
    async with rt.db.transaction(vendor) as (conn,_):
        o=await conn.fetchrow("SELECT * FROM orders WHERE conversation_id=$1 AND status='draft'",cid)
        assert o and o['payment_review']=='DETAILS_REQUIRED'
    await incoming('2 units please; address: 12 Allen Avenue, Lagos')
    await incoming('confirm order')
    async with rt.db.transaction(vendor) as (conn,_):
        o=await conn.fetchrow('SELECT * FROM orders WHERE id=$1',o['id'])
        assert o['status']=='awaiting_payment'
        assert o['total_kobo']==3000000+10000
        assert await conn.fetchval("SELECT sum(quantity) FROM stock_reservations WHERE order_id=$1 AND status='active'",o['id'])==2
        checkout=await conn.fetchval("SELECT id FROM jobs WHERE order_id=$1 AND kind='checkout'",o['id'])
    original=paystack.Paystack.request
    verified={}
    async def provider(self,method,path,**kwargs):
        if path=='/transaction/initialize':
            request=kwargs['json'];assert request['amount']==3010000 and request['currency']=='NGN'
            verified.update(status='success',reference=request['reference'],amount=request['amount'],currency='NGN')
            return {'reference':request['reference'],'authorization_url':'https://checkout.paystack.com/local-test-only'}
        if path.startswith('/transaction/verify/'):return dict(verified)
        if path=='/refund':
            assert kwargs['json']['transaction']==verified['reference'] and kwargs['json']['amount']==3010000
            return {'id':9001,'status':'pending'}
        raise AssertionError('Unexpected provider call')
    paystack.Paystack.request=provider
    try:
        await execute(checkout)
        async with rt.db.transaction(vendor) as (conn,_):
            o=await conn.fetchrow('SELECT * FROM orders WHERE id=$1',o['id']);assert o['payment_link']
        async def push(event):
            raw=json.dumps(event,separators=(',',':')).encode()
            sig=hmac.new(rt.settings.paystack_secret_key.get_secret_value().encode(),raw,hashlib.sha512).hexdigest()
            return await client.post('/v1/webhooks/paystack',content=raw,headers={'x-paystack-signature':sig,'Content-Type':'application/json'})
        event={'event':'charge.success','data':{**verified,'id':1001}}
        bad=await client.post('/v1/webhooks/paystack',json=event,headers={'x-paystack-signature':'bad'});assert bad.status_code==401
        # Correct signature but mismatched amount cannot mark paid.
        mismatch={'event':'charge.success','data':{**verified,'id':1000,'amount':1}}
        r=await push(mismatch);assert r.status_code==202,r.text
        async with rt.db.transaction(vendor) as (conn,_):mj=await conn.fetchval("SELECT id FROM jobs WHERE dedupe_key='charge.success:1000' AND vendor_id=$1",vendor)
        await execute(mj)
        async with rt.db.transaction(vendor) as (conn,_):
            assert await conn.fetchval('SELECT payment_status FROM orders WHERE id=$1',o['id'])=='unpaid'
        r=await push(event);assert r.status_code==202,r.text
        r=await push(event);assert r.status_code==202
        async with rt.db.transaction(vendor) as (conn,_):
            jobs=await conn.fetch("SELECT id FROM jobs WHERE dedupe_key='charge.success:1001' AND vendor_id=$1",vendor)
            assert len(jobs)==1
        await execute(jobs[0]['id']);await execute(jobs[0]['id'])
        async with rt.db.transaction(vendor) as (conn,_):
            paid=await conn.fetchrow('SELECT * FROM orders WHERE id=$1',o['id'])
            assert paid['status']=='paid' and paid['payment_source']=='paystack'
            assert await conn.fetchval("SELECT stock_count FROM products WHERE vendor_id=$1 AND name='Order sandal'",vendor)==3
            assert await conn.fetchval('SELECT count(*) FROM payments WHERE order_id=$1',o['id'])==1
            receipt=await conn.fetchrow('SELECT * FROM receipts WHERE order_id=$1',o['id'])
            assert receipt
        r=await client.get(f"/v1/receipts/{receipt['id']}");assert r.status_code==200,r.text
        receipt_dto=r.json()['data'];assert receipt_dto['totalKobo']==3010000
        token=receipt_dto['shareUrl'].split('#token=')[1]
        r=await client.post('/v1/public/receipts',json={'token':token});assert r.status_code==200,r.text
        r=await client.post('/v1/public/receipts',json={'token':token+'x'});assert r.status_code==404
        r=await client.post(f"/v1/receipts/{receipt['id']}/revoke");assert r.status_code==200,r.text
        r=await client.post('/v1/public/receipts',json={'token':token});assert r.status_code==404
        # Status changes are legal only through the seven-state graph and repeat safely.
        r=await client.patch(f"/v1/orders/{o['id']}/status",json={'status':'delivered','expectedRevision':paid['revision']});assert r.status_code==409,r.text
        r=await client.patch(f"/v1/orders/{o['id']}/status",json={'status':'preparing','expectedRevision':paid['revision']});assert r.status_code==200,r.text
        r=await client.patch(f"/v1/orders/{o['id']}/status",json={'status':'preparing','expectedRevision':paid['revision']});assert r.status_code==200,r.text
        # Send a current order notification through the real worker + verifier to fake Gmail.
        async with rt.db.transaction(vendor) as (conn,_):
            nj=await conn.fetchval("SELECT id FROM jobs WHERE order_id=$1 AND kind='order_message' ORDER BY created_at DESC LIMIT 1",o['id'])
        await execute(nj)
        async with rt.db.transaction(vendor) as (conn,_):sj=await conn.fetchval("SELECT j.id FROM jobs j JOIN messages m ON m.id=j.message_id WHERE m.commerce_context->>'notice_job'=$1",str(nj))
        count=fake.sends;await execute(sj);assert fake.sends==count+1
        r=await client.get(f"/v1/orders/{o['id']}");current=r.json()['data']
        r=await client.patch(f"/v1/orders/{o['id']}/status",json={'status':'cancelled','expectedRevision':current['revision']});assert r.status_code==200,r.text
        async with rt.db.transaction(vendor) as (conn,_):
            assert await conn.fetchval("SELECT stock_count FROM products WHERE vendor_id=$1 AND name='Order sandal'",vendor)==3
            assert not await conn.fetchval('SELECT refund_requested_at FROM orders WHERE id=$1',o['id'])
        # A Paystack refund is requested ONLY after explicit confirmed vendor choice.
        r=await client.post(f"/v1/orders/{o['id']}/cancellation-actions",json={'refund':True,'restock':False,'confirmed':True});assert r.status_code==200,r.text
        async with rt.db.transaction(vendor) as (conn,_):refund_job=await conn.fetchval("SELECT id FROM jobs WHERE order_id=$1 AND kind='refund'",o['id'])
        await execute(refund_job);await execute(refund_job)
        async with rt.db.transaction(vendor) as (conn,_):
            assert await conn.fetchval('SELECT refund_status FROM orders WHERE id=$1',o['id'])=='pending'
            assert await conn.fetchval("SELECT stock_count FROM products WHERE vendor_id=$1 AND name='Order sandal'",vendor)==3
        # Concurrent late bank confirmations compete for the last variant unit.
        async with rt.db.transaction(vendor) as (conn,_):
            product=await conn.fetchval("INSERT INTO products(vendor_id,name,price_kobo,lowest_price_kobo,stock_count) VALUES($1,'Race shoe',100000,100000,5) RETURNING id",vendor)
            variant=await conn.fetchval("INSERT INTO product_variants(vendor_id,product_id,name,price_kobo,stock_count) VALUES($1,$2,'Medium',100000,1) RETURNING id",vendor,product)
            ids=[]
            for _ in range(2):
                oid=await conn.fetchval("INSERT INTO orders(vendor_id,customer_id,conversation_id,total_kobo,delivery_address,delivery_city) SELECT $1,customer_id,id,100000,'12 Allen Avenue','Lagos' FROM conversations WHERE id=$2 RETURNING id",vendor,cid)
                await conn.execute("INSERT INTO order_items(vendor_id,order_id,product_id,variant_id,quantity,unit_price_kobo,name_snapshot) VALUES($1,$2,$3,$4,1,100000,'Race shoe')",vendor,oid,product,variant)
                await conn.execute("UPDATE orders SET status='awaiting_payment' WHERE id=$1",oid)
                ids.append(oid)
        async def bank(oid):
            r=await client.get(f'/v1/orders/{oid}');revision=r.json()['data']['revision']
            r=await client.post(f'/v1/orders/{oid}/payment-confirmation',json={'expectedRevision':revision});assert r.status_code==200,r.text
            return await client.post(f'/v1/orders/{oid}/payment',json={'source':'vendor','expectedRevision':revision,'confirmed':True,'confirmationToken':r.json()['data']['confirmationToken']})
        outcomes=await asyncio.gather(*(bank(oid) for oid in ids))
        assert sorted(r.status_code for r in outcomes)==[200,409],[r.text for r in outcomes]
        winner=next(UUID(r.json()['data']['id']) for r in outcomes if r.status_code==200)
        async with rt.db.transaction(vendor) as (conn,_):
            assert await conn.fetchval('SELECT stock_count FROM product_variants WHERE id=$1',variant)==0
            assert await conn.fetchval("SELECT count(*) FROM stock_movements WHERE variant_id=$1 AND reason='sale'",variant)==1
            assert await conn.fetchval('SELECT count(*) FROM receipts WHERE order_id=ANY($1::uuid[])',ids)==1
        r=await client.get(f'/v1/orders/{winner}');revision=r.json()['data']['revision']
        r=await client.patch(f'/v1/orders/{winner}/status',json={'status':'cancelled','expectedRevision':revision});assert r.status_code==200
        r=await client.post(f'/v1/orders/{winner}/cancellation-actions',json={'refund':True,'restock':True,'confirmed':True});assert r.status_code==200,r.text
        r=await client.post(f'/v1/orders/{winner}/cancellation-actions',json={'refund':True,'restock':True,'confirmed':True});assert r.status_code==200,r.text
        async with rt.db.transaction(vendor) as (conn,_):
            assert await conn.fetchval('SELECT stock_count FROM product_variants WHERE id=$1',variant)==1
            assert await conn.fetchval("SELECT count(*) FROM stock_movements WHERE variant_id=$1 AND reason='restock'",variant)==1
            assert await conn.fetchval('SELECT refund_status FROM orders WHERE id=$1',winner)=='requested'
            nums=[r['receipt_number'] for r in await conn.fetch('SELECT receipt_number FROM receipts WHERE vendor_id=$1 ORDER BY receipt_number',vendor)]
            assert nums==list(range(1,len(nums)+1))
        # Receipt contents never follow mutable catalogue names, and cannot be edited.
        async with rt.db.transaction(vendor) as (conn,_):
            old_snapshot=await conn.fetchval('SELECT snapshot FROM receipts WHERE id=$1',receipt['id'])
            await conn.execute("UPDATE products SET name='Renamed after sale' WHERE id=$1",UUID(receipt_dto['items'][0]['productId']))
            assert await conn.fetchval('SELECT snapshot FROM receipts WHERE id=$1',receipt['id'])==old_snapshot
            try:
                async with conn.transaction():await conn.execute("UPDATE receipts SET total_kobo=1 WHERE id=$1",receipt['id'])
                raise AssertionError('Receipt mutation was allowed')
            except Exception as error:
                if isinstance(error,AssertionError):raise
                assert getattr(error,'sqlstate',None)=='42501'
        r=await client.get(f"/v1/receipts/{receipt['id']}");assert r.json()['data']['items'][0]['name']=='Order sandal',r.text
        # Real concurrent reservation race, then SQL-backed scheduler expiry releases it.
        async with rt.db.transaction(vendor) as (conn,_):
            last=await conn.fetchval("INSERT INTO products(vendor_id,name,price_kobo,lowest_price_kobo,stock_count) VALUES($1,'Reservation last item',100000,100000,1) RETURNING id",vendor)
            drafts=[]
            for _ in range(2):
                oid=await conn.fetchval("INSERT INTO orders(vendor_id,customer_id,conversation_id,total_kobo,delivery_fee_kobo,delivery_address,delivery_city) SELECT $1,customer_id,id,110000,10000,'12 Allen Avenue','Lagos' FROM conversations WHERE id=$2 RETURNING id",vendor,cid)
                await conn.execute("INSERT INTO order_items(vendor_id,order_id,product_id,quantity,unit_price_kobo,name_snapshot) VALUES($1,$2,$3,1,100000,'Reservation last item')",vendor,oid,last)
                revision=await conn.fetchval('SELECT revision FROM orders WHERE id=$1',oid)
                drafts.append((oid,revision))
        results=await asyncio.gather(*(client.patch(f'/v1/orders/{oid}/status',json={'status':'awaiting_payment','expectedRevision':rev}) for oid,rev in drafts))
        assert sorted(r.status_code for r in results)==[200,409],[r.text for r in results]
        reserved=UUID(next(r.json()['data']['id'] for r in results if r.status_code==200))
        async with rt.db.transaction(vendor) as (conn,_):
            await conn.execute("UPDATE stock_reservations SET expires_at=now()+interval '0.3 seconds' WHERE order_id=$1",reserved)
            await conn.execute("UPDATE orders SET reservation_expires_at=now()+interval '0.3 seconds' WHERE id=$1",reserved)
            expiry=await conn.fetchval("SELECT id FROM jobs WHERE order_id=$1 AND kind='reservation_expiry' ORDER BY run_at LIMIT 1",reserved)
            assert expiry
        await asyncio.sleep(0.4)
        await execute(expiry)
        async with rt.db.transaction(vendor) as (conn,_):
            assert await conn.fetchval("SELECT count(*) FROM stock_reservations WHERE order_id=$1 AND status='active'",reserved)==0
            assert await conn.fetchval('SELECT stock_count FROM products WHERE id=$1',last)==1
            assert await conn.fetchval('SELECT payment_review FROM orders WHERE id=$1',reserved)=='RESERVATION_EXPIRED'
        print('B4 chat draft -> simulated Paystack -> immutable signed/revocable receipt; duplicate/mismatched webhooks, lifecycle and variant last-item race passed')
    finally:paystack.Paystack.request=original
