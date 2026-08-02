-- Manual pharmacy dispensary email seeding — populated as Patrick looks up
-- each pharmacy on Healthpoint's public directory. Run this against Supabase
-- when the batch is ready (via SQL editor in the Supabase dashboard, or via
-- psql with the SUPABASE_DB_URL connection string).
--
-- Matching key is pharmacy_id (Medsafe slug from pharmacies.json). Upsert
-- semantics via ON CONFLICT — safe to re-run, safe to append new rows in
-- future batches.
--
-- Source: individual human lookups on healthpoint.co.nz — the same act any
-- prescriber or pharmacy admin performs day-to-day.

INSERT INTO pharmacy_contacts
  (pharmacy_id, premises_name, dispensary_email, updated_at, contributed_by)
VALUES
  -- ── Northland ─────────────────────────────────────────────────────────
  ('unichem-kerikeri-pharmacy-northland',
   'Unichem Kerikeri Pharmacy',
   'dispensary@unichemkerikeri.co.nz',
   NOW(), NULL),

  ('unichem-whangarei-pharmacy-northland',
   'Unichem Whangarei Pharmacy',
   'Whangareipharmacy@totem.nz',
   NOW(), NULL),

  -- Buchanan's Pharmacy Limited operates 3 Whangarei stores. Two have
  -- confirmed per-store dispensary emails; the third (Paramount Plaza) is
  -- populated with the corporate admin@ inbox until a store-specific email
  -- is confirmed.
  ('unichem-buchanan-s-pharmacy-northland',
   'Unichem Buchanan''s Pharmacy',
   'admin@buchananspharmacy.co.nz',
   NOW(), NULL),

  ('unichem-buchanans-kiripaka-pharmacy-northland',
   'Unichem Buchanans Kiripaka Pharmacy',
   'kiripaka@buchananspharmacy.co.nz',
   NOW(), NULL),

  ('unichem-buchanans-mansfield-pharmacy-northland',
   'Unichem Buchanans Mansfield Pharmacy',
   'mansfield@buchananspharmacy.co.nz',
   NOW(), NULL),

  ('kaeo-chemist-limited-northland',
   'Kaeo Chemist Limited',
   'kaeochemist@xtra.co.nz',
   NOW(), NULL),

  ('rust-avenue-pharmacy-northland',
   'Rust Avenue Pharmacy',
   'rustpharmacy@gmail.com',
   NOW(), NULL),

  ('maunu-pharmacy-ltd-northland',
   'Maunu Pharmacy Ltd',
   'rx@maunupharmacy.co.nz',
   NOW(), NULL),

  ('david-s-pharmacy-northland',
   'David''s Pharmacy',
   'dispensary@davidspharmacy.co.nz',
   NOW(), NULL),

  ('mangawhai-pharmacy-northland',
   'Mangawhai Pharmacy',
   'mangawhaipharmacy@gmail.com',
   NOW(), NULL),

  ('unichem-orrs-pharmacy-dargaville-northland',
   'Unichem Orrs Pharmacy Dargaville',
   'orrsdargdisp@gmail.com',
   NOW(), NULL),

  ('unichem-orrs-pharmacy-kaikohe-northland',
   'Unichem Orrs Pharmacy Kaikohe',
   'Kaikoherepeats@orrs.co.nz',
   NOW(), NULL),

  ('orrs-kowhai-pharmacy-northland',
   'Orrs Kowhai Pharmacy',
   'kowhai@orrs.co.nz',
   NOW(), NULL),

  ('waipapa-unichem-pharmacy-northland',
   'Waipapa Unichem Pharmacy',
   'waipapa@unichemkerikeri.co.nz',
   NOW(), NULL),

  ('unichem-orrs-pharmacy-tui-northland',
   'Unichem Orrs Pharmacy Tui',
   'tui@orrs.co.nz',
   NOW(), NULL),

  ('unichem-kamo-pharmacy-northland',
   'Unichem Kamo Pharmacy',
   'rx@kamopharmacy.nz',
   NOW(), NULL),

  -- Brown's Community Pharmacy (Medsafe name) trades under kaitaiapharmacy.co.nz
  ('brown-s-community-pharmacy-northland',
   'Brown''s Community Pharmacy',
   'Disp@kaitaiapharmacy.co.nz',
   NOW(), NULL),

  -- Woolworths Pharmacy Whangarei — pattern confirmed: {storename}.pharmacy@woolworths.co.nz
  ('woolworths-pharmacy-whangarei-northland',
   'Woolworths Pharmacy Whangarei',
   'whangarei.pharmacy@woolworths.co.nz',
   NOW(), NULL),

  ('te-hiku-pharmacy-northland',
   'Te Hiku Pharmacy',
   'disp@hauorapharmacy.net.nz',
   NOW(), NULL),

  ('unichem-kerimed-pharmacy-northland',
   'Unichem Kerimed Pharmacy',
   'kmed@unichemkerikeri.co.nz',
   NOW(), NULL),

  ('kensington-pharmacy-northland',
   'Kensington Pharmacy',
   'rx@kenpharm.co.nz',
   NOW(), NULL),

  ('unichem-kamo-dispensary-northland',
   'Unichem Kamo Dispensary',
   'rxdisp@kamopharmacy.nz',
   NOW(), NULL),

  ('orrs-unichem-pharmacy-ruakaka-northland',
   'Orrs Unichem Pharmacy Ruakaka',
   'rxruakaka@orrs.co.nz',
   NOW(), NULL),

  ('waipu-pharmacy-northland',
   'Waipu Pharmacy',
   'waipupharmacy@xtra.co.nz',
   NOW(), NULL),

  ('paihia-pharmacy-northland',
   'Paihia Pharmacy',
   'paihiapharmacy@xtra.co.nz',
   NOW(), NULL),

  ('otaika-pharmacy-northland',
   'Otaika Pharmacy',
   'Office@otaikapharmacy.co.nz',
   NOW(), NULL),

  ('unichem-onerahi-pharmacy-northland',
   'Unichem Onerahi Pharmacy',
   'dispensary.onerahi@unichem.co.nz',
   NOW(), NULL),

  ('far-north-pharmacy-northland',
   'Far North Pharmacy',
   'dispensary@farnorthpharmacy.co.nz',
   NOW(), NULL),

  ('unichem-orrs-pharmacy-maungaturoto-northland',
   'Unichem Orrs Pharmacy Maungaturoto',
   'maungadisp@orrs.co.nz',
   NOW(), NULL),

  ('marsden-cove-pharmacy-northland',
   'Marsden Cove Pharmacy',
   'dispensary@mcpharmacy.co.nz',
   NOW(), NULL),

  -- Chemist Warehouse uses per-store emails ({storename}N@chemistwarehouse.co.nz)
  -- so dispensary.online@ was a separate online-orders channel, not the master.
  ('chemist-warehouse-okara-park-northland',
   'Chemist Warehouse Okara Park',
   'okarapark2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('kawakawa-pharmacy-northland',
   'Kawakawa Pharmacy',
   'disp@kawapharm.co.nz',
   NOW(), NULL),

  ('doubtless-bay-pharmacy-northland',
   'Doubtless Bay Pharmacy',
   'dispensary@dbpharm.co.nz',
   NOW(), NULL),

  -- ── Auckland ──────────────────────────────────────────────────────────
  ('zoom-pharmacy-auckland',
   'Zoom Pharmacy',
   'script@zoompharmacy.co.nz',
   NOW(), NULL),

  ('silverdale-clinic-pharmacy-waitemat',
   'Silverdale Clinic Pharmacy',
   'silverdaleclinicpharmacy@totem.nz',
   NOW(), NULL),

  ('unichem-dennis-hanna-pharmacy-waitemat',
   'Unichem Dennis Hanna Pharmacy',
   'unichemdennishanna@gmail.com',
   NOW(), NULL),

  ('coast-care-pharmacy-waitemat',
   'Coast Care Pharmacy',
   'dispensary@coastcarepharmacy.co.nz',
   NOW(), NULL),

  ('birkdale-pharmacy-1998-limited-waitemat',
   'Birkdale Pharmacy 1998 Limited',
   'prescriptions@birkdalepharmacy.co.nz',
   NOW(), NULL),

  ('unichem-weiti-pharmacy-waitemat',
   'Unichem Weiti Pharmacy',
   'weiti@unichem.co.nz',
   NOW(), NULL),

  ('chemist-warehouse-birkenhead-waitemat',
   'Chemist Warehouse Birkenhead',
   'birkenhead2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('library-lane-pharmacy-waitemat',
   'Library Lane Pharmacy',
   'librarylanepharmacy@gmail.com',
   NOW(), NULL),

  ('medplus-pharmacy-waitemat',
   'Medplus Pharmacy',
   'rx.medpluspharmacy@gmail.com',
   NOW(), NULL),

  ('birkenhead-7-day-pharmacy-waitemat',
   'Birkenhead 7 Day Pharmacy',
   'birkenhead7daypharmacy@gmail.com',
   NOW(), NULL),

  ('chemist-warehouse-whangaparaoa-waitemat',
   'Chemist Warehouse Whangaparaoa',
   'whangaparaoa2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('unichem-mairangi-bay-pharmacy-waitemat',
   'Unichem Mairangi Bay Pharmacy',
   'unichem.mairangibay@gmail.com',
   NOW(), NULL),

  ('unichem-browns-bay-pharmacy-waitemat',
   'Unichem Browns Bay Pharmacy',
   'browns.bay@unichem.co.nz',
   NOW(), NULL),

  ('pharmacy-on-shakespeare-waitemat',
   'Pharmacy on Shakespeare',
   'pharmacyonshakespeare@gmail.com',
   NOW(), NULL),

  ('unichem-northern-clinic-pharmacy-waitemat',
   'Unichem Northern Clinic Pharmacy',
   'dispensary@pharmacyservices.co.nz',
   NOW(), NULL),

  ('hillcrest-central-pharmacy-waitemat',
   'Hillcrest Central Pharmacy',
   'hillcrestcentralpharmacy@gmail.com',
   NOW(), NULL),

  -- Life Pharmacy uses per-store {location}.dispensary@lifepharmacy.co.nz
  ('life-pharmacy-birkenhead-waitemat',
   'Life Pharmacy Birkenhead',
   'birkenhead.dispensary@lifepharmacy.co.nz',
   NOW(), NULL),

  ('bargain-chemist-whangaparaoa-waitemat',
   'Bargain Chemist Whangaparaoa',
   'whangaparaoa@bargainchemist.co.nz',
   NOW(), NULL),

  -- Second Woolworths confirmation of {location}.pharmacy@woolworths.co.nz pattern
  ('woolworths-pharmacy-takapuna-waitemat',
   'Woolworths Pharmacy Takapuna',
   'takapuna.pharmacy@woolworths.co.nz',
   NOW(), NULL),

  -- Address discrepancy: Healthpoint lists 106 Sunnynook Rd; Medsafe register has
  -- 120-126 Sunnynook Rd for Unichem Sunnynook Pharmacy. Same pharmacy — the
  -- email {brand}@unichem.co.nz confirms.
  ('unichem-sunnynook-pharmacy-waitemat',
   'Unichem Sunnynook Pharmacy',
   'sunnynook@unichem.co.nz',
   NOW(), NULL),

  ('northcare-7-day-pharmacy-waitemat',
   'Northcare 7 Day Pharmacy',
   'pharmacy@northcare7day.co.nz',
   NOW(), NULL),

  ('compoundlabs-waitemat',
   'CompoundLabs',
   'rx@compoundlabs.co.nz',
   NOW(), NULL),

  ('unichem-warkworth-pharmacy-waitemat',
   'Unichem Warkworth Pharmacy',
   'warkworthpharmacy@totem.nz',
   NOW(), NULL),

  ('unichem-red-beach-pharmacy-waitemat',
   'Unichem Red Beach Pharmacy',
   'pharmacy@redbeachpharmacy.co.nz',
   NOW(), NULL),

  ('unichem-fred-thomas-pharmacy-waitemat',
   'Unichem Fred Thomas Pharmacy',
   'dispensary.fredthomas@unichem.co.nz',
   NOW(), NULL),

  ('devonport-1st-pharmacy-waitemat',
   'Devonport 1st Pharmacy',
   'devonport1stpharmacy@gmail.com',
   NOW(), NULL),

  ('pharmacy-direct-waitemat',
   'Pharmacy Direct',
   'pharmacist@pharmacydirect.co.nz',
   NOW(), NULL),

  ('life-pharmacy-albany-waitemat',
   'Life Pharmacy Albany',
   'albany.dispensary@lifepharmacy.co.nz',
   NOW(), NULL),

  ('unichem-whangaparaoa-family-pharmacy-waitemat',
   'Unichem Whangaparaoa Family Pharmacy',
   'dispensary@wfpl.co.nz',
   NOW(), NULL),

  ('te-puna-hauora-pharmacy-waitemat',
   'Te Puna Hauora Pharmacy',
   'tepunapharmacy@dispensaryplus.co.nz',
   NOW(), NULL),

  ('dispensary-plus-pharmacy-birkenhead-waitemat',
   'Dispensary Plus Pharmacy Birkenhead',
   'birkenheadpluspharmacy@gmail.com',
   NOW(), NULL),

  ('matakana-pharmacy-waitemat',
   'Matakana Pharmacy',
   'rx.matakana@gmail.com',
   NOW(), NULL),

  ('unichem-torbay-pharmacy-waitemat',
   'Unichem Torbay Pharmacy',
   'info@torbaypharmacy.co.nz',
   NOW(), NULL),

  ('milford-nutritional-pharmacy-waitemat',
   'Milford Nutritional Pharmacy',
   'tatripharmacy@gmail.com',
   NOW(), NULL),

  ('life-pharmacy-milford-waitemat',
   'Life Pharmacy Milford',
   'prescriptions@milfordpharmacy.co.nz',
   NOW(), NULL),

  ('chemist-warehouse-milford-waitemat',
   'Chemist Warehouse Milford',
   'milford2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('guardian-pharmacy-long-bay-waitemat',
   'Guardian Pharmacy Long Bay',
   'longbay@guardianpharmacy.co.nz',
   NOW(), NULL),

  ('unichem-manly-pharmacy-waitemat',
   'Unichem Manly Pharmacy',
   'prescriptions@unichemmanly.co.nz',
   NOW(), NULL),

  ('healthcare-pharmacy-rosedale-waitemat',
   'Healthcare Pharmacy Rosedale',
   'FTBHealthcare@gmail.com',
   NOW(), NULL),

  -- Third confirmation of {location}.pharmacy@woolworths.co.nz pattern
  ('woolworths-pharmacy-browns-bay-waitemat',
   'Woolworths Pharmacy Browns Bay',
   'brownsbay.pharmacy@woolworths.co.nz',
   NOW(), NULL),

  ('devonport-7-day-helen-scott-pharmacy-waitemat',
   'Devonport 7 Day & Helen Scott Pharmacy',
   'devonport7day@gmail.com',
   NOW(), NULL),

  ('shorecare-pharmacy-waitemat',
   'Shorecare Pharmacy',
   'pharmacyshorecare@gmail.com',
   NOW(), NULL),

  ('bargain-chemist-pinehill-waitemat',
   'Bargain Chemist Pinehill',
   'pinehill@bargainchemist.co.nz',
   NOW(), NULL),

  ('sunnynook-link-pharmacy-waitemat',
   'Sunnynook Link Pharmacy',
   'rx@linkpharmacy.co.nz',
   NOW(), NULL),

  ('unichem-rosedale-pharmacy-waitemat',
   'Unichem Rosedale Pharmacy',
   'rosedalepharmacynz@gmail.com',
   NOW(), NULL),

  ('unichem-rangatira-pharmacy-waitemat',
   'Unichem Rangatira Pharmacy',
   'rangatira2@gmail.com',
   NOW(), NULL),

  ('chemist-warehouse-browns-bay-waitemat',
   'Chemist Warehouse Browns Bay',
   'brownsbay2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('unichem-milford-pharmacy-waitemat',
   'Unichem Milford Pharmacy',
   'disp@unichemmilford.co.nz',
   NOW(), NULL),

  ('takapuna-pharmacy-waitemat',
   'Takapuna Pharmacy',
   'info@takapunapharmacyndl.co.nz',
   NOW(), NULL),

  ('millwater-parkway-pharmacy-waitemat',
   'Millwater Parkway Pharmacy',
   'millwaterdispensary@gmail.com',
   NOW(), NULL),

  ('northcote-family-pharmacy-auckland',
   'Northcote Family Pharmacy',
   'danpharmacy@xtra.co.nz',
   NOW(), NULL),

  ('takapuna-beach-pharmacy-auckland',
   'Takapuna Beach Pharmacy',
   'script@takapunabeachpharmacy.co.nz',
   NOW(), NULL),

  ('snells-beach-pharmacy-waitemat',
   'Snells Beach Pharmacy',
   'rx.snells@gmail.com',
   NOW(), NULL),

  ('bentley-ave-pharmacy-limited-waitemat',
   'Bentley Ave Pharmacy Limited',
   'bentley_ave_pharmacy@live.com',
   NOW(), NULL),

  ('hart-s-pharmacy-waitemat',
   'Hart''s Pharmacy',
   'leehartdisp@gmail.com',
   NOW(), NULL),

  ('chemist-warehouse-glenfield-mall-waitemat',
   'Chemist Warehouse Glenfield Mall',
   'glenfieldmall2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('life-pharmacy-orewa-waitemat',
   'Life Pharmacy Orewa',
   'dispensary@lifepharmacyorewa.co.nz',
   NOW(), NULL),

  ('chemist-warehouse-silverdale-waitemat',
   'Chemist Warehouse Silverdale',
   'silverdale2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('woolworths-pharmacy-silverdale-waitemat',
   'Woolworths Pharmacy Silverdale',
   'silverdale.pharmacy@woolworths.co.nz',
   NOW(), NULL),

  ('devonport-health-centre-pharmacy-waitemat',
   'Devonport Health Centre Pharmacy',
   'devonporthealthpharmacy@gmail.com',
   NOW(), NULL),

  ('guardian-pharmacy-stanmore-bay-waitemat',
   'Guardian Pharmacy Stanmore Bay',
   'stanmorebay@guardianpharmacy.co.nz',
   NOW(), NULL),

  ('life-pharmacy-franklin-s-waitemat',
   'Life Pharmacy Franklin''s',
   'dispensary@franklinspharmacy.co.nz',
   NOW(), NULL),

  ('forrest-hill-family-pharmacy-waitemat',
   'Forrest Hill Family Pharmacy',
   'forresthillpharmacy@gmail.com',
   NOW(), NULL),

  ('lab-pharmacy-waitemat',
   'LAB Pharmacy',
   'info@labpharmacy.co.nz',
   NOW(), NULL),

  ('pilldrop-pharmacy-auckland',
   'PillDrop Pharmacy',
   'delivery@pilldrop.co.nz',
   NOW(), NULL),

  ('life-pharmacy-takapuna-waitemat',
   'Life Pharmacy Takapuna',
   'takapuna@lifepharmacy.co.nz',
   NOW(), NULL),

  ('windsor-medical-pharmacy-waitemat',
   'Windsor Medical Pharmacy',
   'windsordispensary@gmail.com',
   NOW(), NULL),

  ('unichem-greenhithe-pharmacy-waitemat',
   'Unichem Greenhithe Pharmacy',
   'disp@unichemgreenhithe.co.nz',
   NOW(), NULL),

  ('chemist-warehouse-wairau-valley-auckland',
   'Chemist Warehouse Wairau Valley',
   'wairauvalley2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('northcross-pharmacy-auckland',
   'Northcross Pharmacy',
   'scripts@northcrosspharmacy.co.nz',
   NOW(), NULL),

  ('belmont-pharmacy-waitemat',
   'Belmont Pharmacy',
   'team@belmontpharmacy.co.nz',
   NOW(), NULL),

  ('chemist-warehouse-albany-waitemat',
   'Chemist Warehouse Albany',
   'albany2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('unichem-hickey-s-pharmacy-waitemat',
   'Unichem Hickey''s Pharmacy',
   'dispensary@hickeyspharmacy.co.nz',
   NOW(), NULL),

  ('north-harbour-pharmacy-waitemat',
   'North Harbour Pharmacy',
   'northharbour.pharmacy@gmail.com',
   NOW(), NULL),

  ('unichem-silverdale-pharmacy-waitemat',
   'Unichem Silverdale Pharmacy',
   'silverdalepharmacy@totem.nz',
   NOW(), NULL),

  ('bays-health-pharmacy-waitemat',
   'Bays Health Pharmacy',
   'dispensary@bayshealthpharmacy.co.nz',
   NOW(), NULL),

  ('woolworths-pharmacy-greville-road-waitemat',
   'Woolworths Pharmacy Greville Road',
   'grevillerd.pharmacy@woolworths.co.nz',
   NOW(), NULL),

  ('chemist-warehouse-warkworth-waitemat',
   'Chemist Warehouse Warkworth',
   'warkworth2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('commodore-pharmacy-waitemat',
   'Commodore Pharmacy',
   'service@healthchemist.co.nz',
   NOW(), NULL),

  ('glenfield-7-day-pharmacy-waitemat',
   'Glenfield 7 Day Pharmacy',
   'pharmacy@glenfield7day.co.nz',
   NOW(), NULL),

  ('wellsford-pharmacy-auckland',
   'Wellsford Pharmacy',
   'rx@wellsfordpharmacy.co.nz',
   NOW(), NULL),

  -- gxh.co.nz is Green Cross Health corporate — per-store internal routing.
  -- Suggests {store}.pharmacy@gxh.co.nz may be a valid pattern for other GXH
  -- stores (Life Pharmacy, Unichem) though most stores publish store-branded
  -- addresses instead.
  ('unichem-apollo-drive-pharmacy-waitemat',
   'Unichem Apollo Drive Pharmacy',
   'apollo.pharmacy@gxh.co.nz',
   NOW(), NULL),

  -- ── Nelson / Marlborough ──────────────────────────────────────────────
  ('hurst-taylor-unichem-pharmacy-nelson-marlborough',
   'Hurst & Taylor Unichem Pharmacy',
   'scripts@hurstandtaylorpharmacy.co.nz',
   NOW(), NULL),

  ('bay-pharmacy-motueka-nelson-marlborough',
   'Bay Pharmacy Motueka',
   'meds@baypharmacy.co.nz',
   NOW(), NULL),

  ('wairau-pharmacy-nelson-marlborough',
   'Wairau Pharmacy',
   'wairaupharmacy@xtra.co.nz',
   NOW(), NULL),

  ('unichem-springlands-pharmacy-nelson-marlborough',
   'Unichem Springlands Pharmacy',
   'rxspringlands@unichem.co.nz',
   NOW(), NULL),

  ('omaka-landing-pharmacy-nelson-marlborough',
   'Omaka Landing Pharmacy',
   'dispensary@omakapharmacy.co.nz',
   NOW(), NULL),

  ('unichem-motueka-pharmacy-nelson-marlborough',
   'Unichem Motueka Pharmacy',
   'unichemmotueka@gmail.com',
   NOW(), NULL),

  ('medical-centre-pharmacy-nelson-marlborough',
   'Medical Centre Pharmacy',
   'health@medcentrepharmacy.co.nz',
   NOW(), NULL),

  ('golden-bay-pharmacy-nelson-marlborough',
   'Golden Bay Pharmacy',
   'takakapharmacy@gmail.com',
   NOW(), NULL),

  ('unichem-richmond-mall-pharmacy-nelson-marlborough',
   'Unichem Richmond Mall Pharmacy',
   'rx@richmondpharmacy.co.nz',
   NOW(), NULL),

  ('queen-street-pharmacy-nelson-marlborough',
   'Queen Street Pharmacy',
   'pharmacy@queenstreet.nz',
   NOW(), NULL),

  ('fry-s-pharmacy-nelson-marlborough',
   'Fry''s Pharmacy',
   'prescriptions@fryspharmacy.co.nz',
   NOW(), NULL),

  ('mcglashen-pharmacy-nelson-marlborough',
   'McGlashen Pharmacy',
   'prescriptions@mcglashenpharmacy.co.nz',
   NOW(), NULL),

  ('life-pharmacy-blenheim-nelson-marlborough',
   'Life Pharmacy Blenheim',
   'blenheim@lifepharmacy.co.nz',
   NOW(), NULL),

  ('collingwood-street-pharmacy-nelson-marlborough',
   'Collingwood Street Pharmacy',
   'pharmacy@132.co.nz',
   NOW(), NULL),

  ('chemist-warehouse-springlands-nelson-marlborough',
   'Chemist Warehouse Springlands',
   'springlands2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('community-care-pharmacy-nelson-marlborough',
   'Community Care Pharmacy',
   'scripts@communitycarepharmacy.co.nz',
   NOW(), NULL),

  ('wakefield-pharmacy-nelson-marlborough',
   'Wakefield Pharmacy',
   'prescriptions@wakefieldpharmacy.co.nz',
   NOW(), NULL),

  ('life-pharmacy-nelson-city-nelson-marlborough',
   'Life Pharmacy Nelson City',
   'lifepharmacynelsoncity@gmail.com',
   NOW(), NULL),

  ('chemist-warehouse-nelson-junction-nelson-marlborough',
   'Chemist Warehouse Nelson Junction',
   'nelson.junction2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('mapua-pharmacy-nelson-marlborough',
   'Mapua Pharmacy',
   'pharmacymapua@xtra.co.nz',
   NOW(), NULL),

  ('tahunanui-pharmacy-nelson-marlborough',
   'Tahunanui Pharmacy',
   'medicines@tahunanuipharmacy.co.nz',
   NOW(), NULL),

  ('life-pharmacy-motueka-nelson-marlborough',
   'Life Pharmacy Motueka',
   'scripts@lifepharmacymotueka.co.nz',
   NOW(), NULL),

  ('greenwood-st-pharmacy-nelson-marlborough',
   'Greenwood St Pharmacy',
   'greenwoodstphy@gmail.com',
   NOW(), NULL),

  ('unichem-redwoodtown-pharmacy-nelson-marlborough',
   'Unichem Redwoodtown Pharmacy',
   'prescriptions.redwoodtownphy@gmail.com',
   NOW(), NULL),

  ('victory-square-pharmacy-nelson-marlborough',
   'Victory Square Pharmacy',
   'victory.scripts@xtra.co.nz',
   NOW(), NULL),

  ('civic-health-pharmacy-nelson-marlborough',
   'Civic Health Pharmacy',
   'health@civichealthpharmacy.co.nz',
   NOW(), NULL),

  ('picton-healthcare-pharmacy-nelson-marlborough',
   'Picton Healthcare Pharmacy',
   'pharmacy@pictonhealthcare.co.nz',
   NOW(), NULL),

  ('life-pharmacy-prices-nelson-marlborough',
   'Life Pharmacy Prices',
   'prescriptions.prices@lifepharmacy.co.nz',
   NOW(), NULL),

  ('john-s-stoke-pharmacy-nelson-marlborough',
   'John''s Stoke Pharmacy',
   'stoke@hardystpharmacy.nz',
   NOW(), NULL),

  -- ── West Coast ────────────────────────────────────────────────────────
  ('westland-pharmacy-2010-limited-west-coast',
   'Westland Pharmacy (2010) Limited',
   'dispensary@westlandpharmacy.co.nz',
   NOW(), NULL),

  ('buller-pharmacy-west-coast',
   'Buller Pharmacy',
   'dispensary@bullerpharmacy.co.nz',
   NOW(), NULL),

  -- Address discrepancy between Healthpoint and Medsafe register — same brand
  -- (Faywells Ltd) so likely a recent relocation. Matched by brand name.
  ('unichem-olsen-s-pharmacy-west-coast',
   'Unichem Olsen''s Pharmacy',
   'scriptstown@olsenspharmacy.co.nz',
   NOW(), NULL),

  ('unichem-te-nikau-pharmacy-west-coast',
   'Unichem Te Nikau Pharmacy',
   'tenikauscripts@olsenspharmacy.co.nz',
   NOW(), NULL),

  -- ── Canterbury ────────────────────────────────────────────────────────
  ('vitahub-pharmacy-faringdon-canterbury',
   'Vitahub Pharmacy Faringdon',
   'rxfaringdon@vitahubpharmacy.co.nz',
   NOW(), NULL),

  ('unichem-parkside-pharmacy-canterbury',
   'Unichem Parkside Pharmacy',
   'dispensary@parksidepharmacy.co.nz',
   NOW(), NULL),

  ('stay-well-pharmacy-canterbury',
   'Stay Well Pharmacy',
   'fax@staywellpharmacy.co.nz',
   NOW(), NULL),

  ('methven-pharmacy-canterbury',
   'Methven Pharmacy',
   'dispensary@methvenpharmacy.co.nz',
   NOW(), NULL),

  ('bargain-chemist-shirley-canterbury',
   'Bargain Chemist Shirley',
   'shirley@bargainchemist.com',
   NOW(), NULL),

  ('hoon-hay-pharmacy-canterbury',
   'Hoon Hay Pharmacy',
   'hoonhayrx@gmail.com',
   NOW(), NULL),

  ('shirley-dispensary-canterbury',
   'Shirley Dispensary',
   'prescriptions@shirleydispensary.co.nz',
   NOW(), NULL),

  ('kaiapoi-crossing-pharmacy-canterbury',
   'Kaiapoi Crossing Pharmacy',
   'rx@crossingpharmacy.co.nz',
   NOW(), NULL),

  ('addington-pharmacy-canterbury',
   'Addington Pharmacy',
   'addingtonpharmacy@gmail.com',
   NOW(), NULL),

  ('unichem-parklands-pharmacy-canterbury',
   'Unichem Parklands Pharmacy',
   'parklands@unichem.co.nz',
   NOW(), NULL),

  ('remedy-pharmacy-st-albans-canterbury',
   'Remedy Pharmacy - St Albans',
   'staff.remedystalbans@gmail.com',
   NOW(), NULL),

  ('life-pharmacy-hornby-canterbury',
   'Life Pharmacy Hornby',
   'hornbymallpharmacy.disp@gmail.com',
   NOW(), NULL),

  ('bargain-chemist-rolleston-canterbury',
   'Bargain Chemist Rolleston',
   'rolleston@bargainchemist.co.nz',
   NOW(), NULL),

  ('unichem-forte-pharmacy-canterbury',
   'Unichem Forte Pharmacy',
   'dispensary@fortepharmacy.co.nz',
   NOW(), NULL),

  ('bastins-community-pharmacy-canterbury',
   'Bastins Community Pharmacy',
   'bastins@community-pharmacy.co.nz',
   NOW(), NULL),

  ('redwood-pharmacy-2021-limited-canterbury',
   'Redwood Pharmacy (2021) Limited',
   'redwoodpharmacyprescriptions@gmail.com',
   NOW(), NULL),

  ('alabasters-pharmacy-canterbury',
   'Alabasters Pharmacy',
   'alabasterspharmacy@gmail.com',
   NOW(), NULL),

  ('beckford-health-pharmacy-canterbury',
   'Beckford Health Pharmacy',
   'beckfordhealthpharmacy@gmail.com',
   NOW(), NULL),

  ('pharmacy-now-canterbury',
   'Pharmacy Now',
   'pharmacynownz@gmail.com',
   NOW(), NULL),

  ('netherby-pharmacy-canterbury',
   'Netherby Pharmacy',
   'netherbypharmacy@xtra.co.nz',
   NOW(), NULL),

  ('unichem-riccarton-clinic-pharmacy-canterbury',
   'Unichem Riccarton Clinic Pharmacy',
   'rx.riccartonclinic@unichem.co.nz',
   NOW(), NULL),

  ('fendalton-mall-pharmacy-canterbury',
   'Fendalton Mall Pharmacy',
   'dispensary@fendaltonpharmacy.co.nz',
   NOW(), NULL),

  ('unichem-rolleston-central-pharmacy-canterbury',
   'Unichem Rolleston Central Pharmacy',
   'dispensary@rollestoncentral.co.nz',
   NOW(), NULL),

  ('unichem-eastern-pharmacy-canterbury',
   'Unichem Eastern Pharmacy',
   'aranui@easternpharmacy.co.nz',
   NOW(), NULL),

  ('life-pharmacy-ashburton-canterbury',
   'Life Pharmacy Ashburton',
   'techs@lifeashburton.co.nz',
   NOW(), NULL),

  ('the-pharmacy-phillipstown-canterbury',
   'The Pharmacy @ Phillipstown',
   'thepharmacyphillipstown@gmail.com',
   NOW(), NULL),

  ('unichem-stantons-pharmacy-canterbury',
   'Unichem Stantons Pharmacy',
   'rx@unichemstantons.nz',
   NOW(), NULL),

  ('merivale-medical-pharmacy-canterbury',
   'Merivale Medical Pharmacy',
   'mmpharmacy@xtra.co.nz',
   NOW(), NULL),

  ('unichem-bealey-ave-pharmacy-canterbury',
   'Unichem Bealey Ave Pharmacy',
   'unichembealeyave@xtra.co.nz',
   NOW(), NULL),

  ('chemist-warehouse-rolleston-canterbury',
   'Chemist Warehouse Rolleston',
   'rolleston2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('akaroa-pharmacy-canterbury',
   'Akaroa Pharmacy',
   'akaroapharmacyscripts@gmail.com',
   NOW(), NULL),

  ('pharmacy-ferrymead-canterbury',
   'Pharmacy @ Ferrymead',
   'grant@ferrymeadpharmacy.co.nz',
   NOW(), NULL),

  ('woolworths-pharmacy-ferrymead-canterbury',
   'Woolworths Pharmacy Ferrymead',
   'ferrymead.pharmacy@woolworths.co.nz',
   NOW(), NULL),

  ('life-pharmacy-merivale-canterbury',
   'Life Pharmacy Merivale',
   'dispensary.merivale@lifepharmacy.co.nz',
   NOW(), NULL),

  ('unichem-medical-corner-pharmacy-canterbury',
   'Unichem Medical Corner Pharmacy',
   'Rx@umcpharmacy.co.nz',
   NOW(), NULL),

  ('chemist-warehouse-south-city-shopping-centre-canterbury',
   'Chemist Warehouse South City Shopping Centre',
   'southcitysc2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('woolworths-pharmacy-eastgate-canterbury',
   'Woolworths Pharmacy Eastgate',
   'eastgate.pharmacy@woolworths.co.nz',
   NOW(), NULL),

  ('hillmorton-pharmacy-2009-limited-canterbury',
   'Hillmorton Pharmacy 2009 Limited',
   'rx.hillmortonpharmacy@gmail.com',
   NOW(), NULL),

  ('qe-11-pharmacy-limited-canterbury',
   'QE 11 Pharmacy Limited',
   'qe2pharmacyfax@gmail.com',
   NOW(), NULL),

  ('selwyn-community-pharmacy-canterbury',
   'Selwyn Community Pharmacy',
   'rx@scpharmacy.co.nz',
   NOW(), NULL),

  ('life-pharmacy-northlands-canterbury',
   'Life Pharmacy Northlands',
   'dispensary.northlands@lifepharmacy.co.nz',
   NOW(), NULL),

  ('chemist-warehouse-waimakariri-junction-canterbury',
   'Chemist Warehouse Waimakariri Junction',
   'waimak.junction2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('kiwi-pharmacy-highsted-canterbury',
   'Kiwi Pharmacy Highsted',
   'highsted@pharmacykiwi.co.nz',
   NOW(), NULL),

  ('rangiora-pharmacy-southern',
   'Rangiora Pharmacy',
   'dispensary.rangiorapharmacy@gmail.com',
   NOW(), NULL),

  ('bargain-chemist-northwood-canterbury',
   'Bargain Chemist Northwood',
   'northwood@bargainchemist.co.nz',
   NOW(), NULL),

  ('silverstream-kaiapoi-pharmacy-canterbury',
   'Silverstream Kaiapoi Pharmacy',
   'Silverstream@thepharmacy.co.nz',
   NOW(), NULL),

  ('sumner-pharmacy-canterbury',
   'Sumner Pharmacy',
   'info@sumnerpharmacy.co.nz',
   NOW(), NULL),

  ('leeston-pharmacy-canterbury',
   'Leeston Pharmacy',
   'leeston.pharmacy@xtra.co.nz',
   NOW(), NULL),

  ('woodham-road-pharmacy-canterbury',
   'Woodham Road Pharmacy',
   'dispensary@woodhamroadpharmacy.co.nz',
   NOW(), NULL),

  ('barrington-medical-centre-pharmacy-canterbury',
   'Barrington Medical Centre Pharmacy',
   'scripts@bmcp.nz',
   NOW(), NULL),

  ('ilam-pharmacy-canterbury',
   'Ilam Pharmacy',
   'ilampharmacydispensary@xtra.co.nz',
   NOW(), NULL),

  ('unichem-brighton-village-pharmacy-canterbury',
   'Unichem Brighton Village Pharmacy',
   'dispensary@unichembrighton.co.nz',
   NOW(), NULL),

  ('we-care-pharmacy-canterbury',
   'We Care Pharmacy',
   'wecarepharmacylincoln@gmail.com',
   NOW(), NULL),

  ('unichem-union-street-pharmacy-canterbury',
   'Unichem Union Street Pharmacy',
   'rx.unionstreet@stellarpg.nz',
   NOW(), NULL),

  ('st-albans-pharmacy-canterbury',
   'St Albans Pharmacy',
   'scripts@stalbanspharmacy.co.nz',
   NOW(), NULL),

  ('christchurch-south-pharmacy-canterbury',
   'Christchurch South Pharmacy',
   'scripts@christchurchsouthpharmacy.co.nz',
   NOW(), NULL),

  ('hanafins-pharmacy-canterbury',
   'Hanafins Pharmacy',
   'pharmacy@hanafinspharmacy.nz',
   NOW(), NULL),

  ('unichem-prestons-pharmacy-canterbury',
   'Unichem Prestons Pharmacy',
   'pharmacy@unichemprestons.co.nz',
   NOW(), NULL),

  ('bargain-chemist-papanui-canterbury',
   'Bargain Chemist Papanui',
   'papanui@bargainchemist.co.nz',
   NOW(), NULL),

  ('university-pharmacy-canterbury-canterbury',
   'University Pharmacy Canterbury',
   'manager@unipharmacycanterbury.co.nz',
   NOW(), NULL),

  ('burwood-pharmacy-canterbury',
   'Burwood Pharmacy',
   'burwoodpharmacyparnwell@gmail.com',
   NOW(), NULL),

  ('unichem-parklands-medical-pharmacy-canterbury',
   'Unichem Parklands Medical Pharmacy',
   'parklands.medical@unichem.co.nz',
   NOW(), NULL),

  ('unichem-eastgate-pharmacy-canterbury',
   'Unichem Eastgate Pharmacy',
   'eastgatepharmacy@gmail.com',
   NOW(), NULL),

  ('amberley-pharmacy-canterbury',
   'Amberley Pharmacy',
   'amberley.dispensary@gmail.com',
   NOW(), NULL),

  ('unichem-bishopdale-pharmacy-canterbury',
   'Unichem Bishopdale Pharmacy',
   'pharmacists@bishopdale.co.nz',
   NOW(), NULL),

  ('woolston-pharmacy-limited-canterbury',
   'Woolston Pharmacy Limited',
   'woolstonpharmacy@gmail.com',
   NOW(), NULL),

  ('life-pharmacy-barrington-canterbury',
   'Life Pharmacy Barrington',
   'scripts@lifepharmacybarrington.co.nz',
   NOW(), NULL),

  ('eastfield-pharmacy-canterbury',
   'Eastfield Pharmacy',
   'scripts@eastfieldpharmacy.nz',
   NOW(), NULL),

  ('unichem-cashel-pharmacy-canterbury',
   'Unichem Cashel Pharmacy',
   'dispensary@cashelpharmacy.co.nz',
   NOW(), NULL),

  ('woolworths-pharmacy-the-palms-canterbury',
   'Woolworths Pharmacy The Palms',
   'thepalms.pharmacy@woolworths.co.nz',
   NOW(), NULL),

  ('remedy-pharmacy-st-george-s-canterbury',
   'Remedy Pharmacy St George''s',
   'staff.remedystgeorges@gmail.com',
   NOW(), NULL),

  ('community-pharmacy-linwood-canterbury',
   'Community Pharmacy Linwood',
   'linwood@communitypharmacy.co.nz',
   NOW(), NULL),

  ('chemist-warehouse-blenheim-square-canterbury',
   'Chemist Warehouse Blenheim Square',
   'blenheimsquare2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('searles-allenton-pharmacy-canterbury',
   'Searles Allenton Pharmacy',
   'dispensary@allentonpharmacy.co.nz',
   NOW(), NULL),

  ('prebbleton-pharmacy-canterbury',
   'Prebbleton Pharmacy',
   'rx@prebbletonpharmacy.nz',
   NOW(), NULL),

  ('parkside-pharmacy-on-oxford-terrace-canterbury',
   'Parkside Pharmacy on Oxford Terrace',
   'resthome@parksidepharmacy.co.nz',
   NOW(), NULL),

  ('chemist-warehouse-northwood-canterbury',
   'Chemist Warehouse Northwood',
   'northwood2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('unichem-lincoln-road-pharmacy-canterbury',
   'Unichem Lincoln Road Pharmacy',
   'rx@unichemlincolnroad.co.nz',
   NOW(), NULL),

  ('bargain-chemist-rangiora-canterbury',
   'Bargain Chemist Rangiora',
   'rangiora@bargainchemist.co.nz',
   NOW(), NULL),

  ('kaiapoi-north-pharmacy-canterbury',
   'Kaiapoi North Pharmacy',
   'rx@kaiapoipharmacy.co.nz',
   NOW(), NULL),

  ('three-rivers-pharmacy-canterbury',
   'Three Rivers Pharmacy',
   'threerivers@allentonpharmacy.co.nz',
   NOW(), NULL),

  ('woolworths-pharmacy-church-corner-canterbury',
   'Woolworths Pharmacy Church Corner',
   'churchcorner.pharmacy@woolworths.co.nz',
   NOW(), NULL),

  ('remedy-pharmacy-riccarton-canterbury',
   'Remedy Pharmacy - Riccarton',
   'staff.remedyriccarton@gmail.com',
   NOW(), NULL),

  ('kendal-pharmacy-canterbury',
   'Kendal Pharmacy',
   'health@kendalpharmacy.co.nz',
   NOW(), NULL),

  ('waltham-pharmacy-canterbury',
   'Waltham Pharmacy',
   'walthamprescriptions@gmail.com',
   NOW(), NULL),

  ('avonhead-pharmacy-2001-limited-canterbury',
   'Avonhead Pharmacy (2001) Limited',
   'rx@avonheadpharm.co.nz',
   NOW(), NULL),

  ('pegasus-pharmacy-canterbury',
   'Pegasus Pharmacy',
   'pegasus.dispensary@gmail.com',
   NOW(), NULL),

  ('hei-hei-pharmacy-canterbury',
   'Hei Hei Pharmacy',
   'heiheipharmacy@gmail.com',
   NOW(), NULL),

  ('stan-s-7-day-pharmacy-rangiora-canterbury',
   'Stan''s 7 Day Pharmacy Rangiora',
   'stans7daypharmacy@gmail.com',
   NOW(), NULL),

  ('ewart-douglas-bryndwr-pharmacy-canterbury',
   'Ewart Douglas Bryndwr Pharmacy',
   'pharmacist@ewartdouglas.co.nz',
   NOW(), NULL),

  ('chemist-warehouse-ashburton-canterbury',
   'Chemist Warehouse Ashburton',
   'ashburton2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('north-avon-pharmacy-canterbury',
   'North Avon Pharmacy',
   'northavon.pharmacy@gmail.com',
   NOW(), NULL),

  ('bargain-chemist-tower-junction-canterbury',
   'Bargain Chemist Tower Junction',
   'towerjunction@bargainchemist.co.nz',
   NOW(), NULL),

  ('marshlands-family-pharmacy-canterbury',
   'Marshlands Family Pharmacy',
   'dispensary@marshlandspharmacy.co.nz',
   NOW(), NULL),

  ('life-pharmacy-riccarton-canterbury',
   'Life Pharmacy Riccarton',
   'dispensary.riccarton@lifepharmacy.co.nz',
   NOW(), NULL),

  ('longhurst-pharmacy-canterbury',
   'Longhurst Pharmacy',
   'longhurst.pharmacy@outlook.co.nz',
   NOW(), NULL),

  ('woolworths-pharmacy-belfast-canterbury',
   'Woolworths Pharmacy Belfast',
   'belfast.pharmacy@woolworths.co.nz',
   NOW(), NULL),

  ('chemist-warehouse-hornby-canterbury',
   'Chemist Warehouse Hornby',
   'hornby2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('lincoln-pharmacy-canterbury',
   'Lincoln Pharmacy',
   'disp@lincolnpharmacy.co.nz',
   NOW(), NULL),

  ('unichem-belfast-pharmacy-canterbury',
   'Unichem Belfast Pharmacy',
   'dispensary.belfastpharmacy@gmail.com',
   NOW(), NULL),

  ('lyttelton-pharmacy-post-centre-canterbury',
   'Lyttelton Pharmacy & Post Centre',
   'Lytteltonprescription@gmail.com',
   NOW(), NULL),

  ('woolworths-pharmacy-hornby-canterbury',
   'Woolworths Pharmacy Hornby',
   'hornby.pharmacy@woolworths.co.nz',
   NOW(), NULL),

  ('st-martins-pharmacy-canterbury',
   'St Martins Pharmacy',
   'stmprescriptions@gmail.com',
   NOW(), NULL),

  ('woolworths-pharmacy-northlands-canterbury',
   'Woolworths Pharmacy Northlands',
   'northlands.pharmacy@woolworths.co.nz',
   NOW(), NULL),

  ('woolworths-pharmacy-rolleston-canterbury',
   'Woolworths Pharmacy Rolleston',
   'rolleston.pharmacy@woolworths.co.nz',
   NOW(), NULL),

  ('hammersley-pharmacy-canterbury',
   'Hammersley Pharmacy',
   'hammersleypharm@gmail.com',
   NOW(), NULL),

  ('redcliffs-pharmacy-canterbury',
   'Redcliffs Pharmacy',
   'dispensary@redcliffspharmacy.co.nz',
   NOW(), NULL),

  ('cranford-pharmacy-canterbury',
   'Cranford Pharmacy',
   'info@cranfordpharmacy.co.nz',
   NOW(), NULL),

  ('cashmere-pharmacy-canterbury',
   'Cashmere Pharmacy',
   'dispensary@cashmerepharmacy.co.nz',
   NOW(), NULL),

  ('selwyn-village-pharmacy-canterbury',
   'Selwyn Village Pharmacy',
   'selwynvillagepharmacy@gmail.com',
   NOW(), NULL),

  ('linwood-village-pharmacy-canterbury',
   'Linwood Village Pharmacy',
   'linwood@barnettspharmacy.co.nz',
   NOW(), NULL),

  ('oxford-pharmacy-canterbury',
   'Oxford Pharmacy',
   'rx@oxpharm.co.nz',
   NOW(), NULL),

  ('unichem-west-melton-pharmacy-canterbury',
   'Unichem West Melton Pharmacy',
   'dispensary@westmeltonpharmacy.co.nz',
   NOW(), NULL),

  ('woolworths-pharmacy-ashburton-south-south-canterbury',
   'Woolworths Pharmacy Ashburton South',
   'ashburton.pharmacy@woolworths.co.nz',
   NOW(), NULL),

  ('halswell-pharmacy-canterbury',
   'Halswell Pharmacy',
   'halswellpharmacy@gmail.com',
   NOW(), NULL),

  ('unichem-moorhouse-pharmacy-canterbury',
   'Unichem Moorhouse Pharmacy',
   'moorhouse@unichem.co.nz',
   NOW(), NULL),

  ('wises-community-pharmacy-canterbury',
   'Wises Community Pharmacy',
   'wises@community-pharmacy.co.nz',
   NOW(), NULL),

  ('unichem-spitfire-square-pharmacy-canterbury',
   'Unichem Spitfire Square Pharmacy',
   'rx@unichemspitfire.nz',
   NOW(), NULL),

  ('chemist-warehouse-westfield-riccarton-canterbury',
   'Chemist Warehouse Westfield Riccarton',
   'riccarton2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('bargain-chemist-hornby-canterbury',
   'Bargain Chemist Hornby',
   'hornby@bargainchemist.co.nz',
   NOW(), NULL),

  ('unichem-rolleston-village-pharmacy-canterbury',
   'Unichem Rolleston Village Pharmacy',
   'rx@unichemrollestonvillage.co.nz',
   NOW(), NULL),

  ('papanui-pharmacy-canterbury',
   'Papanui Pharmacy',
   'rx@papanuipharmacy.co.nz',
   NOW(), NULL),

  ('kaikoura-pharmacy-canterbury',
   'Kaikoura Pharmacy',
   'prescriptions@kaikourapharmacy.co.nz',
   NOW(), NULL),

  ('chemist-warehouse-papanui-canterbury',
   'Chemist Warehouse Papanui',
   'papanui2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('unichem-elmwood-pharmacy-canterbury',
   'Unichem Elmwood Pharmacy',
   'elmwood@community-pharmacy.co.nz',
   NOW(), NULL),

  ('bargain-chemist-eastgate-canterbury',
   'Bargain Chemist Eastgate',
   'eastgate@bargainchemist.co.nz',
   NOW(), NULL),

  ('chemist-warehouse-christchurch-city-centre-canterbury',
   'Chemist Warehouse Christchurch City Centre',
   'chchcitycentre2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('unichem-crisps-pharmacy-canterbury',
   'Unichem Crisps Pharmacy',
   'health@crispspharmacy.co.nz',
   NOW(), NULL),

  ('shields-pharmacy-limited-canterbury',
   'Shields Pharmacy Limited',
   'ask.us@shieldspharmacy.co.nz',
   NOW(), NULL),

  ('unichem-ravenswood-pharmacy-canterbury',
   'Unichem Ravenswood Pharmacy',
   'pharmacy@unichemravenswood.co.nz',
   NOW(), NULL),

  ('unichem-ilam-healthworks-pharma-x001a-y-canterbury',
   'Unichem Ilam Healthworks Pharmacy',
   'rx@healthworks.co.nz',
   NOW(), NULL),

  ('kiwi-pharmacy-yaldhurst-canterbury',
   'Kiwi Pharmacy Yaldhurst',
   'Pharmacist@pharmacykiwi.co.nz',
   NOW(), NULL),

  ('life-pharmacy-rangiora-canterbury',
   'Life Pharmacy Rangiora',
   'pharmacy@liferangiora.co.nz',
   NOW(), NULL),

  ('unichem-fenwicks-pharmacy-canterbury',
   'Unichem Fenwicks Pharmacy',
   'fenwick@pharmacy.unichem.co.nz',
   NOW(), NULL),

  ('unichem-wigram-pharmacy-canterbury',
   'Unichem Wigram Pharmacy',
   'prescriptions@unichemwigram.co.nz',
   NOW(), NULL),

  ('darfield-pharmacy-canterbury',
   'Darfield Pharmacy',
   'rx@darfieldpharmacy.co.nz',
   NOW(), NULL),

  ('chemist-warehouse-the-palms-canterbury',
   'Chemist Warehouse The Palms',
   'thepalms2@chemistwarehouse.co.nz',
   NOW(), NULL),

  -- ── South Canterbury ──────────────────────────────────────────────────
  ('mackenzie-pharmacy-south-canterbury',
   'Mackenzie Pharmacy',
   'staff.mackenziepharmacy@gmail.com',
   NOW(), NULL),

  ('roberts-pharmacy-south-canterbury',
   'Roberts Pharmacy',
   'prescriptions@robertspharmacy.co.nz',
   NOW(), NULL),

  ('geraldine-pharmacy-south-canterbury',
   'Geraldine Pharmacy',
   'geraldinepharmacy@gmail.com',
   NOW(), NULL),

  ('chemist-warehouse-timaru-showgrounds-south-canterbury',
   'Chemist Warehouse Timaru Showgrounds',
   'timarushowgrounds2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('waimate-pharmacy-south-canterbury',
   'Waimate Pharmacy',
   'waimate.rx@gmail.com',
   NOW(), NULL),

  ('moyle-s-pharmacy-south-canterbury',
   'Moyle''s Pharmacy',
   'scripts@moylespharmacy.co.nz',
   NOW(), NULL),

  ('marchwiel-pharmacy-south-canterbury',
   'Marchwiel Pharmacy',
   'marchwielpharmacy2005@gmail.com',
   NOW(), NULL),

  ('dee-street-pharmacy-south-canterbury',
   'Dee Street Pharmacy',
   'dee.street.pharmacy.scripts@gmail.com',
   NOW(), NULL),

  ('temuka-pharmacy-south-canterbury',
   'Temuka Pharmacy',
   'prescriptions@temukapharmacy.co.nz',
   NOW(), NULL),

  ('unichem-highfield-mall-south-canterbury',
   'Unichem Highfield Mall',
   'scripts@unichemhighfieldmall.co.nz',
   NOW(), NULL),

  -- ── Otago (Southern region in Medsafe) ────────────────────────────────
  ('oamaru-pharmacy-southern',
   'Oamaru Pharmacy',
   'dispoamaru@gmail.com',
   NOW(), NULL),

  ('unichem-north-end-pharmacy-southern',
   'Unichem North End Pharmacy',
   'northendscripts@xtra.co.nz',
   NOW(), NULL),

  ('north-otago-pharmacy-southern',
   'North Otago Pharmacy',
   'Nodispensary@xtra.co.nz',
   NOW(), NULL),

  ('waihemo-pharmacy-southern',
   'Waihemo Pharmacy',
   'waihemopharmacy@xtra.co.nz',
   NOW(), NULL),

  ('dunedin-city-pharmacy-limited-southern',
   'Dunedin City Pharmacy Limited',
   'dispensary@dcpharmacy.nz',
   NOW(), NULL),

  ('baylis-the-chemist-southern',
   'Baylis The Chemist',
   'admin@baylisthechemist.co.nz',
   NOW(), NULL),

  ('larson-s-pharmacy-southern',
   'Larson''s Pharmacy',
   'dispensary@larsonspharmacy.co.nz',
   NOW(), NULL),

  ('antidote-mornington-southern',
   'Antidote Mornington',
   'mornington@antidote.nz',
   NOW(), NULL),

  ('forbury-pharmacy-2004-limited-southern',
   'Forbury Pharmacy (2004) Limited',
   'forburypharmacy@gmail.com',
   NOW(), NULL),

  ('urgent-pharmacy-dunedin-southern',
   'Urgent Pharmacy Dunedin',
   'urgentdunedin@gmail.com',
   NOW(), NULL),

  ('waverley-pharmacy-southern',
   'Waverley Pharmacy',
   'waverleypharmacy@outlook.com',
   NOW(), NULL),

  ('albany-street-pharmacy-limited-southern',
   'Albany Street Pharmacy Limited',
   'scripts@albanyst.co.nz',
   NOW(), NULL),

  ('woolworths-pharmacy-dunedin-central-southern',
   'Woolworths Pharmacy Dunedin Central',
   'dunedincentral.pharmacy@woolworths.co.nz',
   NOW(), NULL),

  ('bargain-chemist-george-st-southern',
   'Bargain Chemist George St',
   'georgestreet@bargainchemist.com',
   NOW(), NULL),

  ('caversham-pharmacy-southern',
   'Caversham Pharmacy',
   'cavershampharmacy@xtra.co.nz',
   NOW(), NULL),

  ('antidote-north-southern',
   'Antidote North',
   'north@antidote.nz',
   NOW(), NULL),

  ('bates-pharmacy-southern',
   'Bates Pharmacy',
   'pharmacist@batespharmacy.co.nz',
   NOW(), NULL),

  ('unichem-taieri-pharmacy-southern',
   'Unichem Taieri Pharmacy',
   'tap@earthlight.co.nz',
   NOW(), NULL),

  ('bargain-chemist-south-dunedin-southern',
   'Bargain Chemist South Dunedin',
   'southdunedin@bargainchemist.co.nz',
   NOW(), NULL),

  ('antidote-octagon-southern',
   'Antidote Octagon',
   'octagon@antidote.nz',
   NOW(), NULL),

  ('roslyn-pharmacy-southern',
   'Roslyn Pharmacy',
   'info@roslynpharmacy.co.nz',
   NOW(), NULL),

  ('port-chalmers-pharmacy-southern',
   'Port Chalmers Pharmacy',
   'prescriptions@pcpharmacy.nz',
   NOW(), NULL),

  ('antidote-macandrew-southern',
   'Antidote Macandrew',
   'macandrew@antidote.nz',
   NOW(), NULL),

  ('chemist-warehouse-meridian-mall-southern',
   'Chemist Warehouse Meridian Mall',
   'meridianmall2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('balmac-pharmacy-2011-limited-southern',
   'Balmac Pharmacy 2011 Limited',
   'balmacpharmacy@outlook.com',
   NOW(), NULL),

  ('unichem-central-pharmacy-mosgiel-southern',
   'Unichem Central Pharmacy Mosgiel',
   'scripts@mosgielunichem.co.nz',
   NOW(), NULL),

  ('mosgiel-health-centre-pharmacy-limited-southern',
   'Mosgiel Health Centre Pharmacy Limited',
   'mhcp.retail@gmail.com',
   NOW(), NULL),

  ('anderson-s-exchange-pharmacy-southern',
   'Anderson''s Exchange Pharmacy',
   'rxandersons_pharmacy@hotmail.com',
   NOW(), NULL),

  ('antidote-gardens-southern',
   'Antidote Gardens',
   'gardens@antidote.nz',
   NOW(), NULL),

  ('antidote-meridian-southern',
   'Antidote Meridian',
   'meridian@antidote.nz',
   NOW(), NULL),

  ('life-pharmacy-centre-city-southern',
   'Life Pharmacy Centre City',
   'dispensary.centrecity@lifepharmacy.co.nz',
   NOW(), NULL),

  ('mcnaughton-s-pharmacy-southern',
   'McNaughton''s Pharmacy',
   'mcnaughtons.dunedin@gmail.com',
   NOW(), NULL),

  ('milton-pharmacy-southern',
   'Milton Pharmacy',
   'scripts@miltonpharmacy.co.nz',
   NOW(), NULL),

  ('musselburgh-pharmacy-2021-limited-southern',
   'Musselburgh Pharmacy (2021) Limited',
   'muspharmacy1@gmail.com',
   NOW(), NULL),

  ('brockville-pharmacy-southern',
   'Brockville Pharmacy',
   'brockvillepharmacy@gmail.com',
   NOW(), NULL),

  ('unichem-knox-pharmacy-southern',
   'Unichem Knox Pharmacy',
   'dispensary@knoxpharmacy.co.nz',
   NOW(), NULL),

  ('woolworths-pharmacy-dunedin-south-southern',
   'Woolworths Pharmacy Dunedin South',
   'dunedinsouth.pharmacy@woolworths.co.nz',
   NOW(), NULL),

  ('unichem-grays-pharmacy-southern',
   'Unichem Grays Pharmacy',
   'grays@grayspharmacy.co.nz',
   NOW(), NULL),

  ('chemist-warehouse-queenstown-town-centre-southern',
   'Chemist Warehouse Queenstown Town Centre',
   'queenstownTC2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('central-otago-pharmacy-southern',
   'Central Otago Pharmacy',
   'prescriptions@centralotagopharmacy.co.nz',
   NOW(), NULL),

  ('five-mile-pharmacy-queenstown-southern',
   'Five Mile Pharmacy Queenstown',
   'info@fivemilepharmacy.co.nz',
   NOW(), NULL),

  ('wanaka-pharmacy-southern',
   'Wanaka Pharmacy',
   'wanakapharmacyrxs@gmail.com',
   NOW(), NULL),

  ('maniototo-pharmacy-southern',
   'Maniototo Pharmacy',
   'maniototo.rx@gmail.com',
   NOW(), NULL),

  ('aspiring-pharmacy-southern',
   'Aspiring Pharmacy',
   'dispensary@aspiringpharmacy.co.nz',
   NOW(), NULL),

  ('unichem-arrowtown-pharmacy-southern',
   'Unichem Arrowtown Pharmacy',
   'info@arrowtownpharmacy.co.nz',
   NOW(), NULL),

  ('alexandra-pharmacy-southern',
   'Alexandra Pharmacy',
   'paul.alexandrapharmacy@gmail.com',
   NOW(), NULL),

  ('unichem-summerfield-s-pharmacy-southern',
   'Unichem Summerfield''s Pharmacy',
   'sales@summerfieldspharmacy.co.nz',
   NOW(), NULL),

  ('unichem-jack-s-point-pharmacy-southern',
   'Unichem Jack''s Point Pharmacy',
   'dispensary@jackspointpharmacy.co.nz',
   NOW(), NULL),

  -- Highland Pharmacy Central (Roxburgh) — same brand as Roxburgh Highland
  -- listed earlier at 14 Ross Place Lawrence
  ('highland-pharmacy-central-southern',
   'Highland Pharmacy Central',
   'roxburghhighlandpharma@gmail.com',
   NOW(), NULL),

  ('queenstown-pharmacy-southern',
   'Queenstown Pharmacy',
   'info@queenstownpharmacy.co.nz',
   NOW(), NULL),

  ('antidote-cromwell-southern',
   'Antidote Cromwell',
   'cromwell@antidote.nz',
   NOW(), NULL),

  ('antidote-lake-dunstan-southern',
   'Antidote Lake Dunstan',
   'lakedunstan@antidote.nz',
   NOW(), NULL),

  ('life-pharmacy-wilkinsons-southern',
   'Life Pharmacy Wilkinsons',
   'dispensary@wilkinsonspharmacy.co.nz',
   NOW(), NULL),

  ('unichem-shotover-pharmacy-southern',
   'Unichem Shotover Pharmacy',
   'sales@shotoverpharmacy.co.nz',
   NOW(), NULL),

  ('wanacare-pharmacy-southern',
   'Wanacare Pharmacy',
   'jenny@wanacarepharmacy.co.nz',
   NOW(), NULL),

  ('unichem-alexandra-pharmacy-southern',
   'Unichem Alexandra Pharmacy',
   'dispensary@unichemalexandra.co.nz',
   NOW(), NULL),

  ('unichem-remarkables-pharmacy-southern',
   'Unichem Remarkables Pharmacy',
   'dispensary@remarkablespharmacy.co.nz',
   NOW(), NULL),

  ('winton-pharmacy-southern',
   'Winton Pharmacy',
   'fax.wintonpharmacy@gmail.com',
   NOW(), NULL),

  ('windsor-pharmacy-southern',
   'Windsor Pharmacy',
   'windsorpharmrx@gmail.com',
   NOW(), NULL),

  ('glengarry-pharmacy-southern',
   'Glengarry Pharmacy',
   'dispensary.glenpharmacy@gmail.com',
   NOW(), NULL),

  ('life-pharmacy-la-hood-s-southern',
   'Life Pharmacy La Hood''s',
   'lahoods@xtra.co.nz',
   NOW(), NULL),

  ('unichem-ascot-pharmacy-southern',
   'Unichem Ascot Pharmacy',
   'ascotpharmacy@xtra.co.nz',
   NOW(), NULL),

  ('gladstone-pharmacy-limited-southern',
   'Gladstone Pharmacy Limited',
   'scriptsgladstonepharmacy@gmail.com',
   NOW(), NULL),

  ('life-pharmacy-donna-kerr-southern',
   'Life Pharmacy Donna Kerr',
   'lifepharmacy@donnakerr.co.nz',
   NOW(), NULL),

  ('unichem-riverton-pharmacy-southern',
   'Unichem Riverton Pharmacy',
   'rivertondispensary@gmail.com',
   NOW(), NULL),

  ('unichem-ufs-pharmacy-southern',
   'Unichem UFS Pharmacy',
   'pharmacist@ufsinv.co.nz',
   NOW(), NULL),

  ('unichem-invercargill-pharmacy-southern',
   'Unichem Invercargill Pharmacy',
   'pharmacist@unicheminv.co.nz',
   NOW(), NULL),

  ('nga-kete-pharmacy-southern',
   'Nga Kete Pharmacy',
   'ngaketepharmacy@gmail.com',
   NOW(), NULL),

  ('sylvan-bank-pharmacy-southern',
   'Sylvan Bank Pharmacy',
   'sylvanbankpharmacy@gmail.com',
   NOW(), NULL),

  ('unichem-quin-s-gore-pharmacy-southern',
   'Unichem Quin''s Gore Pharmacy',
   'dispensary@quinspharmacy.co.nz',
   NOW(), NULL),

  ('woolworths-pharmacy-invercargill-southern',
   'Woolworths Pharmacy Invercargill',
   'invercargill.pharmacy@woolworths.co.nz',
   NOW(), NULL),

  ('fiordland-community-pharmacy-southern',
   'Fiordland Community Pharmacy',
   'prescriptions@fiordlandpharmacy.co.nz',
   NOW(), NULL),

  ('don-street-pharmacy-southern',
   'Don Street Pharmacy',
   'donstpharmacy@yahoo.co.nz',
   NOW(), NULL),

  ('unichem-southcity-pharmacy-southern',
   'Unichem Southcity Pharmacy',
   'southcityprescriptions@gmail.com',
   NOW(), NULL),

  ('unichem-waikiwi-pharmacy-southern',
   'Unichem Waikiwi Pharmacy',
   'pharmacist@waikiwipharmacy.nz',
   NOW(), NULL),

  -- ── Counties Manukau (Auckland) ──────────────────────────────────────
  ('woolworths-pharmacy-botany-counties-manukau',
   'Woolworths Pharmacy Botany',
   'botany.pharmacy@woolworths.co.nz',
   NOW(), NULL),

  ('botany-superclinic-kiwi-chemist-counties-manukau',
   'Botany Superclinic Kiwi Chemist',
   'Botany@kiwichemist.co.nz',
   NOW(), NULL),

  ('unichem-marina-pharmacy-counties-manukau',
   'Unichem Marina Pharmacy',
   'marinachemisthmb@gmail.com',
   NOW(), NULL),

  ('chemist-warehouse-botany-town-centre-counties-manukau',
   'Chemist Warehouse Botany Town Centre',
   'botany.towncentre2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('fencibles-pharmacy-counties-manukau',
   'Fencibles Pharmacy',
   'fenciblespharmacy@gmail.com',
   NOW(), NULL),

  ('unichem-mainstreet-pharmacy-howick-counties-manukau',
   'Unichem Mainstreet Pharmacy Howick',
   'mainstreethowick@unichem.co.nz',
   NOW(), NULL),

  ('botany-road-pharmacy-limited-counties-manukau',
   'Botany Road Pharmacy Limited',
   'botanyroadpharmacy@xtra.co.nz',
   NOW(), NULL),

  ('pakuranga-pharmacy-auckland',
   'Pakuranga Pharmacy',
   'prescriptions@pakurangapharmacy.co.nz',
   NOW(), NULL),

  ('woolworths-pharmacy-meadowlands-auckland',
   'Woolworths Pharmacy Meadowlands',
   'Meadowlands.pharmacy@woolworths.co.nz',
   NOW(), NULL),

  ('family-care-pharmacy-counties-manukau',
   'Family Care Pharmacy',
   'dispensary@familycarepharmacy.co.nz',
   NOW(), NULL),

  ('unichem-john-savory-pharmacy-counties-manukau',
   'Unichem John Savory Pharmacy',
   'disp@pharmacyjsl.co.nz',
   NOW(), NULL),

  ('unichem-aviemore-pharmacy-counties-manukau',
   'Unichem Aviemore Pharmacy',
   'disp.avie@kwokhealthcare.com',
   NOW(), NULL),

  ('best-care-pharmacy-counties-manukau',
   'Best Care Pharmacy',
   'bestcarepharmacy.nz@gmail.com',
   NOW(), NULL),

  ('chemist-warehouse-highland-park-auckland',
   'Chemist Warehouse Highland Park',
   'highlandpark2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('howick-house-pharmacy-counties-manukau',
   'Howick House Pharmacy',
   'howickhousedisp@gmail.com',
   NOW(), NULL),

  ('unichem-beachlands-pharmacy-counties-manukau',
   'Unichem Beachlands Pharmacy',
   'beachlandspharmacy@xtra.co.nz',
   NOW(), NULL),

  ('chemist-warehouse-pakuranga-counties-manukau',
   'Chemist Warehouse Pakuranga',
   'pakuranga2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('unichem-ti-rakau-drive-pharmacy-counties-manukau',
   'Unichem Ti Rakau Drive Pharmacy',
   'tirakau.prescriptions@unichem.co.nz',
   NOW(), NULL),

  ('unichem-pakuranga-pharmacy-counties-manukau',
   'Unichem Pakuranga Pharmacy',
   'pakuranga@unichem.co.nz',
   NOW(), NULL),

  ('juliet-ave-pharmacy-counties-manukau',
   'Juliet Ave Pharmacy',
   'juliet.ave.pharmacy@outlook.co.nz',
   NOW(), NULL),

  ('woolworths-pharmacy-highland-park-counties-manukau',
   'Woolworths Pharmacy Highland Park',
   'highlandpark.pharmacy@woolworths.co.nz',
   NOW(), NULL),

  ('chemist-warehouse-botany-counties-manukau',
   'Chemist Warehouse Botany',
   'botany2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('millhouse-pharmacy-auckland',
   'Millhouse Pharmacy',
   'millhousepharmacy@hotmail.com',
   NOW(), NULL),

  ('pohutukawa-coast-pharmacy-counties-manukau',
   'Pohutukawa Coast Pharmacy',
   'pohutukawapharmacy@gmail.com',
   NOW(), NULL),

  ('unichem-highland-park-pharmacy-counties-manukau',
   'Unichem Highland Park Pharmacy',
   'highlandpark@unichem.co.nz',
   NOW(), NULL),

  ('clevedon-village-pharmacy-counties-manukau',
   'Clevedon Village Pharmacy',
   'dispensary@clevedonpharmacy.co.nz',
   NOW(), NULL),

  ('bargain-chemist-pakuranga-counties-manukau',
   'Bargain Chemist Pakuranga',
   'pakuranga@bargainchemist.co.nz',
   NOW(), NULL),

  ('crawford-house-pharmacy-counties-manukau',
   'Crawford House Pharmacy',
   'crawfordhousepharmacy@gmail.com',
   NOW(), NULL),

  ('royal-road-pharmacy-waitemat',
   'Royal Road Pharmacy',
   'dispensary@royalroadpharmacy.co.nz',
   NOW(), NULL),

  ('green-bay-pharmacy-waitemat',
   'Green Bay Pharmacy',
   'greenbaypharmacy@pharmacygroup.nz',
   NOW(), NULL),

  ('massey-unichem-pharmacy-waitemat',
   'Massey Unichem Pharmacy',
   'Rx@masseyunichem.co.nz',
   NOW(), NULL),

  ('unichem-golf-road-pharmacy-waitemat',
   'Unichem Golf Road Pharmacy',
   'golfroadpharmacy@gmail.com',
   NOW(), NULL),

  ('henderson-medical-centre-pharmacy-waitemat',
   'Henderson Medical Centre Pharmacy',
   'hendersonmc.pharmacy@gmail.com',
   NOW(), NULL),

  ('royal-heights-pharmacy-waitemat',
   'Royal Heights Pharmacy',
   'dispensary@royalheightspharmacy.co.nz',
   NOW(), NULL),

  ('life-pharmacy-northwest-waitemat',
   'Life Pharmacy Northwest',
   'pharmacist@lifenorthwest.co.nz',
   NOW(), NULL),

  ('all-seasons-pharmacy-waitemat',
   'All Seasons Pharmacy',
   'prescriptions@allseasonspharmacy.co.nz',
   NOW(), NULL),

  ('pharmcare-pharmacy-waitemat',
   'PharmCare Pharmacy',
   'pharmcarenz@gmail.com',
   NOW(), NULL),

  ('chemist-warehouse-westgate-lifestyle-centre-waitemat',
   'Chemist Warehouse Westgate Lifestyle Centre',
   'westgate.lifestylecentre2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('chemist-warehouse-kelston-mall-waitemat',
   'Chemist Warehouse Kelston Mall',
   'kelstonmall2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('unichem-westgate-pharmacy-waitemat',
   'Unichem Westgate Pharmacy',
   'pharmacist@westgatepharmacy.co.nz',
   NOW(), NULL),

  ('swanson-pharmacy-waitemat',
   'Swanson Pharmacy',
   'swansonpharmacy@gmail.com',
   NOW(), NULL),

  ('bargain-chemist-westcity-auckland',
   'Bargain Chemist WestCity',
   'westcity@bargainchemist.co.nz',
   NOW(), NULL),

  ('woolworths-pharmacy-hobsonville-waitemat',
   'Woolworths Pharmacy Hobsonville',
   'hobsonville.pharmacy@woolworths.co.nz',
   NOW(), NULL),

  ('waimauku-pharmacy-silver-fern-waitemat',
   'Waimauku Pharmacy - Silver Fern',
   'prescriptions@waimaukupharmacy.co.nz',
   NOW(), NULL),

  ('unichem-new-lynn-pharmacy-waitemat',
   'Unichem New Lynn Pharmacy',
   'ewlynn@gxh.co.nz',
   NOW(), NULL),

  ('kelston-medical-pharmacy-waitemat',
   'Kelston Medical Pharmacy',
   'kelstonmedpharmacy@xtra.co.nz',
   NOW(), NULL),

  ('unichem-medi-centre-pharmacy-waitemat',
   'Unichem Medi-Centre Pharmacy',
   'disp.medicentrepharmacy@totem.nz',
   NOW(), NULL),

  ('titirangi-pharmacy-waitemat',
   'Titirangi Pharmacy',
   'titirangipharmacy@gmail.com',
   NOW(), NULL),

  ('unichem-peninsula-pharmacy-waitemat',
   'Unichem Peninsula Pharmacy',
   'dispensary@mypharmacy.co.nz',
   NOW(), NULL),

  ('mydispensary-pharmacy-clinic-waitemat',
   'Mydispensary Pharmacy & Clinic',
   'contact@mydispensary.co.nz',
   NOW(), NULL),

  ('henderson-valley-pharmacy-waitemat',
   'Henderson Valley Pharmacy',
   'hendvalleyphcy@gmail.com',
   NOW(), NULL),

  ('unichem-huapai-pharmacy-auckland',
   'Unichem Huapai Pharmacy',
   'huapaiprescriptions@unichem.co.nz',
   NOW(), NULL),

  ('lincoln-mall-pharmacy-limited-waitemat',
   'Lincoln Mall Pharmacy Limited',
   'lincolnmallpharmacy@pharmacygroup.nz',
   NOW(), NULL),

  ('mclaren-park-pharmacy-waitemat',
   'McLaren Park Pharmacy',
   'mcppharmacyerx@gmail.com',
   NOW(), NULL),

  ('glen-eden-pharmacy-waitemat',
   'Glen Eden Pharmacy',
   'scripts@glenedenpharmacy.nz',
   NOW(), NULL),

  ('the-caring-pharmacy-waitemat',
   'The Caring Pharmacy',
   'thecaringphcy@gmail.com',
   NOW(), NULL),

  ('chemist-warehouse-lynnmall-waitemat',
   'Chemist Warehouse LynnMall',
   'lynnmall2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('chemist-warehouse-westgate-waitemat',
   'Chemist Warehouse Westgate',
   'westgate2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('allen-s-village-pharmacy-limited-waitemat',
   'Allen''s Village Pharmacy Limited',
   'allensvillage@live.com',
   NOW(), NULL),

  ('unichem-helensville-pharmacy-waitemat',
   'Unichem Helensville Pharmacy',
   'unichemhelensvillepharmacy@outlook.co.nz',
   NOW(), NULL),

  ('bargain-chemist-westgate-waitemat',
   'Bargain Chemist Westgate',
   'westgate@bargainchemist.co.nz',
   NOW(), NULL),

  ('unichem-hobsonville-pharmacy-waitemat',
   'Unichem Hobsonville Pharmacy',
   'pharmacist@hobsonvillepharmacy.co.nz',
   NOW(), NULL),

  ('waimauku-village-pharmacy-waitemat',
   'Waimauku Village Pharmacy',
   'prescriptions@waimaukupharmacy.co.nz',
   NOW(), NULL),

  ('unichem-glendene-pharmacy-waitemat',
   'Unichem Glendene Pharmacy',
   'glendenepharmacy@totem.nz',
   NOW(), NULL),

  ('unichem-lynnmall-waitemat',
   'Unichem Lynnmall',
   'unichemlynnmall@xtra.co.nz',
   NOW(), NULL),

  ('new-lynn-west-pharmacy-waitemat',
   'New Lynn West Pharmacy',
   'newlynnwestpharmacy@gmail.com',
   NOW(), NULL),

  ('redhills-pharmacy-waitemat',
   'RedHills Pharmacy',
   'redhillsnz@gmail.com',
   NOW(), NULL),

  ('unichem-waiora-pharmacy-waitemat',
   'Unichem Waiora Pharmacy',
   'Waiorapharmacy@totem.nz',
   NOW(), NULL),

  ('ranui-pharmacy-waitemat',
   'Ranui Pharmacy',
   'ranuipharmacy@gmail.com',
   NOW(), NULL),

  ('westview-pharmacy-waitemat',
   'Westview Pharmacy',
   'script@wvp.co.nz',
   NOW(), NULL),

  ('northwest-pharmacy-waitemat',
   'Northwest Pharmacy',
   'scripts@northwestpharmacy.co.nz',
   NOW(), NULL),

  ('health-new-lynn-7-day-pharmacy-auckland',
   'Health New Lynn 7 Day Pharmacy',
   'pharmacy@healthnewlynn7day.co.nz',
   NOW(), NULL),

  ('woolworths-pharmacy-lincoln-road-waitemat',
   'Woolworths Pharmacy Lincoln Road',
   'lincolnroad.pharmacy@woolworths.co.nz',
   NOW(), NULL),

  ('unichem-ratanui-pharmacy-waitemat',
   'Unichem Ratanui Pharmacy',
   'ratanuipharmacy@totem.nz',
   NOW(), NULL),

  ('hobsonville-point-pharmacy-limited-waitemat',
   'Hobsonville Point Pharmacy',
   'fax@hppharmacy.co.nz',
   NOW(), NULL),

  ('unichem-west-city-pharmacy-auckland',
   'Unichem West City Pharmacy',
   'Westcityunichem@outlook.com',
   NOW(), NULL),

  ('costco-pharmacy-westgate-waitemat',
   'Costco Pharmacy Westgate',
   'pharmacy-westgate@costco.co.nz',
   NOW(), NULL),

  ('chemist-warehouse-henderson-waitemat',
   'Chemist Warehouse Henderson',
   'henderson2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('chemist-warehouse-ratanui-street-waitemat',
   'Chemist Warehouse Ratanui Street',
   'ratanuistreet2@chemistwarehouse.co.nz',
   NOW(), NULL),

  -- ── Wellington / Capital, Coast and Hutt Valley ──────────────────────
  ('city-medical-centre-pharmacy-capital-coast-and-hutt-valley',
   'City Medical Centre Pharmacy',
   'citymedicalcentrepharmacy@gmail.com',
   NOW(), NULL),

  ('after-hours-pharmacy-capital-coast-and-hutt-valley',
   'After Hours Pharmacy',
   'hello@afterhourspharmacy.co.nz',
   NOW(), NULL),

  ('whitby-pharmacy-capital-coast-and-hutt-valley',
   'Whitby Pharmacy',
   'prescriptions@whitbypharmacy.co.nz',
   NOW(), NULL),

  ('john-castle-chemists-capital-coast-and-hutt-valley',
   'John Castle Chemists',
   'castlechemists@gmail.com',
   NOW(), NULL),

  ('titahi-bay-pharmacy-capital-coast-and-hutt-valley',
   'Titahi Bay Pharmacy',
   'scripts@titahibaypharmacy.co.nz',
   NOW(), NULL),

  ('unichem-lychgate-pharmacy-capital-coast-and-hutt-valley',
   'Unichem Lychgate Pharmacy',
   'lychgatepharmacy@xtra.co.nz',
   NOW(), NULL),

  ('life-pharmacy-coastlands-capital-coast-and-hutt-valley',
   'Life Pharmacy Coastlands',
   'dispensary.coastlands@lifepharmacy.co.nz',
   NOW(), NULL),

  ('unichem-willis-st-pharmacy-capital-coast-and-hutt-valley',
   'Unichem Willis St. Pharmacy',
   'willisst@unichem.co.nz',
   NOW(), NULL),

  ('unichem-cuba-mall-pharmacy-capital-coast-and-hutt-valley',
   'Unichem Cuba Mall Pharmacy',
   'info@cubamall.unichem.co.nz',
   NOW(), NULL),

  ('village-pharmacy-ngaio-capital-coast-and-hutt-valley',
   'Village Pharmacy Ngaio',
   'rxngaiopharmacy@gmail.com',
   NOW(), NULL),

  ('bargain-chemist-porirua-capital-coast-and-hutt-valley',
   'Bargain Chemist Porirua',
   'porirua@bargainchemist.co.nz',
   NOW(), NULL),

  ('chemist-warehouse-porirua-capital-coast-and-hutt-valley',
   'Chemist Warehouse Porirua',
   'porirua2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('mana-pharmacy-capital-coast-and-hutt-valley',
   'Mana Pharmacy',
   'rxmana@pharmacysolutions.nz',
   NOW(), NULL),

  ('unichem-island-bay-pharmacy-capital-coast-and-hutt-valley',
   'Unichem Island Bay Pharmacy',
   'islandbayrx@unichem.co.nz',
   NOW(), NULL),

  ('newtown-medical-centre-dispensary-capital-coast-and-hutt-valley',
   'Newtown Medical Centre Dispensary',
   'newtownmedicalcentredispensary@gmail.com',
   NOW(), NULL),

  ('woolworths-pharmacy-newtown-capital-coast-and-hutt-valley',
   'Woolworths Pharmacy Newtown',
   'newtown.pharmacy@woolworths.co.nz',
   NOW(), NULL),

  ('onslow-pharmacy-capital-coast-and-hutt-valley',
   'Onslow Pharmacy',
   'rxonslow@psl2022.nz',
   NOW(), NULL),

  ('wellworks-pharmacy-capital-coast-and-hutt-valley',
   'Wellworks Pharmacy',
   'hello@wellworks.co.nz',
   NOW(), NULL),

  ('newlands-pharmacy-capital-coast-and-hutt-valley',
   'Newlands Pharmacy',
   'newlandspharmacy@hotmail.com',
   NOW(), NULL),

  ('lambton-square-pharmacy-capital-coast-and-hutt-valley',
   'Lambton Square Pharmacy',
   'lambtonsquare@gmail.com',
   NOW(), NULL),

  ('cannons-creek-pharmacy-capital-coast-and-hutt-valley',
   'Cannons Creek Pharmacy',
   'ccpharmacyfax@gmail.com',
   NOW(), NULL),

  ('unichem-brooklyn-pharmacy-capital-coast-and-hutt-valley',
   'Unichem Brooklyn Pharmacy',
   'unichembrooklynpharmacy@gmail.com',
   NOW(), NULL),

  ('strathmore-park-pharmacy-capital-coast-and-hutt-valley',
   'Strathmore Park Pharmacy',
   'strathmoreparkpharmacy@gmail.com',
   NOW(), NULL),

  ('unichem-molesworth-pharmacy-capital-coast-and-hutt-valley',
   'Unichem Molesworth Pharmacy',
   'molesworth@unichem.co.nz',
   NOW(), NULL),

  ('unichem-wellington-central-pharmacy-capital-coast-and-hutt-valley',
   'Unichem Wellington Central Pharmacy',
   'rx.wellingtoncentral@unichem.co.nz',
   NOW(), NULL),

  ('raumati-road-pharmacy-capital-coast-and-hutt-valley',
   'Raumati Road Pharmacy',
   'scripts@raumatirdpharmacy.co.nz',
   NOW(), NULL),

  ('ihakara-pharmacy-capital-coast-and-hutt-valley',
   'Ihakara Pharmacy',
   'ihakarapharmacyrx@gmail.com',
   NOW(), NULL),

  ('waitangirua-pharmacy-limited-capital-coast-and-hutt-valley',
   'Waitangirua Pharmacy',
   'support@waitangiruapharmacy.co.nz',
   NOW(), NULL),

  ('bargain-chemist-wellington-capital-coast-and-hutt-valley',
   'Bargain Chemist Wellington',
   'manners@bargainchemist.co.nz',
   NOW(), NULL),

  ('unichem-kilbirnie-pharmacy-capital-coast-and-hutt-valley',
   'Unichem Kilbirnie Pharmacy',
   'scripts@kilbirniepharmacy.co.nz',
   NOW(), NULL),

  ('hataitai-pharmacy-capital-coast-and-hutt-valley',
   'Hataitai Pharmacy',
   'faxhataitaipharmacy@gmail.com',
   NOW(), NULL),

  -- Register lists 58 Miramar Avenue; Healthpoint listing shows the pharmacy has
  -- moved to 4/11 Tauhinu Road. Matched by brand + suburb.
  ('unichem-miramar-pharmacy-capital-coast-and-hutt-valley',
   'Unichem Miramar Pharmacy',
   'miramar@unichem.co.nz',
   NOW(), NULL),

  ('paraparaumu-beach-pharmacy-capital-coast-and-hutt-valley',
   'Paraparaumu Beach Pharmacy',
   'escripts@beachpharmacy.co.nz',
   NOW(), NULL),

  ('village-pharmacy-khandallah-capital-coast-and-hutt-valley',
   'Village Pharmacy Khandallah',
   'info@khandallahpharmacy.co.nz',
   NOW(), NULL),

  ('unichem-waikanae-health-pharmacy-capital-coast-and-hutt-valley',
   'Unichem Waikanae Health Pharmacy',
   'waikanae@unichem.co.nz',
   NOW(), NULL),

  ('crofton-downs-pharmacy-capital-coast-and-hutt-valley',
   'Crofton Downs Pharmacy',
   'cdphy@xtra.co.nz',
   NOW(), NULL),

  ('life-pharmacy-johnsonville-capital-coast-and-hutt-valley',
   'Life Pharmacy Johnsonville',
   'dispensary.johnsonville@lifepharmacy.co.nz',
   NOW(), NULL),

  ('kenepuru-pharmacy-capital-coast-and-hutt-valley',
   'Kenepuru Pharmacy',
   'kenepuruprescription@gmail.com',
   NOW(), NULL),

  ('westbury-pharmacy-capital-coast-and-hutt-valley',
   'Westbury Pharmacy',
   'dispensary@westburypharmacy.co.nz',
   NOW(), NULL),

  ('unichem-marsden-village-pharmacy-capital-coast-and-hutt-valley',
   'Unichem Marsden Village Pharmacy',
   'marsdenvillage@unichem.co.nz',
   NOW(), NULL),

  ('mazengarb-pharmacy-capital-coast-and-hutt-valley',
   'Mazengarb Pharmacy',
   'mazengarbpharmacy@gmail.com',
   NOW(), NULL),

  ('unichem-simon-s-pharmacy-capital-coast-and-hutt-valley',
   'Unichem Simon''s Pharmacy',
   'dispensary@simonspharmacy.co.nz',
   NOW(), NULL),

  ('unichem-karori-mall-pharmacy-capital-coast-and-hutt-valley',
   'Unichem Karori Mall Pharmacy',
   'karorimallpharmacy@gmail.com',
   NOW(), NULL),

  ('kelburn-pharmacy-capital-coast-and-hutt-valley',
   'Kelburn Pharmacy',
   'rxkelburn@psl2022.nz',
   NOW(), NULL),

  -- ── Auckland (central/south) ─────────────────────────────────────────
  ('unichem-walls-roche-royal-oak-pharmacy-auckland',
   'Unichem Walls & Roche Royal Oak Pharmacy',
   'scripts@wallsandroche.co.nz',
   NOW(), NULL),

  ('richmond-road-pharmacy-auckland',
   'Richmond Road Pharmacy',
   'richmondrdpharmacy@xtra.co.nz',
   NOW(), NULL),

  ('unichem-otahuhu-health-centre-pharmacy-auckland',
   'Unichem Otahuhu Health Centre Pharmacy',
   'pharmacist.unichemotahuhu@gmail.com',
   NOW(), NULL),

  ('unichem-eden-quarter-pharmacy-auckland',
   'Unichem Eden Quarter Pharmacy',
   'edenquarterpharmacy@gmail.com',
   NOW(), NULL),

  ('unichem-ellerslie-pharmacy-auckland',
   'Unichem Ellerslie Pharmacy',
   'ellersliepharmacy@gmail.com',
   NOW(), NULL),

  ('savemart-pharmacy-auckland',
   'SaveMart Pharmacy',
   'savemartpharmacy@xtra.co.nz',
   NOW(), NULL),

  ('thornton-s-pharmacy-auckland',
   'Thornton''s Pharmacy',
   'thorntonspharmacy@totem.nz',
   NOW(), NULL),

  ('unichem-wynyard-pharmacy-auckland',
   'Unichem Wynyard Pharmacy',
   'wynyard@unichem.co.nz',
   NOW(), NULL),

  ('smartcare-pharmacy-auckland',
   'Smartcare Pharmacy',
   'smartcarefax@gmail.com',
   NOW(), NULL),

  ('onehunga-family-pharmacy-auckland',
   'Onehunga Family Pharmacy',
   'scripts@familypharmacy.co.nz',
   NOW(), NULL),

  ('bargain-chemist-mt-roskill-auckland',
   'Bargain Chemist Mt Roskill',
   'mtroskill@bargainchemist.co.nz',
   NOW(), NULL),

  ('prochem-pharmacy-auckland',
   'Prochem Pharmacy',
   'prochempharmacy@gmail.com',
   NOW(), NULL),

  ('chemist-warehouse-eden-quarter-auckland',
   'Chemist Warehouse Eden Quarter',
   'eden.quarter2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('lifeline-pharmacy-auckland',
   'Lifeline Pharmacy',
   'lifelinepharmacyotahuhu@gmail.com',
   NOW(), NULL),

  ('blockhouse-bay-pharmacy-auckland',
   'Blockhouse Bay Pharmacy',
   'rxbhbpharmacy@gmail.com',
   NOW(), NULL),

  ('kingsland-pharmacy-auckland',
   'Kingsland Pharmacy',
   'kingslandpharmacy@xtra.co.nz',
   NOW(), NULL),

  ('unichem-richardson-road-pharmacy-auckland',
   'Unichem Richardson Road Pharmacy',
   'richardsonpharmacy@totem.nz',
   NOW(), NULL),

  ('avondale-family-chemist-auckland',
   'Avondale Family Chemist',
   'avondalechemist@xtra.co.nz',
   NOW(), NULL),

  ('lockington-s-pharmacy-limited-auckland',
   'Lockington''s Pharmacy',
   'lockingtons.original@gmail.com',
   NOW(), NULL),

  ('woolworths-pharmacy-mt-eden-auckland',
   'Woolworths Pharmacy Mt Eden',
   'mounteden.pharmacy@woolworths.co.nz',
   NOW(), NULL),

  ('avondale-pharmacy-auckland',
   'Avondale Pharmacy',
   'info@avondalepharmacyndl.co.nz',
   NOW(), NULL),

  ('roskill-healthcare-pharmacy-auckland',
   'Roskill Healthcare Pharmacy',
   'roskillhealthcare@outlook.co.nz',
   NOW(), NULL),

  ('parkside-pharmacy-auckland-limited-auckland',
   'Parkside Pharmacy Auckland',
   'pharmacy@parksideauckland.co.nz',
   NOW(), NULL),

  ('white-swan-pharmacy-auckland',
   'White Swan Pharmacy',
   'whiteswanpharmacy@xtra.co.nz',
   NOW(), NULL),

  ('pharmacy-455-mt-eden-auckland',
   'Pharmacy 455 Mt Eden',
   'pharmacy455.mteden@gmail.com',
   NOW(), NULL),

  ('cranwell-s-pharmacy-2011-limited-auckland',
   'Cranwell''s Pharmacy',
   'cranwellsrx@gmail.com',
   NOW(), NULL),

  ('lockington-s-medical-centre-pharmacy-auckland',
   'Lockington''s Medical Centre Pharmacy',
   'lockingtons.medical@gmail.com',
   NOW(), NULL),

  ('unichem-royal-oak-pharmacy-auckland',
   'Unichem Royal Oak Pharmacy',
   'dispensary@unichemroyaloak.co.nz',
   NOW(), NULL),

  ('freemans-bay-pharmacy-auckland',
   'Freemans Bay Pharmacy',
   'phyfreemansbay@gmail.com',
   NOW(), NULL),

  ('unichem-one-tree-hill-pharmacy-auckland',
   'Unichem One Tree Hill Pharmacy',
   'pharmacysave@gmail.com',
   NOW(), NULL),

  ('eden-park-pharmacy-auckland',
   'Eden Park Pharmacy',
   'edenparkpharmacy@gmail.com',
   NOW(), NULL),

  ('unichem-sandringham-pharmacy-auckland',
   'Unichem Sandringham Pharmacy',
   'sandringhampharmacy@totem.nz',
   NOW(), NULL),

  ('unichem-neill-s-pharmacy-auckland',
   'Unichem Neill''s Pharmacy',
   'dispensary@unichemneills.co.nz',
   NOW(), NULL),

  ('woolworths-pharmacy-ponsonby-auckland',
   'Woolworths Pharmacy Ponsonby',
   'ponsonby.pharmacy@woolworths.co.nz',
   NOW(), NULL),

  ('balmoral-pharmacy-auckland',
   'Balmoral Pharmacy',
   'info@balmoralpharmacyndl.co.nz',
   NOW(), NULL),

  ('netpharmacy-auckland',
   'Netpharmacy',
   'shop@netpharmacy.co.nz',
   NOW(), NULL),

  ('great-barrier-pharmacy-auckland',
   'Great Barrier Pharmacy',
   'rxforgbi@gmail.com',
   NOW(), NULL),

  ('herne-bay-pharmacy-auckland',
   'Herne Bay Pharmacy',
   'hello@hernebaypharmacy.co.nz',
   NOW(), NULL),

  ('unichem-115-queen-street-pharmacy-auckland',
   'Unichem 115 Queen Street Pharmacy',
   '115queenst@unichem.co.nz',
   NOW(), NULL),

  ('chemist-warehouse-auckland-lower-queen-street-auckland',
   'Chemist Warehouse Auckland - Lower Queen Street',
   'aucklandlowerqueenst2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('grafton-pharmacy-auckland',
   'Grafton Pharmacy',
   'disp@graftonrx.co.nz',
   NOW(), NULL),

  ('pharmacy-on-dominion-auckland',
   'Pharmacy On Dominion',
   'yourhealth@pharmacyondominion.co.nz',
   NOW(), NULL),

  ('chemist-warehouse-newmarket-broadway-auckland',
   'Chemist Warehouse Newmarket Broadway',
   'newmarketbroadway2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('citymed-pharmacy-auckland',
   'CityMed Pharmacy',
   'info@citymedpharmacy.co.nz',
   NOW(), NULL),

  ('3-kings-plaza-pharmacy-auckland',
   '3 Kings Plaza Pharmacy',
   '3kingsdispensary@7daypharmacy.co.nz',
   NOW(), NULL),

  ('new-north-pharmacy-limited-auckland',
   'New North Pharmacy',
   'newnorthpharmscripts@outlook.com',
   NOW(), NULL),

  ('home-pharmacy-auckland',
   'Home Pharmacy',
   'info@homepharmacy.co.nz',
   NOW(), NULL),

  ('chemist-warehouse-onehunga-auckland',
   'Chemist Warehouse Onehunga',
   'onehunga2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('bruce-amies-pharmacy-auckland',
   'Bruce Amies Pharmacy',
   'healthtrack@xtra.co.nz',
   NOW(), NULL),

  ('chemist-warehouse-auckland-victoria-street-auckland',
   'Chemist Warehouse Auckland - Victoria Street',
   'aucklandvictoriast2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('queen-street-pharmacy-services-limited-auckland',
   'Queen Street Pharmacy',
   'viklesh@xtra.co.nz',
   NOW(), NULL),

  ('pharmacy-at-quay-park-2018-limited-auckland',
   'Pharmacy At Quay Park',
   'pharmacist.quayparkpharmacy@gmail.com',
   NOW(), NULL),

  ('hillsborough-pharmacy-auckland',
   'Hillsborough Pharmacy',
   'hillsborough.pharmacy@gmail.com',
   NOW(), NULL),

  ('ascot-pharmacy-auckland',
   'Ascot Pharmacy',
   'ascot.pharmacy@xtra.co.nz',
   NOW(), NULL),

  ('panmure-pharmacy-auckland',
   'Panmure Pharmacy',
   'panmurepharmacy@gmail.com',
   NOW(), NULL),

  ('allevia-pharmacy-auckland',
   'Allevia Pharmacy',
   'pharmacy@allevia.co.nz',
   NOW(), NULL),

  ('newton-a-z-pharmacy-auckland',
   'Newton A-Z Pharmacy',
   'newtonazpharmacy@xtra.co.nz',
   NOW(), NULL),

  ('unichem-glendowie-pharmacy-auckland',
   'Unichem Glendowie Pharmacy',
   'hcpharmacies1@gmail.com',
   NOW(), NULL),

  ('turuki-pharmacy-panmure-auckland',
   'Turuki Pharmacy Panmure',
   'turukiprescriptions@gmail.com',
   NOW(), NULL),

  ('otahuhu-7-day-chemist-auckland',
   'Otahuhu 7 Day Chemist',
   'otahuhu7daychemist@gmail.com',
   NOW(), NULL),

  ('royal-oak-pharmacy-auckland',
   'Royal Oak Pharmacy',
   'info@royaloakpharmacyndl.co.nz',
   NOW(), NULL),

  ('clinic-pharmacy-remuera-auckland',
   'Clinic Pharmacy Remuera',
   'clinicpharmacy@xtra.co.nz',
   NOW(), NULL),

  ('unichem-mount-wellington-pharmacy-auckland',
   'Unichem Mount Wellington Pharmacy',
   'mountwellington@unichem.co.nz',
   NOW(), NULL),

  ('epsom-pharmacy-2008-limited-auckland',
   'Epsom Pharmacy',
   'Pharmacist.epsompharmacy@gmail.com',
   NOW(), NULL),

  ('woolworths-pharmacy-greenlane-auckland',
   'Woolworths Pharmacy Greenlane',
   'greenlane.pharmacy@woolworths.co.nz',
   NOW(), NULL),

  ('woolworths-pharmacy-grey-lynn-auckland',
   'Woolworths Pharmacy Grey Lynn',
   'greylynn.pharmacy@woolworths.co.nz',
   NOW(), NULL),

  ('chemist-warehouse-sylvia-park-auckland',
   'Chemist Warehouse Sylvia Park',
   'sylviapark2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('st-heliers-pharmacy-auckland',
   'St Heliers Pharmacy',
   'info@sthelierspharmacyndl.co.nz',
   NOW(), NULL),

  ('unichem-ponsonby-pharmacy-auckland',
   'Unichem Ponsonby Pharmacy',
   'unichemponsonby@gmail.com',
   NOW(), NULL),

  ('unichem-panmure-pharmacy-auckland',
   'Unichem Panmure Pharmacy',
   'panmureunichem@gmail.com',
   NOW(), NULL),

  ('unichem-point-chevalier-pharmacy-auckland',
   'Unichem Point Chevalier Pharmacy',
   'dispensaryptchev@xtra.co.nz',
   NOW(), NULL),

  ('new-windsor-pharmacy-auckland',
   'New Windsor Pharmacy',
   'new.wpharmacy@gmail.com',
   NOW(), NULL),

  ('life-pharmacy-sylvia-park-auckland',
   'Life Pharmacy Sylvia Park',
   'disp.sp@lifepharmacy.co.nz',
   NOW(), NULL),

  ('prohealth-panmure-pharmacy-auckland',
   'ProHealth Panmure Pharmacy',
   'prescriptions.prohealthpanmure@outlook.co.nz',
   NOW(), NULL),

  ('life-pharmacy-st-heliers-auckland',
   'Life Pharmacy St Heliers',
   'lifesth@xtra.co.nz',
   NOW(), NULL),

  ('unichem-stoddard-rd-pharmacy-auckland',
   'Unichem Stoddard Rd Pharmacy',
   'Stoddardpharmacy@totem.nz',
   NOW(), NULL),

  ('pharmville-st-albans-pharmacy-auckland',
   'Pharmville St Albans Pharmacy',
   'pharmvillepharmacy15@gmail.com',
   NOW(), NULL),

  ('life-pharmacy-eastridge-auckland',
   'Life Pharmacy Eastridge',
   'dispensary@lifeeastridge.co.nz',
   NOW(), NULL),

  ('gladstone-pharmacy-auckland',
   'Gladstone Pharmacy',
   'gladstonepharmacy@xtra.co.nz',
   NOW(), NULL),

  ('life-pharmacy-commercial-bay-auckland',
   'Life Pharmacy Commercial Bay',
   'dispensary.commercialbay@lifepharmacy.co.nz',
   NOW(), NULL),

  ('alberton-pharmacy-auckland',
   'Alberton Pharmacy',
   'albertonpharmacy@yahoo.co.nz',
   NOW(), NULL),

  ('epsom-kiwi-chemist-auckland',
   'Epsom Kiwi Chemist',
   'epsom@kiwichemist.co.nz',
   NOW(), NULL),

  ('chemist-warehouse-st-lukes-auckland',
   'Chemist Warehouse St Lukes',
   'stlukes2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('maxcare-pharmacy-auckland',
   'Maxcare Pharmacy',
   'maxcarepharmacy9@gmail.com',
   NOW(), NULL),

  ('unichem-mt-smart-pharmacy-auckland',
   'Unichem Mt Smart Pharmacy',
   'mtsmart@unichem.co.nz',
   NOW(), NULL),

  ('life-pharmacy-newmarket-auckland',
   'Life Pharmacy Newmarket',
   'pharmacist.newmarket@lifepharmacy.co.nz',
   NOW(), NULL),

  ('unichem-onehunga-centre-pharmacy-auckland',
   'Unichem Onehunga Centre Pharmacy',
   'onehungacentrepharmacy@unichem.co.nz',
   NOW(), NULL),

  ('gopal-s-pharmacy-limited-auckland',
   'Gopal''s Pharmacy',
   'gopalspharmacy@xtra.co.nz',
   NOW(), NULL),

  ('mission-bay-pharmacy-auckland',
   'Mission Bay Pharmacy',
   'missionbaypharmacy@gmail.com',
   NOW(), NULL),

  ('westmere-pharmacy-limited-auckland',
   'Westmere Pharmacy',
   'prescriptions@westmerepharmacy.co.nz',
   NOW(), NULL),

  ('woolworths-pharmacy-auckland-city-auckland',
   'Woolworths Pharmacy Auckland City',
   'aucklandcity.pharmacy@woolworths.co.nz',
   NOW(), NULL),

  ('woolworths-pharmacy-lynfield-auckland',
   'Woolworths Pharmacy Lynfield',
   'lynfield.pharmacy@woolworths.co.nz',
   NOW(), NULL),

  ('unichem-remuera-pharmacy-auckland',
   'Unichem Remuera Pharmacy',
   'dispensary@unichemremuera.co.nz',
   NOW(), NULL),

  ('unichem-cox-s-7-day-pharmacy-auckland',
   'Unichem Cox''s 7 Day Pharmacy',
   'coxspharmacy@totem.nz',
   NOW(), NULL),

  ('glenavon-kiwi-chemist-auckland',
   'Glenavon Kiwi Chemist',
   'glenavon@kiwichemist.co.nz',
   NOW(), NULL),

  ('unichem-queen-street-pharmacy-auckland',
   'Unichem Queen Street Pharmacy',
   'dispensary.262queenst@unichem.co.nz',
   NOW(), NULL),

  ('unichem-greenlane-pharmacy-auckland',
   'Unichem Greenlane Pharmacy',
   'greenlanepharmacy@gmail.com',
   NOW(), NULL),

  ('otahuhu-community-pharmacy-auckland',
   'Otahuhu Community Pharmacy',
   'otahuhucommunitypharmacy@xtra.co.nz',
   NOW(), NULL),

  ('chemist-warehouse-westfield-newmarket-auckland',
   'Chemist Warehouse Westfield Newmarket',
   'westfieldnewmarket2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('unichem-harris-road-pharmacy-auckland',
   'Unichem Harris Road Pharmacy',
   'harrisroadchemist@gmail.com',
   NOW(), NULL),

  ('unichem-lunn-ave-pharmacy-auckland',
   'Unichem Lunn Ave Pharmacy',
   'lunnavepharmacy@totem.nz',
   NOW(), NULL),

  ('unichem-218-ponsonby-pharmacy-auckland',
   'Unichem 218 Ponsonby Pharmacy',
   'pharmacy@unichem218.co.nz',
   NOW(), NULL),

  ('medicines-to-midnight-auckland',
   'Medicines to Midnight',
   'medicinestomidnight@xtra.co.nz',
   NOW(), NULL),

  ('unichem-campus-pharmacy-auckland',
   'Unichem Campus Pharmacy',
   'campus.pharm@xtra.co.nz',
   NOW(), NULL),

  ('dominion-road-pharmacy-auckland',
   'Dominion Road Pharmacy',
   '123ddominionroad@gmail.com',
   NOW(), NULL),

  ('newton-pharmacy-auckland',
   'Newton Pharmacy',
   'newtonpharmacy283@gmail.com',
   NOW(), NULL),

  ('avondale-kiwi-chemist-auckland',
   'Avondale Kiwi Chemist',
   'avondale@kiwichemist.co.nz',
   NOW(), NULL),

  ('lambs-pharmacy-natural-therapies-centre-auckland',
   'Lambs Pharmacy & Natural Therapies Centre',
   'hansaswanlake@gmail.com',
   NOW(), NULL),

  ('chemist-warehouse-glen-innes-auckland',
   'Chemist Warehouse Glen Innes',
   'gleninnes2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('mt-eden-pharmacy-auckland',
   'Mt Eden Pharmacy',
   'mtedenrx@gmail.com',
   NOW(), NULL),

  ('mt-albert-village-pharmacy-auckland',
   'Mt Albert Village Pharmacy',
   'albertpharmacy@gmail.com',
   NOW(), NULL),

  ('eastmed-pharmacy-auckland',
   'Eastmed Pharmacy',
   'dispensary@eastmedpharmacy.co.nz',
   NOW(), NULL),

  ('hc-pharmacy-auckland',
   'HC Pharmacy',
   'auckland@hamiltoncentralpharmacy.co.nz',
   NOW(), NULL),

  ('life-pharmacy-meadowbank-auckland',
   'Life Pharmacy Meadowbank',
   'rx.meadowbank@lifepharmacy.co.nz',
   NOW(), NULL),

  ('woolworths-pharmacy-mt-roskill-auckland',
   'Woolworths Pharmacy Mt Roskill',
   'mountroskill.pharmacy@woolworths.co.nz',
   NOW(), NULL),

  ('auckland-central-pharmacy-auckland',
   'Auckland Central Pharmacy',
   'akcentralpharmacy@gmail.com',
   NOW(), NULL),

  ('hobson-street-pharmacy-auckland',
   'Hobson Street Pharmacy',
   'hobsonstpharmacy@gmail.com',
   NOW(), NULL),

  ('unichem-family-healthcare-pharmacy-auckland',
   'Unichem Family Healthcare Pharmacy',
   'hcpharmacies@gmail.com',
   NOW(), NULL),

  ('unichem-roskill-village-pharmacy-auckland',
   'Unichem Roskill Village Pharmacy',
   'disp@roskillvillagepharmacy.co.nz',
   NOW(), NULL),

  ('st-lukes-medical-pharmacy-auckland',
   'St Lukes Medical Pharmacy',
   '52stlukespharmacy@gmail.com',
   NOW(), NULL),

  ('vaiola-pharmacy-auckland',
   'Vaiola Pharmacy',
   'pharmacyvaiola@gmail.com',
   NOW(), NULL),

  ('remuera-pharmacy-limited-auckland',
   'Remuera Pharmacy',
   'remuerapharmacy@gmail.com',
   NOW(), NULL),

  ('waiheke-unichem-pharmacy-auckland',
   'Waiheke Unichem Pharmacy',
   'Team@waihekepharmacy.co.nz',
   NOW(), NULL),

  ('life-pharmacy-st-lukes-auckland',
   'Life Pharmacy St Lukes',
   'dispensary.stlukes@lifepharmacy.co.nz',
   NOW(), NULL),

  ('ray-pharmacy-meadowbank-auckland',
   'Ray Pharmacy Meadowbank',
   'raypharmacy.meadowbank@gmail.com',
   NOW(), NULL),

  ('unichem-grey-lynn-pharmacy-auckland',
   'Unichem Grey Lynn Pharmacy',
   'dispensary@unichemgreylynn.co.nz',
   NOW(), NULL),

  ('woolworths-pharmacy-st-johns-auckland',
   'Woolworths Pharmacy St Johns',
   'stjohns.pharmacy@woolworths.co.nz',
   NOW(), NULL),

  ('unichem-st-heliers-pharmacy-auckland',
   'Unichem St Heliers Pharmacy',
   'unichemshmedical@gmail.com',
   NOW(), NULL),

  ('bargain-chemist-mt-wellington-auckland',
   'Bargain Chemist Mt Wellington',
   'mtwellington@bargainchemist.co.nz',
   NOW(), NULL),

  ('unichem-ostend-pharmacy-auckland',
   'Unichem Ostend Pharmacy',
   'Team@ostendpharmacy.co.nz',
   NOW(), NULL),

  ('greenlane-care-pharmacy-auckland',
   'Greenlane Care Pharmacy',
   'info@greenlanecarepharmacy.co.nz',
   NOW(), NULL),

  ('chemist-plus-auckland',
   'Chemist Plus',
   'info@chemistplus.co.nz',
   NOW(), NULL),

  -- ── Counties Manukau (south Auckland) ────────────────────────────────
  ('unichem-manukau-pharmacy-counties-manukau',
   'Unichem Manukau Pharmacy',
   'unichemmanukau@xtra.co.nz',
   NOW(), NULL),

  ('unichem-waiuku-medical-pharmacy-counties-manukau',
   'Unichem Waiuku Medical Pharmacy',
   'Rxwaiukumed@unichem.co.nz',
   NOW(), NULL),

  ('pharmacy-plus-counties-manukau',
   'Pharmacy Plus',
   'pharmacy_plus@hotmail.com',
   NOW(), NULL),

  ('gary-logan-pharmacy-limited-counties-manukau',
   'Gary Logan Pharmacy',
   'garyloganpharmacy@pharmacy2020.co.nz',
   NOW(), NULL),

  ('chemist-warehouse-auckland-airport-shopping-centre-counties-manukau',
   'Chemist Warehouse Auckland Airport Shopping Centre',
   'aucklandairportsc2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('newsham-park-pharmacy-counties-manukau',
   'Newsham Park Pharmacy',
   'rx@newshampharmacy.co.nz',
   NOW(), NULL),

  ('prohealth-manukau-pharmacy-counties-manukau',
   'ProHealth Manukau Pharmacy',
   'prescriptions.prohealthmanukau@outlook.co.nz',
   NOW(), NULL),

  ('chapel-park-pharmacy-counties-manukau',
   'Chapel Park Pharmacy',
   'chapelparkpharmacy158@gmail.com',
   NOW(), NULL),

  ('mangere-bridge-pharmacy-limited-counties-manukau',
   'Mangere Bridge Pharmacy',
   'mangerebridgepharmacy@pharmacygroup.nz',
   NOW(), NULL),

  ('papatoetoe-discount-pharmacy-auckland',
   'Papatoetoe Discount Pharmacy',
   'papatoetoepharmacy@gmail.com',
   NOW(), NULL),

  ('unichem-dannemora-pharmacy-counties-manukau',
   'Unichem Dannemora Pharmacy',
   'dannemorapharmacy@totem.nz',
   NOW(), NULL),

  ('unichem-takanini-pharmacy-counties-manukau',
   'Unichem Takanini Pharmacy',
   'Takaninipharmacy@totem.nz',
   NOW(), NULL),

  ('unichem-leabank-pharmacy-counties-manukau',
   'Unichem Leabank Pharmacy',
   'leabank@totem.nz',
   NOW(), NULL),

  ('unichem-pukekohe-pharmacy-counties-manukau',
   'Unichem Pukekohe Pharmacy',
   'dispensary@unichempukekohe.co.nz',
   NOW(), NULL),

  ('unichem-clevedon-road-pharmacy-counties-manukau',
   'Unichem Clevedon Road Pharmacy',
   'clevedonroadpharmacy@gmail.com',
   NOW(), NULL),

  ('chemist-warehouse-westfield-manukau-counties-manukau',
   'Chemist Warehouse Westfield Manukau',
   'manukau2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('flat-bush-medical-centre-pharmacy-auckland',
   'Flat Bush Medical Centre Pharmacy',
   'flatbushmedicalcentrepharmacy@gmail.com',
   NOW(), NULL),

  ('unichem-peter-boles-pharmacy-counties-manukau',
   'Unichem Peter Boles Pharmacy',
   'peterbolespharmacy@gmail.com',
   NOW(), NULL),

  ('unichem-hillpark-pharmacy-counties-manukau',
   'Unichem Hillpark Pharmacy',
   'hillpark@unichem.co.nz',
   NOW(), NULL),

  ('unichem-waiuku-pharmacy-counties-manukau',
   'Unichem Waiuku Pharmacy',
   'waiuku.dispensary@unichem.co.nz',
   NOW(), NULL),

  ('unichem-otara-pharmacy-counties-manukau',
   'Unichem Otara Pharmacy',
   'otarapharmacy@totem.nz',
   NOW(), NULL),

  ('life-pharmacy-papakura-counties-manukau',
   'Life Pharmacy Papakura',
   'dispensary@guyspharmacy.co.nz',
   NOW(), NULL),

  ('chemist-warehouse-hunters-plaza-counties-manukau',
   'Chemist Warehouse Hunters Plaza',
   'huntersplaza2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('mangere-pharmacy-counties-manukau',
   'Mangere Pharmacy',
   'dispensary@mangerepharmacy.co.nz',
   NOW(), NULL),

  ('the-pharmacy-manurewa-counties-manukau',
   'The Pharmacy Manurewa',
   'thepharmacymanurewa@gmail.com',
   NOW(), NULL),

  ('unichem-papakura-pharmacy-counties-manukau',
   'Unichem Papakura Pharmacy',
   'dispensary@unichempapakura.co.nz',
   NOW(), NULL),

  ('mangere-health-centre-pharmacy-counties-manukau',
   'Mangere Health Centre Pharmacy',
   'dispensary@mangerehealthcentrepharmacy.co.nz',
   NOW(), NULL),

  ('hunts-pharmacy-counties-manukau',
   'Hunts Pharmacy',
   'huntspharmacy@xtra.co.nz',
   NOW(), NULL),

  ('pahurehure-pharmacy-counties-manukau',
   'Pahurehure Pharmacy',
   'pahurehurechemist@gmail.com',
   NOW(), NULL),

  ('unichem-kolmar-pharmacy-counties-manukau',
   'Unichem Kolmar Pharmacy',
   'kolmarpharmacy@totem.nz',
   NOW(), NULL),

  ('unichem-gateway-pharmacy-counties-manukau',
   'Unichem Gateway Pharmacy',
   'takaninigateway@gmail.com',
   NOW(), NULL),

  ('seddon-pharmacy-counties-manukau',
   'Seddon Pharmacy',
   'seddonfax@gmail.com',
   NOW(), NULL),

  ('unichem-manurewa-pharmacy-counties-manukau',
   'Unichem Manurewa Pharmacy',
   'pharmacy@unichemmanurewa.co.nz',
   NOW(), NULL),

  ('mahia-road-pharmacy-counties-manukau',
   'Mahia Road Pharmacy',
   'mahiaroadpharmacy@yahoo.com',
   NOW(), NULL),

  ('st-george-pharmacy-counties-manukau',
   'St George Pharmacy',
   'sanjeet@pharmacy4all.co.nz',
   NOW(), NULL),

  ('manurewa-medical-centre-pharmacy-counties-manukau',
   'Manurewa Medical Centre Pharmacy',
   'manurewamedpharmacy@gmail.com',
   NOW(), NULL),

  ('highbrook-pharmacy-counties-manukau',
   'Highbrook Pharmacy',
   'highbrookpharmacy@gmail.com',
   NOW(), NULL),

  ('healthcare-pharmacy-clendon-counties-manukau',
   'Healthcare Pharmacy Clendon',
   'healthcarepharmacy@xtra.co.nz',
   NOW(), NULL),

  ('unichem-botany-pharmacy-counties-manukau',
   'Unichem Botany Pharmacy',
   'unichem.botany@gmail.com',
   NOW(), NULL),

  ('ibuy-pharmacy-counties-manukau',
   'Ibuy Pharmacy',
   'pharmacist@ibuypharmacy.co.nz',
   NOW(), NULL),

  ('unichem-mangere-medical-pharmacy-counties-manukau',
   'Unichem Mangere Medical Pharmacy',
   'mangere@unichem.co.nz',
   NOW(), NULL),

  ('cavendish-drive-pharmacy-counties-manukau',
   'Cavendish Drive Pharmacy',
   'shop@cavendishpharmacy.co.nz',
   NOW(), NULL),

  ('hill-road-pharmacy-counties-manukau',
   'Hill Road Pharmacy',
   'hillroadpharmacy@hotmail.com',
   NOW(), NULL),

  ('woolworths-pharmacy-waiata-shores-counties-manukau',
   'Woolworths Pharmacy Waiata Shores',
   'waiatashores.pharmacy@woolworths.co.nz',
   NOW(), NULL),

  ('east-tamaki-pharmacy-counties-manukau',
   'East Tamaki Pharmacy',
   'easttamakipharmacy@gmail.com',
   NOW(), NULL),

  ('wiri-health-pharmacy-counties-manukau',
   'Wiri Health Pharmacy',
   'info@wirihealthpharmacy.com',
   NOW(), NULL),

  ('liddells-pharmacy-counties-manukau',
   'Liddells Pharmacy',
   'dispensaryliddells@gmail.com',
   NOW(), NULL),

  ('chemist-warehouse-the-zone-counties-manukau',
   'Chemist Warehouse The Zone',
   'thezone2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('papakura-marae-pharmacy-counties-manukau',
   'Papakura Marae Pharmacy',
   'Pharmacy@papakuramarae.co.nz',
   NOW(), NULL),

  ('hunter-s-corner-medical-centre-pharmacy-counties-manukau',
   'Hunter''s Corner Medical Centre Pharmacy',
   'hunterpharmacy20@gmail.com',
   NOW(), NULL),

  ('chemist-warehouse-takanini-counties-manukau',
   'Chemist Warehouse Takanini',
   'takanini2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('counties-care-pharmacy-counties-manukau',
   'Counties Care Pharmacy',
   'ccpharm@xtra.co.nz',
   NOW(), NULL),

  ('jaks-pharmacy-counties-manukau',
   'Jaks Pharmacy',
   'jakspharm01@gmail.com',
   NOW(), NULL),

  ('pukekohe-south-pharmacy-counties-manukau',
   'Pukekohe South Pharmacy',
   'pspharmacy@outlook.co.nz',
   NOW(), NULL),

  ('the-capsule-pharmacy-counties-manukau',
   'The Capsule Pharmacy',
   'hello@thecapsule.co.nz',
   NOW(), NULL),

  ('dawson-road-pharmacy-counties-manukau',
   'Dawson Road Pharmacy',
   'office@dawsonroadpharmacy.co.nz',
   NOW(), NULL),

  ('clendon-discount-pharmacy-counties-manukau',
   'Clendon Discount Pharmacy',
   'clendonpharmacy@xtra.co.nz',
   NOW(), NULL),

  ('woolworths-pharmacy-pukekohe-south-counties-manukau',
   'Woolworths Pharmacy Pukekohe South',
   'pukekohe.pharmacy@woolworths.co.nz',
   NOW(), NULL),

  ('airport-oaks-pharmacy-counties-manukau',
   'Airport Oaks Pharmacy',
   'Dispensary@airportoakspharmacy.com',
   NOW(), NULL),

  ('your-health-centre-pharmacy-counties-manukau',
   'Your Health Centre Pharmacy',
   'yourhealthpharmacy@xtra.co.nz',
   NOW(), NULL),

  ('unichem-browns-road-pharmacy-counties-manukau',
   'Unichem Browns Road Pharmacy',
   'brownspharmacy@totem.nz',
   NOW(), NULL),

  ('turuki-pharmacy-counties-manukau',
   'Turuki Pharmacy',
   'turukipharmacy@gmail.com',
   NOW(), NULL),

  ('pukekohe-plaza-pharmacy-counties-manukau',
   'Pukekohe Plaza Pharmacy',
   'dispensary@plazapharmacy.co.nz',
   NOW(), NULL),

  ('unichem-takanini-village-pharmacy-counties-manukau',
   'Unichem Takanini Village Pharmacy',
   'Takaninivillagepharmacy@totem.nz',
   NOW(), NULL),

  ('bakerfield-chemist-2000-limited-counties-manukau',
   'Bakerfield Chemist',
   'bakerfieldchemist@gmail.com',
   NOW(), NULL),

  ('unichem-papatoetoe-pharmacy-counties-manukau',
   'Unichem Papatoetoe Pharmacy',
   'unichem@papatoetoepharmacy.co.nz',
   NOW(), NULL),

  ('weymouth-whanau-pharmacy-counties-manukau',
   'Weymouth Whanau Pharmacy',
   'whanaupharmacy@gmail.com',
   NOW(), NULL),

  ('chemist-warehouse-flat-bush-counties-manukau',
   'Chemist Warehouse Flat Bush',
   'flatbush2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('chemist-warehouse-ormiston-counties-manukau',
   'Chemist Warehouse Ormiston',
   'ormiston2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('woolworths-pharmacy-takanini-auckland',
   'Woolworths Pharmacy Takanini',
   'takanini.pharmacy@woolworths.co.nz',
   NOW(), NULL),

  ('manukau-medical-pharmacy-counties-manukau',
   'Manukau Medical Pharmacy',
   'manukaumedpharmacy@gmail.com',
   NOW(), NULL),

  ('ormiston-kiwi-chemist-counties-manukau',
   'Ormiston Kiwi Chemist',
   'ormiston@kiwichemist.co.nz',
   NOW(), NULL),

  ('unichem-bairds-pharmacy-counties-manukau',
   'Unichem Bairds Pharmacy',
   'Bairdspharmacy@totem.nz',
   NOW(), NULL),

  ('chemist-warehouse-ronwood-centre-counties-manukau',
   'Chemist Warehouse Ronwood Centre',
   'ronwoodcentre2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('health-plus-pharmacy-counties-manukau',
   'Health Plus Pharmacy',
   'healthplusprescriptions@gmail.com',
   NOW(), NULL),

  ('bargain-chemist-pukekohe-counties-manukau',
   'Bargain Chemist Pukekohe',
   'pukekohe@bargainchemist.co.nz',
   NOW(), NULL),

  ('graeme-avenue-pharmacy-counties-manukau',
   'Graeme Avenue Pharmacy',
   'graemeave786@gmail.com',
   NOW(), NULL),

  ('life-pharmacy-manukau-counties-manukau',
   'Life Pharmacy Manukau',
   'dispensary.manukau@lifepharmacy.co.nz',
   NOW(), NULL),

  ('unichem-botany-junction-pharmacy-counties-manukau',
   'Unichem Botany Junction Pharmacy',
   'unichembjp@gmail.com',
   NOW(), NULL),

  ('chemist-warehouse-pukekohe-town-centre-counties-manukau',
   'Chemist Warehouse Pukekohe Town Centre',
   'pukekohetown2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('bargain-chemist-manukau-counties-manukau',
   'Bargain Chemist Manukau',
   'manukau@bargainchemist.co.nz',
   NOW(), NULL),

  ('unichem-karaka-pharmacy-counties-manukau',
   'Unichem Karaka Pharmacy',
   'dispensary@karakapharmacy.co.nz',
   NOW(), NULL),

  ('john-hogg-pharmacy-2015-limited-counties-manukau',
   'John Hogg Pharmacy',
   'johnhoggphcy@xtra.co.nz',
   NOW(), NULL),

  ('southmall-pharmacy-counties-manukau',
   'Southmall Pharmacy',
   'dispensary@southmallpharmacy.co.nz',
   NOW(), NULL),

  ('unichem-mangere-east-pharmacy-counties-manukau',
   'Unichem Mangere East Pharmacy',
   'Mangereeastpharmacy@totem.nz',
   NOW(), NULL),

  ('unichem-mangere-pharmacy-counties-manukau',
   'Unichem Mangere Pharmacy',
   'mangerepharmacy@totem.nz',
   NOW(), NULL),

  -- ── Waikato ───────────────────────────────────────────────────────────
  ('unichem-coromandel-pharmacy-waikato',
   'Unichem Coromandel Pharmacy',
   'rx@coromandelpharmacy.co.nz',
   NOW(), NULL),

  ('unichem-tokoroa-pharmacy-waikato',
   'Unichem Tokoroa Pharmacy',
   'rxleith@tokoroapharmacy.nz',
   NOW(), NULL),

  ('chemist-warehouse-centre-place-waikato',
   'Chemist Warehouse Centre Place',
   'centreplace2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('barron-s-pharmacy-waikato',
   'Barron''s Pharmacy',
   'rx@barronspharmacy.co.nz',
   NOW(), NULL),

  ('northcare-pukete-pharmacy-waikato',
   'Northcare Pukete Pharmacy',
   'faxnorthcare@gmail.com',
   NOW(), NULL),

  ('hamilton-east-pharmacy-waikato',
   'Hamilton East Pharmacy',
   'pharmacy@hep.co.nz',
   NOW(), NULL),

  ('sanders-pharmacy-waikato',
   'Sanders Pharmacy',
   'scripts@sanderspharmacy.co.nz',
   NOW(), NULL),

  ('unichem-marshalls-medical-pharmacy-waikato',
   'Unichem Marshalls Medical Pharmacy',
   'medical@marshallspharmacy.co.nz',
   NOW(), NULL),

  ('unichem-health-centre-pharmacy-waikato',
   'Unichem Health Centre Pharmacy',
   'rxhosp@tokoroapharmacy.nz',
   NOW(), NULL),

  ('unichem-morrinsville-pharmacy-waikato',
   'Unichem Morrinsville Pharmacy',
   'dispensary@unichemmps.co.nz',
   NOW(), NULL),

  ('horsham-downs-pharmacy-waikato',
   'Horsham Downs Pharmacy',
   'Pharmacyhorsham@gmail.com',
   NOW(), NULL),

  ('unichem-matamata-pharmacy-waikato',
   'Unichem Matamata Pharmacy',
   'unichem@lifematamata.co.nz',
   NOW(), NULL),

  ('unichem-otorohanga-pharmacy-waikato',
   'Unichem Otorohanga Pharmacy',
   'dispensary@otorohangapharmacy.co.nz',
   NOW(), NULL),

  ('unichem-hamilton-pharmacy-waikato',
   'Unichem Hamilton Pharmacy',
   'dispensary@unichemhamilton.co.nz',
   NOW(), NULL),

  ('west-hamilton-pharmacy-waikato',
   'West Hamilton Pharmacy',
   'westhamiltonpharmacy01@gmail.com',
   NOW(), NULL),

  ('unichem-davies-corner-pharmacy-waikato',
   'Unichem Davies Corner Pharmacy',
   'scripts.daviescorner@unichem.co.nz',
   NOW(), NULL),

  ('family-health-pharmacy-counties-manukau',
   'Family Health Pharmacy',
   'tuakauchemist@gmail.com',
   NOW(), NULL),

  ('unichem-cambridge-medical-pharmacy-waikato',
   'Unichem Cambridge Medical Pharmacy',
   'medcentre@cambridge.unichem.co.nz',
   NOW(), NULL),

  ('frontier-pharmacy-waikato',
   'Frontier Pharmacy',
   'dispensary@frontierpharmacy.co.nz',
   NOW(), NULL),

  ('five-crossroads-pharmacy-waikato',
   'Five Crossroads Pharmacy',
   'pharmacy5xrds@gmail.com',
   NOW(), NULL),

  ('tui-pharmacy-parkwood-waikato',
   'Tui Pharmacy Parkwood',
   'parkwooddispensary@tuipharmacy.co.nz',
   NOW(), NULL),

  ('pollen-street-pharmacy-waikato',
   'Pollen Street Pharmacy',
   'rx@pollenpharmacy.co.nz',
   NOW(), NULL),

  ('woolworths-pharmacy-te-rapa-waikato',
   'Woolworths Pharmacy Te Rapa',
   'terapa.pharmacy@woolworths.co.nz',
   NOW(), NULL),

  ('unichem-whangamata-pharmacy-waikato',
   'Unichem Whangamata Pharmacy',
   'unichemwhangamata@gmail.com',
   NOW(), NULL),

  ('huntly-pharmacy-limited-waikato',
   'Huntly Pharmacy',
   'huntlypharmacy@xtra.co.nz',
   NOW(), NULL),

  ('goldfields-pharmacy-and-photo-centre-waikato',
   'Goldfields Pharmacy and Photo Centre',
   'prescriptions@goldfieldspharmacy.co.nz',
   NOW(), NULL),

  ('unichem-glenview-pharmacy-waikato',
   'Unichem Glenview Pharmacy',
   'dispensary@unichemglenview.co.nz',
   NOW(), NULL),

  ('mercury-bay-pharmacy-waikato',
   'Mercury Bay Pharmacy',
   'mbpharmacyrx@gmail.com',
   NOW(), NULL),

  ('tui-pharmacy-borman-road-waikato',
   'Tui Pharmacy Borman Road',
   'bormandispensary@tuipharmacy.co.nz',
   NOW(), NULL),

  ('frankton-pharmacy-waikato',
   'Frankton Pharmacy',
   'dispensary@franktonpharmacy.co.nz',
   NOW(), NULL),

  ('unichem-marshalls-pharmacy-waikato',
   'Unichem Marshalls Pharmacy',
   'pharmacy@marshallspharmacy.co.nz',
   NOW(), NULL),

  ('unichem-cambridge-pharmacy-waikato',
   'Unichem Cambridge Pharmacy',
   'dispensary@cambridge.unichem.co.nz',
   NOW(), NULL),

  ('unichem-dinsdale-pharmacy-waikato',
   'Unichem Dinsdale Pharmacy',
   'dinsdalepharmacy@totem.nz',
   NOW(), NULL),

  ('campus-pharmacy-waikato-waikato',
   'Campus Pharmacy Waikato',
   'campuspharmacywaikato@gmail.com',
   NOW(), NULL),

  ('avalon-pharmacy-waikato',
   'Avalon Pharmacy',
   'dispensary.avalon@gmail.com',
   NOW(), NULL),

  ('te-awamutu-pharmacy-limited-waikato',
   'Te Awamutu Pharmacy',
   'scripts@teawamutupharmacy.co.nz',
   NOW(), NULL),

  ('unichem-te-kuiti-pharmacy-waikato',
   'Unichem Te Kuiti Pharmacy',
   'utkpharmacy@gmail.com',
   NOW(), NULL),

  ('te-kauwhata-pharmacy-2017-limited-waikato',
   'Te Kauwhata Pharmacy',
   'tekauwhatapharmacy17@gmail.com',
   NOW(), NULL),

  ('chemist-warehouse-chartwell-waikato',
   'Chemist Warehouse Chartwell',
   'chartwell2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('life-pharmacy-chartwell-waikato',
   'Life Pharmacy Chartwell',
   'dispensary.chartwell@lifepharmacy.co.nz',
   NOW(), NULL),

  ('hillcrest-healthcare-pharmacy-waikato',
   'Hillcrest Healthcare Pharmacy',
   'dispensary@hillcrestpharmacy.co.nz',
   NOW(), NULL),

  ('clark-s-pharmacy-limited-waikato',
   'Clark''s Pharmacy',
   'scripts@clarkspharmacy.co.nz',
   NOW(), NULL),

  ('northcare-thomas-rd-pharmacy-waikato',
   'Northcare Thomas Rd Pharmacy',
   'thomas.rd.pharmacy@gmail.com',
   NOW(), NULL),

  ('life-pharmacy-matamata-waikato',
   'Life Pharmacy Matamata',
   'dispensary@lifematamata.co.nz',
   NOW(), NULL),

  ('roberts-ngaruawahia-pharmacy-waikato',
   'Roberts Ngaruawahia Pharmacy',
   'robertspharmacy@xtra.co.nz',
   NOW(), NULL),

  ('ngatea-feelgood-pharmacy-waikato',
   'Ngatea Feelgood Pharmacy',
   'dispensary@ngateapharmacy.co.nz',
   NOW(), NULL),

  -- Shared email with Roberts Ngaruawahia Pharmacy (same operator)
  ('ngaruawahia-pharmacy-waikato',
   'Ngaruawahia Pharmacy',
   'robertspharmacy@xtra.co.nz',
   NOW(), NULL),

  -- Shared operator email with Unichem Glenview Pharmacy (Glenview Pharmacy Ltd)
  ('unichem-glenview-medical-pharmacy-waikato',
   'Unichem Glenview Medical Pharmacy',
   'dispensary@unichemglenview.co.nz',
   NOW(), NULL),

  ('woolworths-pharmacy-rototuna-waikato',
   'Woolworths Pharmacy Rototuna',
   'rototuna.pharmacy@woolworths.co.nz',
   NOW(), NULL),

  ('pokeno-pharmacy-counties-manukau',
   'Pokeno Pharmacy',
   'dispensary@pokenopharmacy.co.nz',
   NOW(), NULL),

  ('unichem-tuakau-pharmacy-counties-manukau',
   'Unichem Tuakau Pharmacy',
   'tuakaudispensary@gmail.com',
   NOW(), NULL),

  ('south-city-health-pharmacy-2012-limited-waikato',
   'South City Health Pharmacy',
   'prescriptions@southcitypharmacy.co.nz',
   NOW(), NULL),

  ('comins-pharmacy-limited-waikato',
   'Comins Pharmacy',
   'cominsp@xtra.co.nz',
   NOW(), NULL),

  ('te-aroha-pharmacy-waikato',
   'Te Aroha Pharmacy',
   'dispensary@tearohapharmacy.co.nz',
   NOW(), NULL),

  ('unichem-thames-pharmacy-waikato',
   'Unichem Thames Pharmacy',
   'unichemthames.rx@xtra.co.nz',
   NOW(), NULL),

  ('westend-pharmacy-waikato',
   'Westend Pharmacy',
   'Info@westendpharmacy.nz',
   NOW(), NULL),

  ('unichem-rototuna-pharmacy-waikato',
   'Unichem Rototuna Pharmacy',
   'dispensary.rototuna@unichem.co.nz',
   NOW(), NULL),

  ('woolworths-pharmacy-claudelands-waikato',
   'Woolworths Pharmacy Claudelands',
   'claudelands.pharmacy@woolworths.co.nz',
   NOW(), NULL),

  ('pharmacy-547-waikato',
   'Pharmacy 547',
   'fax@pharmacy547.co.nz',
   NOW(), NULL),

  ('tui-pharmacy-te-rapa-limited-waikato',
   'Tui Pharmacy Te Rapa',
   'terapadispensary@tuipharmacy.co.nz',
   NOW(), NULL),

  ('unichem-tamahere-pharmacy-waikato',
   'Unichem Tamahere Pharmacy',
   'dispensary@tamaherepharmacy.co.nz',
   NOW(), NULL),

  ('anglesea-pharmacy-waikato',
   'Anglesea Pharmacy',
   'dispensary@angleseapharmacy.co.nz',
   NOW(), NULL),

  ('tui-pharmacy-central-waikato',
   'Tui Pharmacy Central',
   'centraldispensary@tuipharmacy.co.nz',
   NOW(), NULL),

  ('unichem-stephensons-pharmacy-waikato',
   'Unichem Stephensons Pharmacy',
   'stephensons.unichem@gmail.com',
   NOW(), NULL),

  ('huntly-west-pharmacy-waikato',
   'Huntly West Pharmacy',
   'script@huntlywestpharmacy.co.nz',
   NOW(), NULL),

  ('unichem-grey-street-pharmacy-waikato',
   'Unichem Grey Street Pharmacy',
   'greystpharmacy@gmail.com',
   NOW(), NULL),

  ('whangamata-pharmacy-waikato',
   'Whangamata Pharmacy',
   'dispensary@whangamatapharmacy.co.nz',
   NOW(), NULL),

  ('unichem-putaruru-pharmacy-waikato',
   'Unichem Putaruru Pharmacy',
   'putdispensary@gmail.com',
   NOW(), NULL),

  ('fairfield-pharmacy-waikato',
   'Fairfield Pharmacy',
   'faxfairfield@gmail.com',
   NOW(), NULL),

  ('bargain-chemist-te-awamutu-waikato',
   'Bargain Chemist Te Awamutu',
   'teawamutu@bargainchemist.co.nz',
   NOW(), NULL),

  ('woolworths-pharmacy-cambridge-waikato',
   'Woolworths Pharmacy Cambridge',
   'cambridge.pharmacy@woolworths.co.nz',
   NOW(), NULL),

  ('unichem-family-health-pharmacy-waikato',
   'Unichem Family Health Pharmacy',
   'dispensary@familyhealth.unichem.co.nz',
   NOW(), NULL),

  ('unichem-beerescourt-pharmacy-waikato',
   'Unichem Beerescourt Pharmacy',
   'bcourtpharmacy@xtra.co.nz',
   NOW(), NULL),

  ('unichem-flagstaff-pharmacy-waikato',
   'Unichem Flagstaff Pharmacy',
   'pharmacy@flagstaffpharmacy.co.nz',
   NOW(), NULL),

  ('unichem-paeroa-pharmacy-waikato',
   'Unichem Paeroa Pharmacy',
   'dispensary@paeroapharmacy.co.nz',
   NOW(), NULL),

  ('unichem-huntly-pharmacy-waikato',
   'Unichem Huntly Pharmacy',
   'dispensary.huntly@unichem.co.nz',
   NOW(), NULL),

  ('chemist-warehouse-cambridge-waikato',
   'Chemist Warehouse Cambridge',
   'cambridge2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('raglan-pharmacy-waikato',
   'Raglan Pharmacy',
   'raglandispensary@gmail.com',
   NOW(), NULL),

  ('nga-hua-pharmacy-waikato',
   'Nga Hua Pharmacy',
   'dispensary@ngahuapharmacy.co.nz',
   NOW(), NULL),

  ('vercoe-road-pharmacy-waikato',
   'Vercoe Road Pharmacy',
   'ehpharmacy@gmail.com',
   NOW(), NULL),

  ('chemist-warehouse-the-base-waikato',
   'Chemist Warehouse - The Base',
   'thebase2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('tairua-pauanui-pharmacy-limited-waikato',
   'Tairua-Pauanui Pharmacy',
   'disp.tairuapauanuipharmacy@gmail.com',
   NOW(), NULL),

  ('unichem-taumarunui-pharmacy-waikato',
   'Unichem Taumarunui Pharmacy',
   'dispensary@taumarunuipharmacy.co.nz',
   NOW(), NULL),

  ('unichem-leamington-pharmacy-waikato',
   'Unichem Leamington Pharmacy',
   'dispensary@leamingtonpharmacy.co.nz',
   NOW(), NULL),

  ('thames-centre-pharmacy-waikato',
   'Thames Centre Pharmacy',
   'pharmacist@thamescentrepharmacy.co.nz',
   NOW(), NULL),

  ('horotiu-hauora-pharmacy-waikato',
   'Horotiu Hauora Pharmacy',
   'horotiupharmacy@gmail.com',
   NOW(), NULL),

  ('nawton-pharmacy-waikato',
   'Nawton Pharmacy',
   'fax@nawtonpharmacy.co.nz',
   NOW(), NULL),

  -- ── Bay of Plenty ───────────────────────────────────────────────────
  ('mount-pharmacy-bay-of-plenty',
   'Mount Pharmacy',
   'rainy.d@xtra.co.nz',
   NOW(), NULL),

  ('tara-road-pharmacy-bay-of-plenty',
   'Tara Road Pharmacy',
   'admin@tararoadpharmacy.co.nz',
   NOW(), NULL),

  ('unichem-greerton-pharmacy-bay-of-plenty',
   'Unichem Greerton Pharmacy',
   'greerton@baypharmacies.co.nz',
   NOW(), NULL),

  ('waihi-beach-chemist-bay-of-plenty',
   'Waihi Beach Chemist',
   'scripts@waihi-beach-chemist.co.nz',
   NOW(), NULL),

  ('ktown-pharmacy-bay-of-plenty',
   'KTown Pharmacy',
   'staffktownpharmacy1@yahoo.com',
   NOW(), NULL),

  ('phoenix-pharmacy-2001-limited-bay-of-plenty',
   'Phoenix Pharmacy',
   'info@phoenixpharmacy.co.nz',
   NOW(), NULL),

  ('church-street-dispensary-bay-of-plenty',
   'Church Street Dispensary',
   'dispensary@churchstreetdispensary.co.nz',
   NOW(), NULL),

  ('unichem-metro-pharmacy-bethlehem-bay-of-plenty',
   'Unichem Metro Pharmacy Bethlehem',
   'Bethlehem.metro@unichem.co.nz',
   NOW(), NULL),

  ('chemist-warehouse-bayfair-bay-of-plenty',
   'Chemist Warehouse Bayfair',
   'bayfair2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('ohope-beach-pharmacy-bay-of-plenty',
   'Ohope Beach Pharmacy',
   'staffohopepharmacy@yahoo.com',
   NOW(), NULL),

  ('chemist-warehouse-bethlehem-bay-of-plenty',
   'Chemist Warehouse - Bethlehem',
   'bethlehem2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('unichem-katikati-pharmacy-bay-of-plenty',
   'Unichem Katikati Pharmacy',
   'erx.katikatiunichem@outlook.com',
   NOW(), NULL),

  ('unichem-fifth-avenue-pharmacy-bay-of-plenty',
   'Unichem Fifth Avenue Pharmacy',
   'fifthavepharmacy@faulkners.co.nz',
   NOW(), NULL),

  ('unichem-katikati-health-pharmacy-bay-of-plenty',
   'Unichem Katikati Health Pharmacy',
   'erx.healthcentrepharmkati@outlook.com',
   NOW(), NULL),

  ('john-s-photo-pharmacy-bay-of-plenty',
   'John''s Photo Pharmacy',
   'scripts@jpp.co.nz',
   NOW(), NULL),

  ('unichem-chadwick-pharmacy-bay-of-plenty',
   'Unichem Chadwick Pharmacy',
   'chadwick@baypharmacies.co.nz',
   NOW(), NULL),

  ('woolworths-pharmacy-fraser-cove-bay-of-plenty',
   'Woolworths Pharmacy Fraser Cove',
   'frasercove.pharmacy@woolworths.co.nz',
   NOW(), NULL),

  ('life-pharmacy-bayfair-bay-of-plenty',
   'Life Pharmacy Bayfair',
   'bayfair@lifepharmacy.co.nz',
   NOW(), NULL),

  ('unichem-papamoa-pharmacy-bay-of-plenty',
   'Unichem Papamoa Pharmacy',
   'unichem@papamoapharmacy.com',
   NOW(), NULL),

  ('opotiki-pharmacy-bay-of-plenty',
   'Opotiki Pharmacy',
   'dispensary@opotikipharmacy.co.nz',
   NOW(), NULL),

  ('mypharmacy-te-puke-bay-of-plenty',
   'MyPharmacy Te Puke',
   'mypharmacytepuke@baypharmacies.co.nz',
   NOW(), NULL),

  ('pyes-pa-pharmacy-bay-of-plenty',
   'Pyes Pa Pharmacy',
   'admin@pyespapharmacy.co.nz',
   NOW(), NULL),

  ('welcome-bay-pharmacy-limited-bay-of-plenty',
   'Welcome Bay Pharmacy',
   'prescriptions@welcomebaypharmacy.co.nz',
   NOW(), NULL),

  ('unichem-otumoetai-pharmacy-bay-of-plenty',
   'Unichem Otumoetai Pharmacy',
   'otumoetai@baypharmacies.co.nz',
   NOW(), NULL),

  ('unichem-brookfield-pharmacy-bay-of-plenty',
   'Unichem Brookfield Pharmacy',
   'brookfield.dispensary@unichem.co.nz',
   NOW(), NULL),

  ('gate-pa-village-pharmacy-bay-of-plenty',
   'Gate Pa Village Pharmacy',
   'dispensary@gpvip.co.nz',
   NOW(), NULL),

  ('unichem-kope-pharmacy-bay-of-plenty',
   'Unichem Kope Pharmacy',
   'kope@unichem.co.nz',
   NOW(), NULL),

  ('unichem-total-health-pharmacy-bay-of-plenty',
   'Unichem Total Health Pharmacy',
   'whakatanepharmacy@gmail.com',
   NOW(), NULL),

  ('bureta-pharmacy-limited-bay-of-plenty',
   'Bureta Pharmacy',
   'buretapharmacy@xtra.co.nz',
   NOW(), NULL),

  ('kawerau-pharmacy-bay-of-plenty',
   'Kawerau Pharmacy',
   'dispensary@kaweraupharmacy.co.nz',
   NOW(), NULL),

  ('bongards-pharmacy-bay-of-plenty',
   'Bongards Pharmacy',
   'bongardspharmacy@xtra.co.nz',
   NOW(), NULL),

  ('unichem-cherrywood-pharmacy-bay-of-plenty',
   'Unichem Cherrywood Pharmacy',
   'cherrywood@baypharmacies.co.nz',
   NOW(), NULL),

  ('maunganui-road-pharmacy-limited-bay-of-plenty',
   'Maunganui Road Pharmacy',
   'maunganuiroadpharmacy@gmail.com',
   NOW(), NULL),

  ('life-pharmacy-tauranga-bay-of-plenty',
   'Life Pharmacy Tauranga',
   'tauranga@lifepharmacy.co.nz',
   NOW(), NULL),

  ('my-pharmacy-whitiora-health-centre-bay-of-plenty',
   'My Pharmacy Palm Springs',
   'palmsprings@mypharmacy.nz',
   NOW(), NULL),

  ('tarawera-pharmacy-limited-bay-of-plenty',
   'Tarawera Pharmacy',
   'pharmacy@tarawera-pharmacy.co.nz',
   NOW(), NULL),

  ('unichem-fifteenth-avenue-pharmacy-bay-of-plenty',
   'Unichem Fifteenth Avenue Pharmacy',
   'unichemonfifteenth@gmail.com',
   NOW(), NULL),

  ('bethlehem-pharmacy-bay-of-plenty',
   'Bethlehem Pharmacy',
   'admin@bethlehempharmacy.co.nz',
   NOW(), NULL),

  ('te-puna-pharmacy-bay-of-plenty',
   'Te Puna Pharmacy',
   'dispensary@tepunapharmacy.co.nz',
   NOW(), NULL),

  ('omokoroa-pharmacy-bay-of-plenty',
   'Omokoroa Pharmacy',
   'dispensary@omokpharmacy.co.nz',
   NOW(), NULL),

  ('mypharmacy-the-avenues-bay-of-plenty',
   'MyPharmacy The Avenues',
   'pharmacycentralmed@eol.co.nz',
   NOW(), NULL),

  ('chemist-warehouse-cameron-road-bay-of-plenty',
   'Chemist Warehouse Cameron Road',
   'cameronroad2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('woolworths-pharmacy-bayfair-bay-of-plenty',
   'Woolworths Pharmacy Bayfair',
   'bayfair.pharmacy@woolworths.co.nz',
   NOW(), NULL),

  ('your-pharmacy-mount-maunganui-bay-of-plenty',
   'Your Pharmacy Mount Maunganui',
   'rx@yourpharmacy.nz',
   NOW(), NULL),

  ('the-crossing-pharmacy-bay-of-plenty',
   'The Crossing Pharmacy',
   'hello@thecrossingpharmacy.co.nz',
   NOW(), NULL),

  ('chemist-warehouse-fraser-cove-bay-of-plenty',
   'Chemist Warehouse Fraser Cove',
   'frasercove2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('pharmacy-on-cameron-bay-of-plenty',
   'Pharmacy On Cameron',
   'poc@pharmacyservices.co.nz',
   NOW(), NULL),

  ('central-parade-dee-st-pharmacy-limited-bay-of-plenty',
   'Central Parade & Dee St Pharmacy',
   'centralparadepharmacy@xtra.co.nz',
   NOW(), NULL),

  ('maungatapu-pharmacy-bay-of-plenty',
   'Maungatapu Pharmacy',
   'maungatapupharmacy@outlook.com',
   NOW(), NULL),

  ('downtown-pharmacy-mt-maunganui-bay-of-plenty',
   'Downtown Pharmacy Mt Maunganui',
   'downtownpharmacy152@gmail.com',
   NOW(), NULL),

  ('my-pharmacy-papamoa-plaza-bay-of-plenty',
   'My Pharmacy - Papamoa Plaza',
   'papamoaplaza@mypharmacy.nz',
   NOW(), NULL),

  ('edgecumbe-pharmacy-bay-of-plenty',
   'Edgecumbe Pharmacy',
   'edgecumbep@xtra.co.nz',
   NOW(), NULL),

  ('life-pharmacy-te-puke-bay-of-plenty',
   'Life Pharmacy Te Puke',
   'lifetepuke@baypharmacies.co.nz',
   NOW(), NULL),

  ('james-village-pharmacy-bay-of-plenty',
   'James Village Pharmacy',
   'Script@JVPharmacy.co.nz',
   NOW(), NULL),

  ('unichem-adamson-s-pharmacy-bay-of-plenty',
   'Unichem Adamson''s Pharmacy',
   'adamsons@unichem.co.nz',
   NOW(), NULL),

  ('bay-health-pharmacy-bay-of-plenty',
   'Bay Health Pharmacy',
   'bayhealthpharmacy@xtra.co.nz',
   NOW(), NULL),

  ('pharmacy-257-bay-of-plenty',
   'Pharmacy 257',
   'eifohealthcare@gmail.com',
   NOW(), NULL),

  ('unichem-excelsa-pharmacy-bay-of-plenty',
   'Unichem Excelsa Pharmacy',
   'unichemexcelsa@baypharmacies.co.nz',
   NOW(), NULL),

  -- ── Lakes / Rotorua-Taupō ───────────────────────────────────────────
  ('unichem-pharmacy-81-lakes',
   'Unichem Pharmacy 81',
   'p81@mainstreettaupo.co.nz',
   NOW(), NULL),

  ('pharmacy-westend-lakes',
   'Pharmacy Westend',
   'pharmacy.westend@xtra.co.nz',
   NOW(), NULL),

  ('unichem-central-pharmacy-rotorua-lakes',
   'Unichem Central Pharmacy Rotorua',
   'clickpharmacy@gmail.com',
   NOW(), NULL),

  ('woolworths-pharmacy-rotorua-lakes',
   'Woolworths Pharmacy Rotorua',
   'rotorua.pharmacy@woolworths.co.nz',
   NOW(), NULL),

  ('unichem-turangi-pharmacy-lakes',
   'Unichem Turangi Pharmacy',
   'dispensary@unichemturangi.co.nz',
   NOW(), NULL),

  ('unichem-mainstreet-pharmacy-lakes',
   'Unichem Mainstreet Pharmacy',
   'info@mainstreettaupo.co.nz',
   NOW(), NULL),

  ('tiaho-pharmacy-rotorua-lakes',
   'Tiaho Pharmacy Rotorua',
   'tiahodispensary@gmail.com',
   NOW(), NULL),

  ('te-ngae-pharmacy-lakes',
   'Te Ngae Pharmacy',
   'tengaepharmacy@xtra.co.nz',
   NOW(), NULL),

  ('ranolf-pharmacy-lakes',
   'Ranolf Pharmacy',
   'ranolfdispensary@gmail.com',
   NOW(), NULL),

  ('ngongotaha-pharmacy-limited-lakes',
   'Ngongotaha Pharmacy',
   'prescriptions@ngopharm.co.nz',
   NOW(), NULL),

  ('chemist-warehouse-rotorua-lakes',
   'Chemist Warehouse Rotorua',
   'rotorua2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('hinemoa-pharmacy-lakes',
   'Hinemoa Pharmacy',
   'prescriptions@hinemoapharmacy.co.nz',
   NOW(), NULL),

  ('lakes-care-pharmacy-lakes',
   'Lakes Care Pharmacy',
   'lakescaredispensary@gmail.com',
   NOW(), NULL),

  ('life-pharmacy-taupo-lakes',
   'Life Pharmacy Taupo',
   'taupo@lifepharmacy.co.nz',
   NOW(), NULL),

  ('unichem-fairy-springs-pharmacy-lakes',
   'Unichem Fairy Springs Pharmacy',
   'fairyspringspharmacy@xtra.co.nz',
   NOW(), NULL),

  ('western-heights-pharmacy-lakes',
   'Western Heights Pharmacy',
   'prescriptions@whp.co.nz',
   NOW(), NULL),

  ('chemist-warehouse-taupo-lakes',
   'Chemist Warehouse Taupo',
   'taupo2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('owhata-medical-centre-pharmacy-lakes',
   'Owhata Medical Centre Pharmacy',
   'owhatamcpharmacy@xtra.co.nz',
   NOW(), NULL),

  -- ── Tairāwhiti / Gisborne ─────────────────────────────────────────────
  -- Gordon's Pharmacy operates satellite pickups along the East Coast (Te Araroa,
  -- Te Puia Springs, Hicks Bay). All satellites share rxorders@gordonspharmacy.co.nz.
  ('gordon-s-pharmacy-tair-whiti',
   'Gordon''s Pharmacy',
   'rxorders@gordonspharmacy.co.nz',
   NOW(), NULL),

  ('pharmacy-three-rivers-tair-whiti',
   'Pharmacy Three Rivers',
   'dispensary@pharmacy3rivers.co.nz',
   NOW(), NULL),

  ('sean-shivnan-pharmacy-limited-tair-whiti',
   'Sean Shivnan Pharmacy',
   'seanshivnanpharm@gmail.com',
   NOW(), NULL),

  -- Bramwells register entry lists 232 Gladstone Rd Gisborne, but the dispensary
  -- also operates from Rangatira Motors, 59 Cliff Rd (shared script inbox).
  ('unichem-bramwells-pharmacy-tair-whiti',
   'Unichem Bramwells Pharmacy',
   'scripts@bramwellspharmacy.co.nz',
   NOW(), NULL),

  ('horouta-pharmacy-tair-whiti',
   'Horouta Pharmacy',
   'rx@horoutapharmacy.com',
   NOW(), NULL),

  ('pharmacy-53-tair-whiti',
   'Pharmacy 53',
   'dispensary@pharmacy53.co.nz',
   NOW(), NULL),

  ('rauru-pharmacy-tair-whiti',
   'Rauru Pharmacy',
   'rx@raurupharmacy.com',
   NOW(), NULL),

  -- ── Taranaki ──────────────────────────────────────────────────────────
  ('woolworths-pharmacy-spotswood-taranaki',
   'Woolworths Pharmacy Spotswood',
   'spotswood.pharmacy@woolworths.co.nz',
   NOW(), NULL),

  ('robertsons-strandon-pharmacy-taranaki',
   'Robertsons Strandon Pharmacy',
   'strandon@robertsonspharmacy.co.nz',
   NOW(), NULL),

  ('mountainview-pharmacy-taranaki',
   'Mountainview Pharmacy',
   'mountainviewpharmacy@hotmail.com',
   NOW(), NULL),

  ('vivian-pharmacy-limited-taranaki',
   'Vivian Pharmacy',
   'dispensary@vivianpharmacy.co.nz',
   NOW(), NULL),

  ('stratford-pharmacy-taranaki',
   'Stratford Pharmacy',
   'dispensary@stratfordpharmacy.co.nz',
   NOW(), NULL),

  ('chemist-warehouse-the-valley-taranaki',
   'Chemist Warehouse The Valley',
   'thevalley2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('oakura-pharmacy-taranaki',
   'Oakura Pharmacy',
   'dispensary@oakurapharmacy.co.nz',
   NOW(), NULL),

  ('unichem-mackays-pharmacy-taranaki',
   'Unichem Mackays Pharmacy',
   'mackays.pharmacy@xtra.co.nz',
   NOW(), NULL),

  ('bargain-chemist-new-plymouth-central-taranaki',
   'Bargain Chemist New Plymouth Central',
   'newplymouth@bargainchemist.co.nz',
   NOW(), NULL),

  -- Opunake Pharmacy (Araba Pharmacy Ltd) also operates a Manaia branch at
  -- 47 Main Road Manaia 4612 — shared opunakepharmacy@gmail.com inbox.
  ('opunake-pharmacy-taranaki',
   'Opunake Pharmacy',
   'opunakepharmacy@gmail.com',
   NOW(), NULL),

  ('patea-pharmacy-taranaki',
   'Patea Pharmacy',
   'pateapharmacy@hotmail.co.nz',
   NOW(), NULL),

  ('pharmacy-bell-block-taranaki',
   'Pharmacy @ Bell Block',
   'bbpharmacy@xtra.co.nz',
   NOW(), NULL),

  ('unichem-inglewood-pharmacy-taranaki',
   'Unichem Inglewood Pharmacy',
   'inglewood.dispensary@unichem.co.nz',
   NOW(), NULL),

  ('robertsons-hunter-street-pharmacy-taranaki',
   'Robertsons Hunter Street Pharmacy',
   'hunter@robertsonspharmacy.co.nz',
   NOW(), NULL),

  ('chemist-warehouse-new-plymouth-centre-city-taranaki',
   'Chemist Warehouse New Plymouth - Centre City',
   'newplymouth2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('waitara-pharmacy-taranaki',
   'Waitara Pharmacy',
   'dispensary@waitarapharmacy.nz',
   NOW(), NULL),

  ('tui-ora-health-pharmacy-limited-taranaki',
   'Tui Ora Health Pharmacy',
   'tuiorapharmacy@gmail.com',
   NOW(), NULL),

  ('merrilands-pharmacy-taranaki',
   'Merrilands Pharmacy',
   'rxmerrilandspharmacy@gmail.com',
   NOW(), NULL),

  ('vogeltown-pharmacy-taranaki',
   'Vogeltown Pharmacy',
   'dispensary@vogeltownpharmacy.co.nz',
   NOW(), NULL),

  ('pharmacy-carefirst-taranaki',
   'Pharmacy @ Carefirst',
   'carefirstpharmacy@hotmail.com',
   NOW(), NULL),

  ('robertsons-high-street-pharmacy-taranaki',
   'Robertsons High Street Pharmacy',
   'disp@robertsonspharmacy.co.nz',
   NOW(), NULL),

  ('moturoa-pharmacy-taranaki',
   'Moturoa Pharmacy',
   'dispensary@moturoapharmacy.co.nz',
   NOW(), NULL),

  ('unichem-westown-pharmacy-taranaki',
   'Unichem Westown Pharmacy',
   'admin@westownpharmacy.co.nz',
   NOW(), NULL),

  ('eliza-s-pharmacy-taranaki',
   'Eliza''s Pharmacy',
   'scripts@elizaspharmacy.co.nz',
   NOW(), NULL),

  ('devon-west-pharmacy-taranaki',
   'Devon West Pharmacy',
   'devonwestpharmacyemail@gmail.com',
   NOW(), NULL),

  -- ── Hawke's Bay ───────────────────────────────────────────────────────
  ('flaxmere-pharmacy-hawke-s-bay',
   'Flaxmere Pharmacy',
   'flaxmererx@gmail.com',
   NOW(), NULL),

  ('care-pharmacy-at-totara-hawke-s-bay',
   'Care Pharmacy at Totara',
   'dispensary@carepharm.co.nz',
   NOW(), NULL),

  ('gilmours-havelock-north-pharmacy-hawke-s-bay',
   'Gilmours Havelock North Pharmacy',
   'rx.gilmours@gmail.com',
   NOW(), NULL),

  ('maraenui-pharmacy-hawke-s-bay',
   'Maraenui Pharmacy',
   'prescription@maraenuipharmacy.co.nz',
   NOW(), NULL),

  ('napier-pharmacy-hawke-s-bay',
   'Napier Pharmacy',
   'prescription@napierpharmacy.co.nz',
   NOW(), NULL),

  ('westshore-pharmacy-hawke-s-bay',
   'Westshore Pharmacy',
   'westshorepharmacy.rx@gmail.com',
   NOW(), NULL),

  ('unichem-pharmacy-waipukurau-hawke-s-bay',
   'Unichem Pharmacy Waipukurau',
   'dispamcalwpk@xtra.co.nz',
   NOW(), NULL),

  -- Register lists 110 Russell St South; Patrick's paste 108 is next door/same block.
  ('unichem-russell-street-pharmacy-hawke-s-bay',
   'Unichem Russell Street Pharmacy',
   'hastingsrx@unichem.co.nz',
   NOW(), NULL),

  ('tamatea-pharmacy-hawke-s-bay',
   'Tamatea Pharmacy',
   'dispensary@tamateapharmacy.co.nz',
   NOW(), NULL),

  ('unichem-munroe-st-pharmacy-hawke-s-bay',
   'Unichem Munroe St. Pharmacy',
   'napier@unichem.co.nz',
   NOW(), NULL),

  ('unichem-havelock-north-hawke-s-bay',
   'Unichem Havelock North',
   'rxhn@unichem.co.nz',
   NOW(), NULL),

  ('taiwhenua-pharmacy-hawke-s-bay',
   'Taiwhenua Pharmacy',
   'scriptsfortaiwhenuapharmacy@gmail.com',
   NOW(), NULL),

  ('waipawa-pharmacy-hawke-s-bay',
   'Waipawa Pharmacy',
   'scripts@waipawapharmacy.nz',
   NOW(), NULL),

  ('raureka-pharmacy-hawke-s-bay',
   'Raureka Pharmacy',
   'raurekarx@yourcommunitypharmacy.co.nz',
   NOW(), NULL),

  ('clive-pharmacy-hawke-s-bay',
   'Clive Pharmacy',
   'scripts@clivepharmacy.co.nz',
   NOW(), NULL),

  ('marewa-pharmacy-hawke-s-bay',
   'Marewa Pharmacy',
   'marewarx@yourcommunitypharmacy.co.nz',
   NOW(), NULL),

  -- Register lists 8 Paul St; patient-facing address is Cnr SH2 & Queen St (relocation).
  ('wairoa-pharmacy-hawke-s-bay',
   'Wairoa Pharmacy',
   'scripts@wairoapharmacy.nz',
   NOW(), NULL),

  ('life-pharmacy-napier-city-hawke-s-bay',
   'Life Pharmacy Napier City',
   'lifenapierscripts@gmail.com',
   NOW(), NULL),

  ('greenmeadows-pharmacy-hawke-s-bay',
   'Greenmeadows Pharmacy',
   'greenmeadowsrx@yourcommunitypharmacy.co.nz',
   NOW(), NULL),

  ('napier-balmoral-pharmacy-hawke-s-bay',
   'Napier Balmoral Pharmacy',
   'balmoral.prescriptions25@gmail.com',
   NOW(), NULL),

  ('taradale-medical-pharmacy-hawke-s-bay',
   'Taradale Medical Pharmacy',
   'tmprx@taradalepharmacy.co.nz',
   NOW(), NULL),

  ('unichem-stortford-lodge-pharmacy-hawke-s-bay',
   'Unichem Stortford Lodge Pharmacy',
   'scripts.stortford@unichem.co.nz',
   NOW(), NULL),

  ('mahora-pharmacy-limited-hawke-s-bay',
   'Mahora Pharmacy',
   'mahorapharmacy@outlook.com',
   NOW(), NULL),

  ('andrew-spence-pharmacy-hawke-s-bay',
   'Andrew Spence Pharmacy',
   'onekawarx@yourcommunitypharmacy.co.nz',
   NOW(), NULL),

  ('the-pharmacy-the-hastings-health-centre-hawke-s-bay',
   'The Pharmacy @ The Hastings Health Centre',
   'scripts.pharmacy@hhc.co.nz',
   NOW(), NULL),

  ('ahuriri-pharmacy-hawke-s-bay',
   'Ahuriri Pharmacy',
   'script@ahuriripharmacy.co.nz',
   NOW(), NULL),

  ('parkvale-pharmacy-hawke-s-bay',
   'Parkvale Pharmacy',
   'scripts@parkvalepharmacy.nz',
   NOW(), NULL),

  ('unichem-pharmacy-greenmeadows-hawke-s-bay',
   'Unichem Pharmacy Greenmeadows',
   'rx.greenmeadows@unichem.co.nz',
   NOW(), NULL),

  ('bay-view-village-pharmacy-hawke-s-bay',
   'Bay View Village Pharmacy',
   'bvvpharmacyscripts@gmail.com',
   NOW(), NULL),

  ('woolworths-pharmacy-hastings-hawke-s-bay',
   'Woolworths Pharmacy Hastings',
   'hastings.pharmacy@woolworths.co.nz',
   NOW(), NULL),

  ('bay-plaza-pharmacy-hawke-s-bay',
   'Bay Plaza Pharmacy',
   'bayplazapharmacyscripts@gmail.com',
   NOW(), NULL),

  ('chemist-warehouse-hastings-hawke-s-bay',
   'Chemist Warehouse Hastings',
   'hastings2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('glenns-pharmacy-limited-hawke-s-bay',
   'Glenns Pharmacy',
   'prescriptions@glennspharmacy.co.nz',
   NOW(), NULL),

  ('unichem-taradale-pharmacy-hawke-s-bay',
   'Unichem Taradale Pharmacy',
   'utprx@taradalepharmacy.co.nz',
   NOW(), NULL),

  ('gees-pharmacy-hawke-s-bay',
   'Gees Pharmacy',
   'geesdispensary@gmail.com',
   NOW(), NULL),

  ('peak-pharmacy-hawke-s-bay',
   'Peak Pharmacy',
   'rxdispensary@peakpharmacy.co.nz',
   NOW(), NULL),

  -- ── Whanganui / Manawatū ──────────────────────────────────────────────
  ('gonville-health-pharmacy-limited-whanganui',
   'Gonville Health Pharmacy',
   'ghpl@xtra.co.nz',
   NOW(), NULL),

  ('marton-pharmacy-whanganui',
   'Marton Pharmacy',
   'martonpharmrx@gmail.com',
   NOW(), NULL),

  ('central-city-pharmacy-whanganui',
   'Central City Pharmacy',
   'ccpscripts@gmail.com',
   NOW(), NULL),

  ('pharmacy-over-east-whanganui',
   'Pharmacy Over East',
   'scripts@pharmacyovereast.co.nz',
   NOW(), NULL),

  ('pharmacy-145-on-victoria-whanganui',
   'Pharmacy 145 on Victoria',
   'pharmacy145@hotmail.com',
   NOW(), NULL),

  ('chemist-warehouse-whanganui-whanganui',
   'Chemist Warehouse Whanganui',
   'whanganui2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('wicksteed-pharmacy-whanganui',
   'Wicksteed Pharmacy',
   'rx@wicksteedpharmacy.co.nz',
   NOW(), NULL),

  ('unichem-whanganui-pharmacy-whanganui',
   'Unichem Whanganui Pharmacy',
   'whanganui.scripts@unichem.co.nz',
   NOW(), NULL),

  ('aramoho-pharmacy-whanganui',
   'Aramoho Pharmacy',
   'rx@aramohopharmacy.co.nz',
   NOW(), NULL),

  ('gonville-pharmacy-whanganui',
   'Gonville Pharmacy',
   'rx@gonvillepharmacy.co.nz',
   NOW(), NULL),

  ('platt-s-pharmacy-whanganui',
   'Platt''s Pharmacy',
   'team@plattspharmacy.co.nz',
   NOW(), NULL),

  ('taihape-pharmacy-whanganui',
   'Taihape Pharmacy',
   'taihapepharmacyrx@gmail.com',
   NOW(), NULL),

  ('st-johns-pharmacy-whanganui',
   'St Johns Pharmacy',
   'stjohnspharmacy2004@gmail.com',
   NOW(), NULL),

  ('dannevirke-wellness-pharmacy-wairarapa',
   'Dannevirke Wellness Pharmacy',
   'wellnesshubpharmacy@gmail.com',
   NOW(), NULL),

  ('levin-mall-pharmacy-midcentral',
   'Levin Mall Pharmacy',
   'team@levinmallpharmacy.nz',
   NOW(), NULL),

  ('dannevirke-pharmacy-midcentral',
   'Dannevirke Pharmacy',
   'dispensary.dannevirke@gmail.com',
   NOW(), NULL),

  ('city-health-pharmacy-midcentral',
   'City Health Pharmacy',
   'cityhealthrx@bpg.nz',
   NOW(), NULL),

  ('vogel-street-pharmacy-midcentral',
   'Vogel Street Pharmacy',
   'vogelstreetpharmacy1@gmail.com',
   NOW(), NULL),

  ('unichem-roses-pharmacy-midcentral',
   'Unichem Roses Pharmacy',
   'dispensary@rosespharmacy.co.nz',
   NOW(), NULL),

  ('pahiatua-pharmacy-wairarapa',
   'Pahiatua Pharmacy',
   'PahiatuapharmacyRx@gmail.com',
   NOW(), NULL),

  ('chemist-warehouse-palmerston-north-midcentral',
   'Chemist Warehouse Palmerston North',
   'palmerston.north2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('unichem-chemist-shop-midcentral',
   'Unichem Chemist Shop',
   'disp@unichemchemistshop.co.nz',
   NOW(), NULL),

  ('unichem-kauri-healthcare-pharmacy-midcentral',
   'Unichem Kauri Healthcare Pharmacy',
   'disp@kaurihcp.co.nz',
   NOW(), NULL),

  ('unichem-awapuni-pharmacy-midcentral',
   'Unichem Awapuni Pharmacy',
   'awapunidispensary@unichem.co.nz',
   NOW(), NULL),

  ('vautier-pharmacy-pioneer-village-midcentral',
   'Vautier Pharmacy - Pioneer Village',
   'pioneerprescription@gmail.com',
   NOW(), NULL),

  ('vautier-pharmacy-summerhill-village-midcentral',
   'Vautier Pharmacy - Summerhill Village',
   'summerhill.rx@gmail.com',
   NOW(), NULL),

  ('woolworths-pharmacy-rangitikei-st-midcentral',
   'Woolworths Pharmacy Rangitikei St',
   'rangitikei.pharmacy@woolworths.co.nz',
   NOW(), NULL),

  ('central-feilding-pharmacy-midcentral',
   'Central Feilding Pharmacy',
   'rx.cfph@gmail.com',
   NOW(), NULL),

  ('hokowhitu-pharmacy-midcentral',
   'Hokowhitu Pharmacy',
   'hokowhitupharmacyscripts@gmail.com',
   NOW(), NULL),

  ('berrys-health-centre-pharmacy-midcentral',
   'Berrys Health Centre Pharmacy',
   'rxdurham@psl2025.nz',
   NOW(), NULL),

  ('botanical-road-pharmacy-midcentral',
   'Botanical Road Pharmacy',
   'botanicalscript@gmail.com',
   NOW(), NULL),

  ('cookstpharmacy-midcentral',
   'CookStPharmacy',
   'pharmacist@cookstpharmacy.co.nz',
   NOW(), NULL),

  ('unichem-the-palms-pharmacy-midcentral',
   'Unichem The Palms Pharmacy',
   'thepalms@unichem.co.nz',
   NOW(), NULL),

  ('berrys-tararua-pharmacy-midcentral',
   'Berrys Tararua Pharmacy',
   'rxtararua@psl2025.nz',
   NOW(), NULL),

  ('gimbletts-pharmacy-midcentral',
   'Gimbletts Pharmacy',
   'gimblettspharmacy@gmail.com',
   NOW(), NULL),

  ('otaki-pharmacy-midcentral',
   'Otaki Pharmacy',
   'dispensary@otakipharmacy.co.nz',
   NOW(), NULL),

  ('feilding-health-pharmacy-midcentral',
   'Feilding Health Pharmacy',
   'pharmacy@fhc.nz',
   NOW(), NULL),

  ('central-drive-in-pharmacy-midcentral',
   'Central Drive-In Pharmacy',
   'disp@cppn.co.nz',
   NOW(), NULL),

  ('unichem-levin-pharmacy-midcentral',
   'Unichem Levin Pharmacy',
   'dispensary.levin@unichem.co.nz',
   NOW(), NULL),

  ('milson-pharmacy-midcentral',
   'Milson Pharmacy',
   'milsonpharmacyrx@gmail.com',
   NOW(), NULL),

  ('life-pharmacy-the-plaza-midcentral',
   'Life Pharmacy The Plaza',
   'theplaza@lifepharmacy.co.nz',
   NOW(), NULL),

  ('steeds-pharmacy-midcentral',
   'Steeds Pharmacy',
   'steeds.rx@naturalhealthchemist.co.nz',
   NOW(), NULL),

  ('unichem-terrace-end-pharmacy-midcentral',
   'Unichem Terrace End Pharmacy',
   'terraceend.scripts@unichem.co.nz',
   NOW(), NULL),

  ('grant-irvine-pharmacy-midcentral',
   'Grant Irvine Pharmacy',
   'grantirvinepharmacy@gmail.com',
   NOW(), NULL),

  ('unichem-southend-pharmacy-wairarapa',
   'Unichem Southend Pharmacy',
   'southendrepeats@kemihi.co.nz',
   NOW(), NULL),

  ('life-pharmacy-masterton-wairarapa',
   'Life Pharmacy Masterton',
   'rxlifepharmacymasterton@pharmacysolutions.nz',
   NOW(), NULL),

  ('greytown-pharmacy-wairarapa',
   'Greytown Pharmacy',
   'dispensary@greytownpharmacy.co.nz',
   NOW(), NULL),

  ('langs-pharmacy-wairarapa',
   'Langs Pharmacy',
   'rxlangs@pharmacysolutions.nz',
   NOW(), NULL),

  ('unichem-martinborough-pharmacy-wairarapa',
   'Unichem Martinborough Pharmacy',
   'health@martinboroughpharmacy.co.nz',
   NOW(), NULL),

  ('carterton-pharmacy-wairarapa',
   'Carterton Pharmacy',
   'rxcarterton@pharmacysolutions.nz',
   NOW(), NULL),

  ('masterton-medical-pharmacy-limited-wairarapa',
   'Masterton Medical Pharmacy',
   'mmprepeats@kemihi.co.nz',
   NOW(), NULL),

  ('duncan-s-pharmacy-wairarapa',
   'Duncan''s Pharmacy',
   'rxduncans@pharmacysolutions.nz',
   NOW(), NULL),

  -- ── Capital, Coast and Hutt Valley (Wellington) ────────────────────────
  ('queen-street-pharmacy-limited-capital-coast-and-hutt-valley',
   'Queen Street Pharmacy',
   'prescriptions@queenstreetpharmacy.co.nz',
   NOW(), NULL),

  ('wellworks-pharmacy-boulcott-capital-coast-and-hutt-valley',
   'Wellworks Pharmacy Boulcott',
   'boulcott@wellworks.co.nz',
   NOW(), NULL),

  ('maungaraki-pharmacy-capital-coast-and-hutt-valley',
   'Maungaraki Pharmacy',
   'vaudin@maungarakipharmacy.co.nz',
   NOW(), NULL),

  ('owles-pharmacy-capital-coast-and-hutt-valley',
   'Owles Pharmacy',
   'rxowles@psl2022.nz',
   NOW(), NULL),

  ('unichem-upper-hutt-pharmacy-capital-coast-and-hutt-valley',
   'Unichem Upper Hutt Pharmacy',
   'scripts.upperh@unichem.co.nz',
   NOW(), NULL),

  ('bargain-chemist-petone-capital-coast-and-hutt-valley',
   'Bargain Chemist Petone',
   'petone@bargainchemist.co.nz',
   NOW(), NULL),

  ('taita-pharmacy-2016-limited-capital-coast-and-hutt-valley',
   'Taita Pharmacy',
   'dispensary@taitapharmacy.co.nz',
   NOW(), NULL),

  ('life-pharmacy-queensgate-capital-coast-and-hutt-valley',
   'Life Pharmacy Queensgate',
   'queensgate.dispensary@lifepharmacy.co.nz',
   NOW(), NULL),

  ('connolly-street-pharmacy-capital-coast-and-hutt-valley',
   'Connolly Street Pharmacy',
   'csphcy@gmail.com',
   NOW(), NULL),

  ('unichem-maidstone-pharmacy-capital-coast-and-hutt-valley',
   'Unichem Maidstone Pharmacy',
   'maidstone@unichem.co.nz',
   NOW(), NULL),

  ('woburn-pharmacy-capital-coast-and-hutt-valley',
   'Woburn Pharmacy',
   'prescriptions@woburnpharmacy.co.nz',
   NOW(), NULL),

  ('naenae-pharmacy-capital-coast-and-hutt-valley',
   'Naenae Pharmacy',
   'dispensary@naenaepharmacy.co.nz',
   NOW(), NULL),

  ('eastbourne-pharmacy-capital-coast-and-hutt-valley',
   'Eastbourne Pharmacy',
   'eastbournepharmacy@gmail.com',
   NOW(), NULL),

  ('unichem-kopata-pharmacy-capital-coast-and-hutt-valley',
   'Unichem Kopata Pharmacy',
   'kopata@unichem.co.nz',
   NOW(), NULL),

  ('ropata-pharmacy-capital-coast-and-hutt-valley',
   'Ropata Pharmacy',
   'rxropata@psl2022.nz',
   NOW(), NULL),

  ('unichem-upper-hutt-health-pharmacy-capital-coast-and-hutt-valley',
   'Unichem Upper Hutt Health Pharmacy',
   'upperhutthealth@unichem.co.nz',
   NOW(), NULL),

  ('woolworths-pharmacy-wainuiomata-capital-coast-and-hutt-valley',
   'Woolworths Pharmacy Wainuiomata',
   'wainuiomata.pharmacy@woolworths.co.nz',
   NOW(), NULL),

  ('woolworths-pharmacy-petone-capital-coast-and-hutt-valley',
   'Woolworths Pharmacy Petone',
   'petone.pharmacy@woolworths.co.nz',
   NOW(), NULL),

  ('unichem-petone-pharmacy-capital-coast-and-hutt-valley',
   'Unichem Petone Pharmacy',
   'petonepharmacy@outlook.com',
   NOW(), NULL),

  ('lagan-s-pharmacy-capital-coast-and-hutt-valley',
   'Lagan''s Pharmacy',
   'laganspharmacy2013@gmail.com',
   NOW(), NULL),

  ('avalon-medical-centre-pharmacy-limited-capital-coast-and-hutt-valley',
   'Avalon Medical Centre Pharmacy',
   'avalonpharmacy@hotmail.com',
   NOW(), NULL),

  ('wainuiomata-pharmacy-capital-coast-and-hutt-valley',
   'Wainuiomata Pharmacy',
   'wainuiomatapharmacy@hotmail.co.nz',
   NOW(), NULL),

  ('clive-s-chemist-capital-coast-and-hutt-valley',
   'Clive''s Chemist',
   'dispensary@clives.co.nz',
   NOW(), NULL),

  ('waterloo-pharmacy-capital-coast-and-hutt-valley',
   'Waterloo Pharmacy',
   'chris@waterloopharmacy.co.nz',
   NOW(), NULL),

  ('burns-pharmacy-1991-limited-capital-coast-and-hutt-valley',
   'Burns Pharmacy',
   'burnspharmacyscripts@outlook.co.nz',
   NOW(), NULL),

  ('unichem-stokes-valley-pharmacy-capital-coast-and-hutt-valley',
   'Unichem Stokes Valley Pharmacy',
   'rxstokesvalley@unichem.co.nz',
   NOW(), NULL),

  ('len-hooper-pharmacy-capital-coast-and-hutt-valley',
   'Len Hooper Pharmacy',
   'dispensary@lenhooperpharmacy.co.nz',
   NOW(), NULL),

  ('moera-pharmacy-capital-coast-and-hutt-valley',
   'Moera Pharmacy',
   'moerapharmacy@gmail.com',
   NOW(), NULL),

  ('hutt-city-pharmacy-capital-coast-and-hutt-valley',
   'Hutt City Pharmacy',
   'huttcitypharmacy@gmail.com',
   NOW(), NULL),

  ('silverstream-pharmacy-limited-capital-coast-and-hutt-valley',
   'Silverstream Pharmacy',
   'dispensary@silverstreampharmacy.co.nz',
   NOW(), NULL),

  ('alexander-pharmacy-capital-coast-and-hutt-valley',
   'Alexander Pharmacy',
   'scripts@alexanderpharmacy.co.nz',
   NOW(), NULL),

  ('unichem-johnsonville-pharmacy-capital-coast-and-hutt-valley',
   'Unichem Johnsonville Pharmacy',
   'info@johnsonvillepharmacy.co.nz',
   NOW(), NULL),

  ('unichem-newtown-mall-pharmacy-capital-coast-and-hutt-valley',
   'Unichem Newtown Mall Pharmacy',
   'newtownmallpharmacy@xtra.co.nz',
   NOW(), NULL),

  ('unichem-university-pharmacy-capital-coast-and-hutt-valley',
   'Unichem University Pharmacy',
   'unichemuniversity@outlook.co.nz',
   NOW(), NULL),

  ('chemist-warehouse-kilbirnie-capital-coast-and-hutt-valley',
   'Chemist Warehouse Kilbirnie',
   'kilbirnie2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('chemist-warehouse-lambton-quay-capital-coast-and-hutt-valley',
   'Chemist Warehouse Lambton Quay',
   'lambtonquay2@chemistwarehouse.co.nz',
   NOW(), NULL),

  ('johnsonville-medical-centre-pharmacy-capital-coast-and-hutt-valley',
   'Johnsonville Medical Centre Pharmacy',
   'jmcpharm@gmail.com',
   NOW(), NULL),

  ('village-pharmacy-churton-park-capital-coast-and-hutt-valley',
   'Village Pharmacy Churton Park',
   'info@churtonparkpharmacy.co.nz',
   NOW(), NULL),

  ('porirua-pharmacy-capital-coast-and-hutt-valley',
   'Porirua Pharmacy',
   'poriruapharmacy@gmail.com',
   NOW(), NULL),

  ('woolworths-pharmacy-porirua-capital-coast-and-hutt-valley',
   'Woolworths Pharmacy Porirua',
   'porirua.pharmacy@woolworths.co.nz',
   NOW(), NULL),

  ('bargain-chemist-lyall-bay-capital-coast-and-hutt-valley',
   'Bargain Chemist Lyall Bay',
   'lyallbay@bargainchemist.co.nz',
   NOW(), NULL),

  ('life-pharmacy-kapiti-coast-capital-coast-and-hutt-valley',
   'Life Pharmacy Kapiti Coast',
   'lifekapiti@xtra.co.nz',
   NOW(), NULL),

  ('life-pharmacy-north-city-capital-coast-and-hutt-valley',
   'Life Pharmacy North City',
   'ncpdispensary@gmail.com',
   NOW(), NULL),

  ('wellington-compounding-pharmacy-capital-coast-and-hutt-valley',
   'Wellington Compounding Pharmacy',
   'prescription@compounding.co.nz',
   NOW(), NULL),

  -- Register lists 186A Wellington St; patient-facing address 78 Vincent St (Howick relocation).
  ('john-savory-pharmacy-counties-manukau',
   'John Savory Pharmacy',
   'disp@pharmacyjsl.co.nz',
   NOW(), NULL),

  ('prohealth-pharmacy-papatoetoe-counties-manukau',
   'ProHealth Pharmacy Papatoetoe',
   'prescriptions.prohealthpapatoetoe@outlook.co.nz',
   NOW(), NULL),

  ('lake-road-pharmacy-waitemat',
   'Lake Road Pharmacy',
   'orders@lakeroadpharmacy.co.nz',
   NOW(), NULL),

  -- Formerly listed as "Upper Harbour Village Pharmacy" in held section — rebranded
  -- to Unichem Harbour View Pharmacy and now in current Medsafe register.
  ('unichem-harbour-view-pharmacy-waitemat',
   'Unichem Harbour View Pharmacy',
   'dispensary.uhvp@mypharmacy.co.nz',
   NOW(), NULL),

  ('west-harbour-pharmacy-waitemat',
   'West Harbour Pharmacy',
   'westharbourpharmacy@xtra.co.nz',
   NOW(), NULL),

  ('unichem-templeton-pharmacy-canterbury',
   'Unichem Templeton Pharmacy',
   'dispensary@templetonpharmacy.co.nz',
   NOW(), NULL),

  ('baillie-and-lewis-pharmacy-southern',
   'Baillie and Lewis Pharmacy',
   'prescriptions@xtra.co.nz',
   NOW(), NULL),

  ('john-poswillo-pharmacy-ltd-nelson-marlborough',
   'John Poswillo Pharmacy',
   'Dispensary@poswillopharmacy.co.nz',
   NOW(), NULL),

  -- Merged into Life Pharmacy Meadowbank (35 St Johns Rd). Route scripts to the
  -- surviving branch's dispensary inbox so the picker still works if patients
  -- select the old Meadowbank Corner Chemist listing.
  ('meadowbank-corner-chemist-auckland',
   'Meadowbank Corner Chemist (merged → Life Pharmacy Meadowbank)',
   'rx.meadowbank@lifepharmacy.co.nz',
   NOW(), NULL)

  -- ── Held: not yet in pharmacies.json (Medsafe register lag) ───────────
  -- ProHealth Papatoetoe Pharmacy — Corner Hoteo Ave & Great South Rd, 230 Great
  --   South Rd, Papatoetoe 2025 → prescriptions.prohealthpapatoetoe@outlook.co.nz
  --   (not in current Medsafe register snapshot)
  -- Ormiston Hospital Pharmacy — Ground Floor, Ormiston Hospital, 125 Ormiston
  --   Rd, Flat Bush 2016 → ormistonpharmacy@yahoo.co.nz (hospital-based, not
  --   in community Medsafe register)
  -- Pharmacy On Meade — Meade Clinical Centre, Level 1, Pembroke Street, Hamilton
  --   Lake 3204 → pharmacyonmeade@waikatodhb.health.nz (hospital-based, not in
  --   community Medsafe register)
  -- Mangakino Pharmacy — Civic Centre, Rangatira Drive, Mangakino 3421 →
  --   specmango@gmail.com (not in current Medsafe register snapshot)
  -- Haumanu Pharmacy — Ground Floor, Scott Building, Middlemore Hospital, Otahuhu →
  --   haumanu.prescriptions@middlemore.co.nz (hospital-based, not in community
  --   Medsafe register)
  -- Family Health Pharmacy — 12 Glasgow Road, Pukekohe 2120 → pharmacist.fhp@gmail.com
  --   (not in current Medsafe register snapshot)
  -- Gordon's Pharmacy Te Araroa — Eastern Four Square Store, 29 Rata Street, Te Araroa,
  --   Gisborne 4087 → rxorders@gordonspharmacy.co.nz (satellite of Mangapapa branch)
  -- Gordon's Pharmacy Te Puia Springs — 4 McKenzie Street, Te Puia Springs, Gisborne
  --   4079 → rxorders@gordonspharmacy.co.nz (satellite of Mangapapa branch)
  -- Gordon's Pharmacy Hicks Bay — Hicks Bay General Store, 19 Wharf Road, Hicks Bay,
  --   Gisborne 4087 → rxorder@gordonspharmacy.co.nz (satellite of Mangapapa branch)
  -- Eltham Pharmacy — 130 High Street, Eltham, Taranaki 4322 →
  --   dispensary@stratfordpharmacy.co.nz (shared inbox with Stratford Pharmacy; not
  --   in current Medsafe register snapshot)
  -- Chemist Warehouse Napier — 200 Prebensen Drive, Onekawa, Napier 4141 →
  --   napier2@chemistwarehouse.co.nz (not in current Medsafe register snapshot)
  -- Ohakune Pharmacy — 21 Goldfinch Street, Ohakune 4625 →
  --   taihapepharmacyrx@gmail.com (shared inbox with Taihape Pharmacy; not in
  --   current Medsafe register snapshot)
  -- Woodville Pharmacy — 56 Vogel Street, Woodville 4920 → wooddep56@gmail.com
  --   (not in current Medsafe register snapshot)
  --
  -- ── Confirmed NO email scripting (do not chase) ───────────────────────
  -- Bargain Chemist Upper Hutt — 7-11 Queen Street, Upper Hutt 5018 — does not
  --   accept email prescriptions (confirmed 2026-08-01)
  -- Sophia Pharmacy — Suite 107, 201 King Street North, Hastings 4122 — no
  --   email prescription option available (confirmed 2026-08-01)
  -- Auckland City Hospital Retail Pharmacy — Level 5 Galleria, Support Building,
  --   2 Park Rd, Grafton 1023 → achretail@adhb.govt.nz (hospital-based, not in
  --   community Medsafe register snapshot)
  -- Greenlane Clinical Centre Pharmacy — Maungakiekie Campus, 214 Green Lane West,
  --   Greenlane 1051 → GCCPharmacy@adhb.govt.nz (Auckland DHB, hospital-based)
  -- These pharmacies appear on Healthpoint but not in our current Medsafe
  -- register snapshot. Re-run after the next pharmacies.json refresh (monthly
  -- GitHub Action) to check if they're now included, then move above.
  --
  -- Guardian Pharmacy — 34A Constellation Drive, Rosedale, Auckland 0732 → direct@guardianpharmacy.co.nz
  -- Chemist Warehouse Constellation Drive — 4/60 Constellation Drive, Rosedale, Auckland 0732 → constellationdrive2@chemistwarehouse.co.nz
  -- Devons Health Pharmacy — 63b Lake Road, Devonport, Auckland 0624 → info@devonshealthpoint.co.nz
  -- Milldale Dispensary — Unit 6, 1 Henry Tayler Rise, Milldale, Wainui, Auckland 0932 → milldaledispensary@gmail.com
  -- Poswillo Pharmacy — 65A Main Road, Havelock, Marlborough 7100 → Dispensary@poswillopharmacy.co.nz
  -- Poswillo Pharmacy — 70 High Street, Renwick, Marlborough 7204 → Dispensary@poswillopharmacy.co.nz
  -- Chemist Warehouse Homebase — A2.3, 215 Marshland Road, Shirley, Christchurch 8064 → homebase2@chemistwarehouse.co.nz
  -- UMC Woodend Pharmacy — 79A Main North Road, Ravenswood, Woodend, Canterbury 7610 → woodend@umcpharmacy.co.nz
  -- Fairlie Healthcare — 78 Main Street, Fairlie, Canterbury 7925 → fairlie.healthcare@gmail.com
  -- Hanmer Springs Healthworks — 7/24 Conical Hill Road, Hanmer Springs, Canterbury 7334 → rx@healthworks.co.nz
  -- Roxburgh Highland Pharmacy — 14 Ross Place, Lawrence, Otago 9532 → roxburghhighlandpharma@gmail.com
  -- Lahoods Pharmacy — 42 Northumberland Street, Tapanui, Otago 9522 → lahoods@xtra.co.nz
  -- Bluff Pharmacy — 128 Gore Street, Bluff, Southland 9814 → pharmacist@unicheminv.co.nz (shared Unichem Invercargill inbox)
  -- Quins Lumsden Pharmacy — 24 Diana Street, Lumsden, Southland 9730 → dispensary@quinspharmacy.co.nz
  -- Otautau Pharmacy — 151 Main Street, Otautau, Southland 9610 → fax.wintonpharmacy@gmail.com (shared Winton inbox)
  -- Wyndham Pharmacy — 29 Balaclava Street, Wyndham, Southland 9831 → pharmacist@unicheminv.co.nz (shared Unichem Invercargill inbox)
  --
  -- ── Hospital pharmacies (excluded from pharmacies.json by community filter) ──
  -- Not offered in the patient picker (community-only), but recorded here in
  -- case we ever add hospital-pharmacy routing.
  --
  -- North Shore Hospital Outpatient Pharmacy — 124 Shakespeare Road, Westlake, Auckland 0622 → NSHOUTPHCY.Generic@waitematadhb.govt.nz
  -- Unichem Burwood — Burwood Hospital, 300 Burwood Road, Burwood, Christchurch 8083 → dispensary@unichemburwood.co.nz
  -- Waitakere Hospital Outpatient Pharmacy — Waitakere Hospital, Henderson, Auckland → WTHOUTPHCY.Generic@waitematadhb.govt.nz
  -- Upper Harbour Village Pharmacy — 382 Te Atatu Road, Te Atatu Peninsula, Auckland 0610 → dispensary.uhvp@mypharmacy.co.nz
  -- Pharmacy on Ruahine — Main Foyer, Palmerston North Hospital, 50 Ruahine Street, Roslyn, Palmerston North 4414 → rxpharmacyonruahine@midcentraldhb.govt.nz (hospital-based)

ON CONFLICT (pharmacy_id) DO UPDATE SET
  dispensary_email = COALESCE(EXCLUDED.dispensary_email, pharmacy_contacts.dispensary_email),
  premises_name    = COALESCE(EXCLUDED.premises_name, pharmacy_contacts.premises_name),
  updated_at       = NOW();
