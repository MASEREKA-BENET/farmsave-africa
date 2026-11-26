-- Reference catalogue only: no test accounts, fabricated impact or published guidance.
insert into countries(id,name,code) values('10000000-0000-0000-0000-000000000001','Uganda','UG') on conflict do nothing;
insert into regions(id,country_id,name) values('10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Western Region') on conflict do nothing;
insert into districts(id,region_id,name) values('10000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000002','Kasese') on conflict do nothing;
insert into crop_categories(id,name) values
 ('20000000-0000-0000-0000-000000000001','Vegetables'),('20000000-0000-0000-0000-000000000002','Fruits'),
 ('20000000-0000-0000-0000-000000000003','Cereals'),('20000000-0000-0000-0000-000000000004','Legumes'),
 ('20000000-0000-0000-0000-000000000005','Roots and tubers'),('20000000-0000-0000-0000-000000000006','Other agricultural crops') on conflict do nothing;
insert into crops(id,category_id,name,units) values
 ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Tomato',array['kg','crate']),
 ('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','Mango',array['kg','crate']),
 ('30000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000003','Maize',array['kg','bag']),
 ('30000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000004','Beans',array['kg','bag']),
 ('30000000-0000-0000-0000-000000000005','20000000-0000-0000-0000-000000000005','Cassava',array['kg']),
 ('30000000-0000-0000-0000-000000000006','20000000-0000-0000-0000-000000000006','Coffee',array['kg']) on conflict do nothing;
