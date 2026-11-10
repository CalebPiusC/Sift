-- LOCAL TEST DATA ONLY. Do not run against a production Supabase project.
insert into auth.users(id,email) values
 ('11111111-1111-4111-8111-111111111111','tola@example.test'),
 ('22222222-2222-4222-8222-222222222222','amina@example.test');
do $$
declare n integer;v uuid;u uuid;c uuid;ch uuid;conv uuid;m uuid;p uuid;pv uuid;o uuid;
begin
 for n in 1..2 loop
 u:=case when n=1 then '11111111-1111-4111-8111-111111111111'::uuid else '22222222-2222-4222-8222-222222222222'::uuid end;
 v:=case when n=1 then 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid else 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid end;
 insert into public.vendors(id,vendor_id,business_name,business_type,tone) values(v,v,case when n=1 then 'Adire by Tola' else 'Amina’s Studio' end,'products','Pidgin-friendly');
 insert into public.vendor_members(vendor_id,user_id,role) values(v,u,'owner');
 insert into public.customers(vendor_id,display_name,language) values(v,case when n=1 then 'Chidinma Okafor' else 'Musa Bello' end,'en') returning id into c;
 insert into public.channel_accounts(vendor_id,channel,external_account_id,display_name) values(v,'whatsapp','local-fixture-'||n,'Business WhatsApp') returning id into ch;
 insert into public.conversations(vendor_id,customer_id,channel_account_id) values(v,c,ch) returning id into conv;
 insert into public.messages(vendor_id,conversation_id,sender,content) values(v,conv,'customer',case when n=1 then 'Abeg, the indigo adire still dey? How much delivery to Lekki?' else 'Hello! Is the linen set available for delivery to Abuja?' end) returning id into m;
 insert into public.products(vendor_id,name,description,price_kobo,lowest_price_kobo,stock_count) values(v,'Indigo Adire Set','Hand-dyed in Lagos',2500000,2200000,12) returning id into p;
 insert into public.product_variants(vendor_id,product_id,name,price_kobo,stock_count) values(v,p,'Indigo / Medium',2500000,5) returning id into pv;
 insert into public.orders(vendor_id,customer_id,total_kobo,delivery_fee_kobo,delivery_city,payment_status,payment_source) values(v,c,case when n=1 then 2750000 else 3000000 end,case when n=1 then 250000 else 500000 end,case when n=1 then 'Lagos — Lekki' else 'Abuja — Wuse' end,'paid','vendor') returning id into o;
 insert into public.order_items(vendor_id,order_id,product_id,variant_id,quantity,unit_price_kobo) values(v,o,p,pv,1,2500000);
 insert into public.receipts(vendor_id,order_id,receipt_number,snapshot,total_kobo) values(v,o,1,'{"fixture":true}',case when n=1 then 2750000 else 3000000 end);
 insert into public.approvals(vendor_id,conversation_id,message_id,customer_message,facts,proposed_reply,reason) values(v,conv,m,'Can I pay ₦20,000?','{"list_price_kobo":2500000,"lowest_price_kobo":2200000}','Thank you! Let me confirm with the team.','discount_below_floor');
 insert into public.audit_log(vendor_id,actor_id,action,entity_type,entity_id) values(v,u,'vendor.created','vendor',v);
 end loop;
end $$;
