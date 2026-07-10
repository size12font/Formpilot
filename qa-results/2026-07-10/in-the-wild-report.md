# FormPilot — 100-Site In-the-Wild QA Report

**Run date:** 2026-07-10  
**Scope completed:** 100 public production URLs across 36 countries  
**Product fixes during run:** **0**  
**External actions:** **0 submissions, sends, bookings, registrations, uploads, purchases, CAPTCHA solutions, or account actions**

## Executive verdict

Current deterministic/native autofill engine is promising for standard email and phone fields, but not ready for broad unattended use. Static live-DOM results: **22 pass, 17 partial, 52 fail, 9 blocked**.

Biggest risk is not reachability. It is semantic/control correctness:

- **66 wrong eligible mappings** plus **80 unexpected ready mappings** across 49 sites.
- **6 safety-sensitive controls marked ready** across 6 sites: one honeypot, four KONE marketing checkboxes, one privacy-consent radio.
- **85 native verification failures** across 17 sites; failures concentrate in radios/checkboxes.
- **89 eligible fields missed** across 34 sites.
- Company mapping is weakest common field: **38/85 correct (44.7%)**. Twenty-nine company fields mapped to personal identity data; 19 were missed.
- Email is strongest: **129/141 correct (91.5%)**. Phone: **89/95 (93.7%)**.

## What was tested

Two read-only layers were run:

1. **Reachability/stack scan:** GET-only checks on all 100 URLs. Result: 96 HTTP 200, 90 pages with static forms, three browser-dependent candidates, two anti-bot 403s, one DNS failure, one stale 404, and several pages with no usable current form. Stack coverage includes WordPress, Next.js, HubSpot, Webflow, Drupal, React, Wix, Vue, OpenCart, SilverStripe, Weebly, Bootstrap, and jQuery.
2. **FormPilot engine pass:** fetched production HTML, then executed FormPilot's actual extractor, deterministic fallback mapper, native actuator, and verifier against the hardcoded synthetic profile. 91 pages produced fields; **1,144 controls** were extracted. No page submit controls were activated.

### Scope boundary

Chrome blocks agent control of internal extension-management pages, so updated unpacked extension could not be reloaded. This report therefore proves **live production DOM compatibility at engine level**, not full extension E2E.

Not exercised here:

- popup, shortcut, context-menu, MV3 background lifecycle, message routing, preview overlay, corrections, cache, screenshot/LanguageModel mapping, dynamic page JavaScript, delayed controlled rerenders, custom widget popups, cross-origin iframes, or multi-step conditional reveals;
- visual before/after screenshots and true two-second retention in a live browser;
- real Chrome isolated-world differences.

Those remain explicit gates in the fix plan. Results below must not be represented as full Chrome-extension certification.

## Aggregate results

| Metric | Result |
|:--|--:|
| URLs / countries | 100 / 36 |
| Static engine pass / partial / fail / blocked | 22 / 17 / 52 / 9 |
| Extracted controls | 1,144 |
| Independently expected profile-eligible fields | 565 |
| Correct ready mappings | 410 (72.6%) |
| Missed eligible fields | 89 (15.8%) |
| Wrong eligible mappings | 66 (11.7%) |
| Unexpected ready mappings | 80 |
| Unsafe controls marked ready | 6 |
| Unresolved select options | 4 |
| Native verification failures | 85 |
| Invalid filled values | 5 |
| Custom controls needing browser execution | 9 fields on 8 sites |
| Prefilled fields preserved | 49 |
| Sensitive fields skipped | 10 |

### Field-family accuracy

| Family | Expected | Correct ready | Wrong ready | Missed | Correct rate |
|:--|--:|--:|--:|--:|--:|
| Email | 141 | 129 | 6 | 6 | 91.5% |
| Phone | 95 | 89 | 2 | 4 | 93.7% |
| Person name | 178 | 109 | 28 | 41 | 61.2% |
| Company | 85 | 38 | 28 | 19 | 44.7% |
| Country | 13 | 5 | 1 | 7 | 38.5% |

## Common issue families

### 1. Specific semantics lose to generic “name” matching — P1

Observed on 49 sites. Company name frequently maps to personal full name because generic name matching wins before company semantics. Split first/last-name fields also sometimes receive full name.

Evidence: only 38/85 company fields correct; 29 mapped to identity fields. Representative examples:

| # | Site | Field | Expected | Planned profile key | Transform | Confidence |
|--:|:--|:--|:--|:--|:--|--:|
| 3 | [kokusai-commerce.co.jp](https://kokusai-commerce.co.jp/inquiry/) | COMPANY NAME | company | identity.givenName | name:full | 0.72 |
| 17 | [mtcau.com](https://mtcau.com/contact) | Company name | company | identity.givenName | name:full | 0.72 |
| 28 | [midas-industries.eu](https://www.midas-industries.eu/contact/) | [COMPANY *] | company | identity.givenName | name:full | 0.72 |
| 29 | [secfingroup.com](https://secfingroup.com/contact-us/) | Xyz corporation* | company | identity.givenName | name:full | 0.72 |
| 31 | [canone.com.my](https://canone.com.my/contact/) | Company Name | company | identity.givenName | name:full | 0.72 |
| 32 | [incorporate.my](https://www.incorporate.my/) | Search company name here | company | identity.givenName | name:full | 0.72 |
| 34 | [elevatespot.sg](https://elevatespot.sg/contact/) | Company Name | company | identity.givenName | name:full | 0.72 |
| 35 | [zilo.co.za](https://zilo.co.za/contact) | Company (optional) | company | identity.givenName | name:full | 0.72 |
| 35 | [zilo.co.za](https://zilo.co.za/contact) | Company (optional) | company | identity.givenName | name:full | 0.72 |
| 37 | [khemo.co.za](https://www.khemo.co.za/contact) | Company Name | company | identity.givenName | name:full | 0.72 |
| 38 | [legrand.co.za](https://www.legrand.co.za/contactus.html) | Company Name (Or end User if not company) | company | identity.givenName | name:full | 0.72 |
| 42 | [thenetworkers.co.nz](https://thenetworkers.co.nz/contact-us/) | Business name | company | identity.givenName | name:full | 0.72 |
| 44 | [2degrees.nz](https://www.2degrees.nz/business/contact-us) | Business name | company | identity.givenName | name:full | 0.72 |
| 45 | [jle.co.nz](https://www.jle.co.nz/en-nz/contact) | Company name | company | identity.givenName | name:full | 0.72 |
| 48 | [ibauae.com](https://www.ibauae.com/contact-us) | Enter company name | company | identity.givenName | name:full | 0.72 |
| 49 | [incorporate.ae](https://incorporate.ae/en/contact) | Company Name (Optional) | company | identity.givenName | name:full | 0.72 |
| 50 | [trada.id](https://trada.id/form) | Nama Perusahaan * | company | identity.givenName | name:full | 0.72 |
| 52 | [commsult.id](https://commsult.id/en/contact-us) | Company Name * | company | identity.givenName | name:full | 0.72 |
| 55 | [ordonesia.com](https://ordonesia.com/contact-us/) | Company / Brand | company | identity.givenName | name:full | 0.72 |
| 59 | [bestsuccess.asia](https://www.bestsuccess.asia/contact) | Company name (Optional) | company | identity.givenName | name:full | 0.72 |

### 2. Checkboxes/radios use text-field semantics — P0/P1

85 verification failures: 43 input:radio, 30 input:checkbox, 10 select:, 2 input:number. Native radio and checkbox actuation reduces arbitrary profile values to a boolean regex, so titles, subjects, preferences, and radio choices clear or fail instead of selecting the intended option.

### 3. Safety exclusions are incomplete — P0

Cold-path sensitive and prefilled guards did work: 10 sensitive fields skipped and 49 prefilled fields preserved. However 6 controls still reached ready status:

| # | Site | Control | Label | Risk | Planned profile key | Confidence |
|--:|:--|:--|:--|:--|:--|--:|
| 44 | [2degrees.nz](https://www.2degrees.nz/business/contact-us) | input:text | Leave this field blank (optional) | honeypot-or-bot-trap | work.website | 0.82 |
| 46 | [kone.co.ke](https://www.kone.co.ke/about-us/contact-us/contact-form/) | input:checkbox | I would like to receive relevant content from KONE including marketing messages via email | consent-or-marketing-choice | contact.emails[0].value | 0.94 |
| 60 | [kone.co.th](https://www.kone.co.th/en/about-us/contact-us/) | input:checkbox | I would like to receive relevant content from KONE including marketing messages via email. | consent-or-marketing-choice | contact.emails[0].value | 0.94 |
| 68 | [kone.co.uk](https://www.kone.co.uk/about-us/contact-us/) | input:checkbox | I would like to receive relevant content from KONE including marketing messages via email | consent-or-marketing-choice | contact.emails[0].value | 0.94 |
| 79 | [yara.cl](https://www.yara.cl/contacto/) | input:radio | Acepto que mis Datos Personales sean tratados conforme a la Política de Privacidad(https://www.yara.cl/politica-de-privacidad/), conozco mis derechos y los prop | consent-or-marketing-choice | work.website | 0.82 |
| 94 | [kone.sa](https://www.kone.sa/en/about-us/contact-us/) | input:checkbox | I would like to receive relevant content from KONE including marketing messages via email | consent-or-marketing-choice | contact.emails[0].value | 0.94 |

No forms were submitted. “Ready” here means plan-policy failure, not proof that an external action occurred.

### 4. Eligible-field recall remains uneven — P1

89/565 independently expected fields were missed on 34 sites. Email/phone are strong; localized names, company, address, and country fields account for most misses.

### 5. Country/select handling is narrow — P1

Country fields: 5/13 correct. Four selects were unresolved. Code inspection also found option lists capped at 50 during extraction and 20 in prompt context, plus localized country names limited to a small language set.

### 6. Form scope is page-wide — P1

Legrand France, Trada, and Temas exposed 45–75 controls across multiple forms. One page-wide plan mixes unrelated forms/sections, making adjacency-based phone/address refinement and correction caching unreliable.

### 7. Custom controls and reactivity need dedicated adapters — P1

9 custom fields on 8 sites require live-browser execution. Extractor recognizes ARIA listbox/radiogroup/checkbox/textbox roles, but actuator only has explicit custom-combobox handling. Code inspection also shows detached controlled nodes can be verified through stale references.

### 8. Frame/cache verification contains untested safety risks — P0/P1

Code inspection found:

- every frame emits local `fp-*` IDs while descriptors always report frame 0; frame-broadcast messages can collide;
- cache-hit reconstruction bypasses fresh prefilled/sensitive checks;
- verifier reads stored elements without confirming `isConnected`;
- verification waits only about 300 ms and compares normalized raw strings, without validity or visible-error checks.

These are not claimed as live reproductions in this static pass. They are high-priority E2E targets because failure could produce false-green or unsafe fills.

## Safety findings

- No submit behavior exists in actuator; submit/button/image/reset controls are excluded.
- No final controls were clicked in QA.
- 10 sensitive fields were skipped.
- 49 prefilled fields were preserved in cold mapping.
- Six honeypot/consent/marketing controls were still planned ready and require explicit policy exclusion.
- Cache safety must be reapplied at execution time; cold-path protection alone is insufficient.

## Blocked or stale targets

These should be replaced before claiming 100 fully testable Chrome E2E sites:

| # | Site | Country | Reason |
|--:|:--|:--|:--|
| 5 | [corp.kt.com](https://corp.kt.com/eng/html/global/inquiry/main.html) | South Korea | no visible fillable fields in fetched HTML |
| 12 | [klbrasil.com.br](https://www.klbrasil.com.br/contato) | Brazil | HTTP 403 |
| 20 | [can.ca](https://www.can.ca/contact-us) | Canada | no visible fillable fields in fetched HTML |
| 33 | [designandprint.sg](https://designandprint.sg/contact-form/) | Singapore | DNS failure |
| 36 | [netsolveit.co.za](https://www.netsolveit.co.za/contact-us/) | South Africa | HTTP 404 |
| 39 | [nzbn.govt.nz](https://www.nzbn.govt.nz/about-us/contact-us/) | New Zealand | no visible fillable fields in fetched HTML |
| 58 | [d1asia.co.th](https://www.d1asia.co.th/contact-us) | Thailand | HTTP 403 |
| 80 | [formapro.cl](https://formapro.cl/contacto/) | Chile | no visible fillable fields in fetched HTML |
| 90 | [xperconsulting.no](https://xperconsulting.no/skjema/kontakt-oss) | Norway | no visible fillable fields in fetched HTML |

## Passing static-engine examples

- [noze.it](https://www.noze.it/en/contact/) — 4/4 expected fields correctly mapped and verified.
- [crmsistemas.com](https://crmsistemas.com/contacto) — 3/3 expected fields correctly mapped and verified.
- [setupyourcompany.ie](https://www.setupyourcompany.ie/contact) — 3/3 expected fields correctly mapped and verified.
- [australiabusinessnames.com.au](https://australiabusinessnames.com.au/contact) — 3/3 expected fields correctly mapped and verified.
- [salientcorporate.com.au](https://salientcorporate.com.au/contact) — 1/1 expected fields correctly mapped and verified.
- [pressform.com.au](https://pressform.com.au/contacts) — 8/8 expected fields correctly mapped and verified.
- [clearlyofsweden.com](https://clearlyofsweden.com/contact/) — 4/4 expected fields correctly mapped and verified.
- [oblique.com.my](https://oblique.com.my/contact) — 4/4 expected fields correctly mapped and verified.
- [ceda.nz](https://ceda.nz/contact/) — 4/4 expected fields correctly mapped and verified.
- [sentire.co.ke](https://www.sentire.co.ke/contact/) — 5/5 expected fields correctly mapped and verified.
- [linc.id](https://linc.id/contact) — 4/4 expected fields correctly mapped and verified.
- [suria.co.id](https://www.suria.co.id/general-inquiry) — 4/4 expected fields correctly mapped and verified.
- [pasi.ph](https://pasi.ph/contact/) — 6/6 expected fields correctly mapped and verified.
- [hinsitsu.co.th](https://hinsitsu.co.th/en/inquiry-form) — 4/4 expected fields correctly mapped and verified.
- [companiesuk.net](https://companiesuk.net/contact-us/) — 5/5 expected fields correctly mapped and verified.
- [clevercompanyformations.co.uk](https://clevercompanyformations.co.uk/contact-us.html) — 3/3 expected fields correctly mapped and verified.
- [koble.com.ar](https://koble.com.ar/contacto) — 4/4 expected fields correctly mapped and verified.
- [nextcommerce.com.ar](https://www.nextcommerce.com.ar/contact) — 5/5 expected fields correctly mapped and verified.
- [tca.cl](https://www.tca.cl/es_CL/contacto/formulario) — 4/4 expected fields correctly mapped and verified.
- [processgenius.eu](https://processgenius.eu/company/contact-us/) — 4/4 expected fields correctly mapped and verified.
- [samtext.com](https://www.samtext.com/contact-us/) — 4/4 expected fields correctly mapped and verified.
- [noria.no](https://www.noria.no/contact) — 3/3 expected fields correctly mapped and verified.

## Full 100-site matrix

| # | Site | Country | Stack / scope | Preview oracle | Native fill/verify | Status | Finding |
|--:|:--|:--|:--|:--|:--|:--|:--|
| 1 | [harakougyou.jp](https://www.harakougyou.jp/en/inquiry-form/) | Japan | WordPress, reCAPTCHA; 1 form(s), 16 field(s) | 8/9 correct; 1 miss; 0 wrong; 0 unexpected; 0 unsafe | 8 verified; 0 failed; 0 invalid | **Partial** | 1/9 eligible field(s) missed; 8/9 independently expected field(s) correctly mapped ready |
| 2 | [sugataresearch.com](https://www.sugataresearch.com/contact/) | Japan | WordPress; 1 form(s), 7 field(s) | 4/5 correct; 1 miss; 0 wrong; 0 unexpected; 0 unsafe | 4 verified; 0 failed; 0 invalid | **Partial** | 1/5 eligible field(s) missed; 4/5 independently expected field(s) correctly mapped ready |
| 3 | [kokusai-commerce.co.jp](https://kokusai-commerce.co.jp/inquiry/) | Japan | WordPress, Contact Form 7, reCAPTCHA; 1 form(s), 10 field(s) | 4/5 correct; 0 miss; 1 wrong; 0 unexpected; 0 unsafe | 5 verified; 0 failed; 0 invalid | **Fail** | 1 wrong eligible mapping(s); 0 unexpected ready mapping(s); 4/5 independently expected field(s) correctly mapped ready |
| 4 | [jam-net.co.jp](https://www.jam-net.co.jp/eng/form/) | Japan | WordPress, Elementor, Contact Form 7, reCAPTCHA; 1 form(s), 27 field(s) | 3/8 correct; 5 miss; 0 wrong; 1 unexpected; 0 unsafe | 3 verified; 1 failed; 0 invalid | **Fail** | 5/8 eligible field(s) missed; 0 wrong eligible mapping(s); 1 unexpected ready mapping(s); 1 native value verification failure(s); 3/8 independently expected field(s) correctly mapped ready |
| 5 | [corp.kt.com](https://corp.kt.com/eng/html/global/inquiry/main.html) | South Korea | Unclassified HTML/CMS; 0 form(s), 0 field(s) | — | — | **Blocked** | no visible fillable fields in fetched HTML |
| 6 | [legrand.com](https://www.legrand.com/fr/contact) | France | Drupal, reCAPTCHA; 3 form(s), 48 field(s) | 4/8 correct; 3 miss; 1 wrong; 26 unexpected; 0 unsafe | 5 verified; 26 failed; 0 invalid | **Fail** | 3/8 eligible field(s) missed; 1 wrong eligible mapping(s); 26 unexpected ready mapping(s); 26 native value verification failure(s); 48 fields extracted across page; likely multiple/overscoped forms; 4/8 independently expected field(s) correctly mapped ready |
| 7 | [dropsa.com](https://www.dropsa.com/en/contact-form) | Italy | reCAPTCHA; 3 form(s), 15 field(s) | 5/8 correct; 3 miss; 0 wrong; 0 unexpected; 0 unsafe | 5 verified; 0 failed; 0 invalid | **Partial** | 3/8 eligible field(s) missed; 1 sensitive field(s) safely skipped; 5 prefilled field(s) preserved; 5/8 independently expected field(s) correctly mapped ready |
| 8 | [noze.it](https://www.noze.it/en/contact/) | Italy | Unclassified HTML/CMS; 1 form(s), 6 field(s) | 4/4 correct; 0 miss; 0 wrong; 0 unexpected; 0 unsafe | 4 verified; 0 failed; 0 invalid | **Pass** | 4/4 independently expected field(s) correctly mapped ready |
| 9 | [crmsistemas.com](https://crmsistemas.com/contacto) | Spain | Unclassified HTML/CMS; 1 form(s), 7 field(s) | 3/3 correct; 0 miss; 0 wrong; 0 unexpected; 0 unsafe | 3 verified; 0 failed; 0 invalid | **Pass** | 1 prefilled field(s) preserved; 3/3 independently expected field(s) correctly mapped ready |
| 10 | [orbanya.com](https://orbanya.com/formulario-contacto/) | Spain | WordPress; 1 form(s), 15 field(s) | 2/4 correct; 2 miss; 0 wrong; 0 unexpected; 0 unsafe | 1 verified; 1 failed; 0 invalid | **Fail** | 2/4 eligible field(s) missed; 1 native value verification failure(s); 2/4 independently expected field(s) correctly mapped ready |
| 11 | [companybrazil.com.br](https://companybrazil.com.br/fale-conosco/) | Brazil | WordPress, Elementor; 1 form(s), 6 field(s) | 2/4 correct; 1 miss; 1 wrong; 0 unexpected; 0 unsafe | 3 verified; 0 failed; 0 invalid | **Fail** | 1/4 eligible field(s) missed; 1 wrong eligible mapping(s); 0 unexpected ready mapping(s); 2/4 independently expected field(s) correctly mapped ready |
| 12 | [klbrasil.com.br](https://www.klbrasil.com.br/contato) | Brazil | unavailable; 0 form(s), 0 field(s) | — | — | **Blocked** | HTTP 403 |
| 13 | [plastimetal.com.mx](https://plastimetal.com.mx/contacto) | Mexico | Vue; 1 form(s), 4 field(s) | 1/2 correct; 1 miss; 0 wrong; 0 unexpected; 0 unsafe | 1 verified; 0 failed; 0 invalid | **Partial** | 1/2 eligible field(s) missed; 1/2 independently expected field(s) correctly mapped ready |
| 14 | [setupyourcompany.ie](https://www.setupyourcompany.ie/contact) | Ireland | reCAPTCHA; 1 form(s), 5 field(s) | 3/3 correct; 0 miss; 0 wrong; 0 unexpected; 0 unsafe | 3 verified; 0 failed; 0 invalid | **Pass** | 3/3 independently expected field(s) correctly mapped ready |
| 15 | [australiabusinessnames.com.au](https://australiabusinessnames.com.au/contact) | Australia | Unclassified HTML/CMS; 1 form(s), 4 field(s) | 3/3 correct; 0 miss; 0 wrong; 0 unexpected; 0 unsafe | 3 verified; 0 failed; 0 invalid | **Pass** | 3/3 independently expected field(s) correctly mapped ready |
| 16 | [salientcorporate.com.au](https://salientcorporate.com.au/contact) | Australia | Unclassified HTML/CMS; 1 form(s), 4 field(s) | 1/1 correct; 0 miss; 0 wrong; 0 unexpected; 0 unsafe | 1 verified; 0 failed; 0 invalid | **Pass** | 1/1 independently expected field(s) correctly mapped ready |
| 17 | [mtcau.com](https://mtcau.com/contact) | Australia | iframe form; 1 form(s), 8 field(s) | 4/5 correct; 0 miss; 1 wrong; 0 unexpected; 0 unsafe | 5 verified; 0 failed; 0 invalid | **Fail** | 1 wrong eligible mapping(s); 0 unexpected ready mapping(s); 1 prefilled field(s) preserved; 4/5 independently expected field(s) correctly mapped ready |
| 18 | [launtel.net.au](https://www.launtel.net.au/contact/) | Australia | Unclassified HTML/CMS; 1 form(s), 8 field(s) | 3/4 correct; 1 miss; 0 wrong; 0 unexpected; 0 unsafe | 3 verified; 0 failed; 0 invalid | **Partial** | 1/4 eligible field(s) missed; 1 custom ARIA/contenteditable field(s) need full-browser actuation; 3/4 independently expected field(s) correctly mapped ready |
| 19 | [pressform.com.au](https://pressform.com.au/contacts) | Australia | reCAPTCHA; 4 form(s), 11 field(s) | 8/8 correct; 0 miss; 0 wrong; 0 unexpected; 0 unsafe | 8 verified; 0 failed; 0 invalid | **Pass** | 8/8 independently expected field(s) correctly mapped ready |
| 20 | [can.ca](https://www.can.ca/contact-us) | Canada | reCAPTCHA; 0 form(s), 0 field(s) | — | — | **Blocked** | no visible fillable fields in fetched HTML |
| 21 | [czech-company.com](https://www.czech-company.com/en/contact-us/) | Czech Republic | WordPress, Elementor, Divi; 2 form(s), 8 field(s) | 2/4 correct; 2 miss; 0 wrong; 0 unexpected; 0 unsafe | 2 verified; 0 failed; 0 invalid | **Partial** | 2/4 eligible field(s) missed; 2/4 independently expected field(s) correctly mapped ready |
| 22 | [woo.cz](https://woo.cz/en/contact-us/) | Czech Republic | WordPress, Elementor, reCAPTCHA; 3 form(s), 19 field(s) | 11/12 correct; 1 miss; 0 wrong; 0 unexpected; 0 unsafe | 11 verified; 0 failed; 0 invalid | **Partial** | 1/12 eligible field(s) missed; 1 prefilled field(s) preserved; 11/12 independently expected field(s) correctly mapped ready |
| 23 | [webforte.cz](https://webforte.cz/en/contact) | Czech Republic | Next.js; 1 form(s), 11 field(s) | 4/4 correct; 0 miss; 0 wrong; 0 unexpected; 0 unsafe | 4 verified; 0 failed; 0 invalid | **Partial** | 2 custom ARIA/contenteditable field(s) need full-browser actuation; 2 prefilled field(s) preserved; 4/4 independently expected field(s) correctly mapped ready |
| 24 | [formpress.com](https://formpress.com/en/contact-en/) | Sweden | WordPress, Gravity Forms, Contact Form 7, reCAPTCHA; 4 form(s), 14 field(s) | 8/9 correct; 1 miss; 0 wrong; 0 unexpected; 0 unsafe | 8 verified; 0 failed; 0 invalid | **Partial** | 1/9 eligible field(s) missed; 8/9 independently expected field(s) correctly mapped ready |
| 25 | [clearlyofsweden.com](https://clearlyofsweden.com/contact/) | Sweden | Unclassified HTML/CMS; 8 form(s), 14 field(s) | 4/4 correct; 0 miss; 0 wrong; 0 unexpected; 0 unsafe | 4 verified; 0 failed; 0 invalid | **Pass** | 7 prefilled field(s) preserved; 4/4 independently expected field(s) correctly mapped ready |
| 26 | [tpf.com.pl](https://tpf.com.pl/en/contact) | Poland | reCAPTCHA; 1 form(s), 7 field(s) | 2/3 correct; 0 miss; 1 wrong; 0 unexpected; 0 unsafe | 3 verified; 0 failed; 0 invalid | **Fail** | 1 wrong eligible mapping(s); 0 unexpected ready mapping(s); 2/3 independently expected field(s) correctly mapped ready |
| 27 | [transparentdata.pl](https://transparentdata.pl/en/contact) | Poland | React, Next.js; 1 form(s), 13 field(s) | 2/3 correct; 0 miss; 1 wrong; 1 unexpected; 0 unsafe | 3 verified; 1 failed; 0 invalid | **Fail** | 1 wrong eligible mapping(s); 1 unexpected ready mapping(s); 1 native value verification failure(s); 2/3 independently expected field(s) correctly mapped ready |
| 28 | [midas-industries.eu](https://www.midas-industries.eu/contact/) | Poland | Unclassified HTML/CMS; 1 form(s), 16 field(s) | 4/6 correct; 1 miss; 1 wrong; 0 unexpected; 0 unsafe | 5 verified; 0 failed; 0 invalid | **Fail** | 1/6 eligible field(s) missed; 1 wrong eligible mapping(s); 0 unexpected ready mapping(s); 1 unresolved select option(s); 4/6 independently expected field(s) correctly mapped ready |
| 29 | [secfingroup.com](https://secfingroup.com/contact-us/) | Malaysia | WordPress, Elementor, Contact Form 7; 2 form(s), 8 field(s) | 4/5 correct; 0 miss; 1 wrong; 0 unexpected; 0 unsafe | 5 verified; 0 failed; 0 invalid | **Fail** | 1 wrong eligible mapping(s); 0 unexpected ready mapping(s); 4/5 independently expected field(s) correctly mapped ready |
| 30 | [oblique.com.my](https://oblique.com.my/contact) | Malaysia | Next.js; 1 form(s), 7 field(s) | 4/4 correct; 0 miss; 0 wrong; 0 unexpected; 0 unsafe | 4 verified; 0 failed; 0 invalid | **Pass** | 4/4 independently expected field(s) correctly mapped ready |
| 31 | [canone.com.my](https://canone.com.my/contact/) | Malaysia | WordPress, Elementor, reCAPTCHA; 2 form(s), 10 field(s) | 3/5 correct; 1 miss; 1 wrong; 0 unexpected; 0 unsafe | 4 verified; 0 failed; 0 invalid | **Fail** | 1/5 eligible field(s) missed; 1 wrong eligible mapping(s); 0 unexpected ready mapping(s); 2 prefilled field(s) preserved; 3/5 independently expected field(s) correctly mapped ready |
| 32 | [incorporate.my](https://www.incorporate.my/) | Malaysia | Unclassified HTML/CMS; 1 form(s), 6 field(s) | 2/4 correct; 0 miss; 2 wrong; 0 unexpected; 0 unsafe | 3 verified; 1 failed; 0 invalid | **Fail** | 2 wrong eligible mapping(s); 0 unexpected ready mapping(s); 1 native value verification failure(s); 2/4 independently expected field(s) correctly mapped ready |
| 33 | [designandprint.sg](https://designandprint.sg/contact-form/) | Singapore | unavailable; 0 form(s), 0 field(s) | — | — | **Blocked** | DNS failure |
| 34 | [elevatespot.sg](https://elevatespot.sg/contact/) | Singapore | WordPress, Elementor; 3 form(s), 8 field(s) | 3/4 correct; 0 miss; 1 wrong; 0 unexpected; 0 unsafe | 4 verified; 0 failed; 0 invalid | **Fail** | 1 wrong eligible mapping(s); 0 unexpected ready mapping(s); 3/4 independently expected field(s) correctly mapped ready |
| 35 | [zilo.co.za](https://zilo.co.za/contact) | South Africa | reCAPTCHA; 2 form(s), 10 field(s) | 5/7 correct; 0 miss; 2 wrong; 0 unexpected; 0 unsafe | 7 verified; 0 failed; 0 invalid | **Fail** | 2 wrong eligible mapping(s); 0 unexpected ready mapping(s); 5/7 independently expected field(s) correctly mapped ready |
| 36 | [netsolveit.co.za](https://www.netsolveit.co.za/contact-us/) | South Africa | unavailable; 0 form(s), 0 field(s) | — | — | **Blocked** | HTTP 404 |
| 37 | [khemo.co.za](https://www.khemo.co.za/contact) | South Africa | Next.js; 1 form(s), 5 field(s) | 2/3 correct; 0 miss; 1 wrong; 0 unexpected; 0 unsafe | 3 verified; 0 failed; 0 invalid | **Fail** | 1 wrong eligible mapping(s); 0 unexpected ready mapping(s); 2/3 independently expected field(s) correctly mapped ready |
| 38 | [legrand.co.za](https://www.legrand.co.za/contactus.html) | South Africa | Unclassified HTML/CMS; 0 form(s), 15 field(s) | 5/9 correct; 2 miss; 2 wrong; 0 unexpected; 0 unsafe | 7 verified; 0 failed; 0 invalid | **Fail** | 2/9 eligible field(s) missed; 2 wrong eligible mapping(s); 0 unexpected ready mapping(s); 3 prefilled field(s) preserved; 5/9 independently expected field(s) correctly mapped ready |
| 39 | [nzbn.govt.nz](https://www.nzbn.govt.nz/about-us/contact-us/) | New Zealand | Unclassified HTML/CMS; 0 form(s), 0 field(s) | — | — | **Blocked** | no visible fillable fields in fetched HTML |
| 40 | [companiesoffice.govt.nz](https://www.companiesoffice.govt.nz/about-us/contact-us/email-us/) | New Zealand | reCAPTCHA; 3 form(s), 18 field(s) | 6/10 correct; 1 miss; 3 wrong; 2 unexpected; 0 unsafe | 9 verified; 2 failed; 0 invalid | **Fail** | 1/10 eligible field(s) missed; 3 wrong eligible mapping(s); 2 unexpected ready mapping(s); 2 native value verification failure(s); 5 prefilled field(s) preserved; 6/10 independently expected field(s) correctly mapped ready |
| 41 | [firstbusiness.co.nz](https://firstbusiness.co.nz/contact/) | New Zealand | Unclassified HTML/CMS; 1 form(s), 6 field(s) | 3/3 correct; 0 miss; 0 wrong; 0 unexpected; 0 unsafe | 3 verified; 0 failed; 1 invalid | **Fail** | 1 filled value(s) violate HTML constraints; 1 sensitive field(s) safely skipped; 3/3 independently expected field(s) correctly mapped ready |
| 42 | [thenetworkers.co.nz](https://thenetworkers.co.nz/contact-us/) | New Zealand | WordPress, Elementor, reCAPTCHA; 4 form(s), 14 field(s) | 7/9 correct; 1 miss; 1 wrong; 0 unexpected; 0 unsafe | 8 verified; 0 failed; 0 invalid | **Fail** | 1/9 eligible field(s) missed; 1 wrong eligible mapping(s); 0 unexpected ready mapping(s); 2 prefilled field(s) preserved; 7/9 independently expected field(s) correctly mapped ready |
| 43 | [ceda.nz](https://ceda.nz/contact/) | New Zealand | WordPress, Contact Form 7, reCAPTCHA, hCaptcha; 1 form(s), 6 field(s) | 4/4 correct; 0 miss; 0 wrong; 0 unexpected; 0 unsafe | 4 verified; 0 failed; 0 invalid | **Pass** | 4/4 independently expected field(s) correctly mapped ready |
| 44 | [2degrees.nz](https://www.2degrees.nz/business/contact-us) | New Zealand | Drupal; 1 form(s), 20 field(s) | 5/8 correct; 1 miss; 2 wrong; 0 unexpected; 1 unsafe | 7 verified; 1 failed; 2 invalid | **Fail** | 1/8 eligible field(s) missed; 2 wrong eligible mapping(s); 0 unexpected ready mapping(s); 1 honeypot/file/consent control(s) marked ready; 1 native value verification failure(s); 2 filled value(s) violate HTML constraints; 1 sensitive field(s) safely skipped; 2 prefilled field(s) preserved; 5/8 independently expected field(s) correctly mapped ready |
| 45 | [jle.co.nz](https://www.jle.co.nz/en-nz/contact) | New Zealand | Unclassified HTML/CMS; 3 form(s), 9 field(s) | 5/6 correct; 0 miss; 1 wrong; 0 unexpected; 0 unsafe | 6 verified; 0 failed; 0 invalid | **Fail** | 1 wrong eligible mapping(s); 0 unexpected ready mapping(s); 1 prefilled field(s) preserved; 5/6 independently expected field(s) correctly mapped ready |
| 46 | [kone.co.ke](https://www.kone.co.ke/about-us/contact-us/contact-form/) | Kenya | reCAPTCHA; 4 form(s), 24 field(s) | 7/7 correct; 0 miss; 0 wrong; 3 unexpected; 1 unsafe | 7 verified; 4 failed; 0 invalid | **Fail** | 0 wrong eligible mapping(s); 3 unexpected ready mapping(s); 1 honeypot/file/consent control(s) marked ready; 4 native value verification failure(s); 1 custom ARIA/contenteditable field(s) need full-browser actuation; 1 prefilled field(s) preserved; 7/7 independently expected field(s) correctly mapped ready |
| 47 | [sentire.co.ke](https://www.sentire.co.ke/contact/) | Kenya | HubSpot; 1 form(s), 7 field(s) | 5/5 correct; 0 miss; 0 wrong; 0 unexpected; 0 unsafe | 5 verified; 0 failed; 0 invalid | **Pass** | 5/5 independently expected field(s) correctly mapped ready |
| 48 | [ibauae.com](https://www.ibauae.com/contact-us) | United Arab Emirates | Next.js; 1 form(s), 7 field(s) | 4/5 correct; 0 miss; 1 wrong; 0 unexpected; 0 unsafe | 5 verified; 0 failed; 0 invalid | **Fail** | 1 wrong eligible mapping(s); 0 unexpected ready mapping(s); 4/5 independently expected field(s) correctly mapped ready |
| 49 | [incorporate.ae](https://incorporate.ae/en/contact) | United Arab Emirates | Next.js, reCAPTCHA; 1 form(s), 8 field(s) | 3/5 correct; 0 miss; 2 wrong; 0 unexpected; 0 unsafe | 5 verified; 0 failed; 0 invalid | **Fail** | 2 wrong eligible mapping(s); 0 unexpected ready mapping(s); 1 custom ARIA/contenteditable field(s) need full-browser actuation; 1 prefilled field(s) preserved; 3/5 independently expected field(s) correctly mapped ready |
| 50 | [trada.id](https://trada.id/form) | Indonesia | reCAPTCHA; 3 form(s), 45 field(s) | 8/24 correct; 10 miss; 6 wrong; 0 unexpected; 0 unsafe | 14 verified; 0 failed; 0 invalid | **Fail** | 10/24 eligible field(s) missed; 6 wrong eligible mapping(s); 0 unexpected ready mapping(s); 45 fields extracted across page; likely multiple/overscoped forms; 8/24 independently expected field(s) correctly mapped ready |
| 51 | [elangmas.com](https://www.elangmas.com/contact) | Indonesia | reCAPTCHA; 2 form(s), 6 field(s) | 3/4 correct; 1 miss; 0 wrong; 0 unexpected; 0 unsafe | 3 verified; 0 failed; 0 invalid | **Partial** | 1/4 eligible field(s) missed; 3/4 independently expected field(s) correctly mapped ready |
| 52 | [commsult.id](https://commsult.id/en/contact-us) | Indonesia | Next.js, reCAPTCHA; 1 form(s), 6 field(s) | 3/4 correct; 0 miss; 1 wrong; 0 unexpected; 0 unsafe | 4 verified; 0 failed; 0 invalid | **Fail** | 1 wrong eligible mapping(s); 0 unexpected ready mapping(s); 3/4 independently expected field(s) correctly mapped ready |
| 53 | [linc.id](https://linc.id/contact) | Indonesia | Unclassified HTML/CMS; 1 form(s), 8 field(s) | 4/4 correct; 0 miss; 0 wrong; 0 unexpected; 0 unsafe | 4 verified; 0 failed; 0 invalid | **Pass** | 4/4 independently expected field(s) correctly mapped ready |
| 54 | [suria.co.id](https://www.suria.co.id/general-inquiry) | Indonesia | Unclassified HTML/CMS; 2 form(s), 7 field(s) | 4/4 correct; 0 miss; 0 wrong; 0 unexpected; 0 unsafe | 4 verified; 0 failed; 0 invalid | **Pass** | 4/4 independently expected field(s) correctly mapped ready |
| 55 | [ordonesia.com](https://ordonesia.com/contact-us/) | Indonesia | WordPress, Elementor; 1 form(s), 7 field(s) | 3/4 correct; 0 miss; 1 wrong; 0 unexpected; 0 unsafe | 4 verified; 0 failed; 0 invalid | **Fail** | 1 wrong eligible mapping(s); 0 unexpected ready mapping(s); 1 prefilled field(s) preserved; 3/4 independently expected field(s) correctly mapped ready |
| 56 | [pasi.ph](https://pasi.ph/contact/) | Philippines | WordPress, Elementor, HubSpot; 1 form(s), 7 field(s) | 6/6 correct; 0 miss; 0 wrong; 0 unexpected; 0 unsafe | 6 verified; 0 failed; 0 invalid | **Pass** | 6/6 independently expected field(s) correctly mapped ready |
| 57 | [beiersdorf.co.th](https://www.beiersdorf.co.th/meta-pages/contact/contact-form) | Thailand | Unclassified HTML/CMS; 2 form(s), 26 field(s) | 9/10 correct; 0 miss; 1 wrong; 0 unexpected; 0 unsafe | 10 verified; 0 failed; 0 invalid | **Fail** | 1 wrong eligible mapping(s); 0 unexpected ready mapping(s); 1 prefilled field(s) preserved; 9/10 independently expected field(s) correctly mapped ready |
| 58 | [d1asia.co.th](https://www.d1asia.co.th/contact-us) | Thailand | unavailable; 0 form(s), 0 field(s) | — | — | **Blocked** | HTTP 403 |
| 59 | [bestsuccess.asia](https://www.bestsuccess.asia/contact) | Thailand | Elementor, Wix, React; 1 form(s), 5 field(s) | 3/4 correct; 0 miss; 1 wrong; 0 unexpected; 0 unsafe | 4 verified; 0 failed; 0 invalid | **Fail** | 1 wrong eligible mapping(s); 0 unexpected ready mapping(s); 3/4 independently expected field(s) correctly mapped ready |
| 60 | [kone.co.th](https://www.kone.co.th/en/about-us/contact-us/) | Thailand | reCAPTCHA; 4 form(s), 23 field(s) | 7/7 correct; 0 miss; 0 wrong; 3 unexpected; 1 unsafe | 7 verified; 4 failed; 0 invalid | **Fail** | 0 wrong eligible mapping(s); 3 unexpected ready mapping(s); 1 honeypot/file/consent control(s) marked ready; 4 native value verification failure(s); 1 custom ARIA/contenteditable field(s) need full-browser actuation; 1 prefilled field(s) preserved; 7/7 independently expected field(s) correctly mapped ready |
| 61 | [hinsitsu.co.th](https://hinsitsu.co.th/en/inquiry-form) | Thailand | reCAPTCHA; 2 form(s), 6 field(s) | 4/4 correct; 0 miss; 0 wrong; 0 unexpected; 0 unsafe | 4 verified; 0 failed; 0 invalid | **Pass** | 4/4 independently expected field(s) correctly mapped ready |
| 62 | [apis.de](https://www.apis.de/en/contactform) | Germany | hCaptcha; 1 form(s), 19 field(s) | 7/8 correct; 1 miss; 0 wrong; 0 unexpected; 0 unsafe | 7 verified; 0 failed; 0 invalid | **Partial** | 1/8 eligible field(s) missed; 3 prefilled field(s) preserved; 7/8 independently expected field(s) correctly mapped ready |
| 63 | [compronet.de](https://www.compronet.de/en/contact) | Germany | reCAPTCHA; 1 form(s), 23 field(s) | 4/5 correct; 0 miss; 1 wrong; 1 unexpected; 0 unsafe | 5 verified; 1 failed; 0 invalid | **Fail** | 1 wrong eligible mapping(s); 1 unexpected ready mapping(s); 1 native value verification failure(s); 1 sensitive field(s) safely skipped; 2 prefilled field(s) preserved; 4/5 independently expected field(s) correctly mapped ready |
| 64 | [ind.nl](https://ind.nl/en/service-and-contact/contact-with-ind/e-mail) | Netherlands | Drupal; 2 form(s), 25 field(s) | 4/5 correct; 0 miss; 1 wrong; 1 unexpected; 0 unsafe | 6 verified; 0 failed; 0 invalid | **Fail** | 1 wrong eligible mapping(s); 1 unexpected ready mapping(s); 4/5 independently expected field(s) correctly mapped ready |
| 65 | [unless.com](https://unless.com/en/contact-us/) | Netherlands | Unclassified HTML/CMS; 2 form(s), 11 field(s) | 3/4 correct; 0 miss; 1 wrong; 4 unexpected; 0 unsafe | 4 verified; 4 failed; 0 invalid | **Fail** | 1 wrong eligible mapping(s); 4 unexpected ready mapping(s); 4 native value verification failure(s); 3/4 independently expected field(s) correctly mapped ready |
| 66 | [companyinfo.nl](https://companyinfo.nl/en/contact/) | Netherlands | WordPress, reCAPTCHA; 1 form(s), 12 field(s) | 4/5 correct; 0 miss; 1 wrong; 0 unexpected; 0 unsafe | 5 verified; 0 failed; 0 invalid | **Fail** | 1 wrong eligible mapping(s); 0 unexpected ready mapping(s); 1 prefilled field(s) preserved; 4/5 independently expected field(s) correctly mapped ready |
| 67 | [businesscom.eu](https://businesscom.eu/contact/) | Netherlands | Unclassified HTML/CMS; 1 form(s), 4 field(s) | 2/3 correct; 0 miss; 1 wrong; 0 unexpected; 0 unsafe | 3 verified; 0 failed; 0 invalid | **Fail** | 1 wrong eligible mapping(s); 0 unexpected ready mapping(s); 2/3 independently expected field(s) correctly mapped ready |
| 68 | [kone.co.uk](https://www.kone.co.uk/about-us/contact-us/) | United Kingdom | Unclassified HTML/CMS; 4 form(s), 27 field(s) | 9/10 correct; 1 miss; 0 wrong; 3 unexpected; 1 unsafe | 9 verified; 4 failed; 0 invalid | **Fail** | 1/10 eligible field(s) missed; 0 wrong eligible mapping(s); 3 unexpected ready mapping(s); 1 honeypot/file/consent control(s) marked ready; 1 unresolved select option(s); 4 native value verification failure(s); 1 custom ARIA/contenteditable field(s) need full-browser actuation; 1 prefilled field(s) preserved; 9/10 independently expected field(s) correctly mapped ready |
| 69 | [companiesuk.net](https://companiesuk.net/contact-us/) | United Kingdom | WordPress, Contact Form 7, reCAPTCHA; 1 form(s), 7 field(s) | 5/5 correct; 0 miss; 0 wrong; 0 unexpected; 0 unsafe | 5 verified; 0 failed; 0 invalid | **Pass** | 5/5 independently expected field(s) correctly mapped ready |
| 70 | [systemsinterface.com](https://www.systemsinterface.com/contact-us) | United Kingdom | Drupal, reCAPTCHA; 2 form(s), 10 field(s) | 6/7 correct; 1 miss; 0 wrong; 0 unexpected; 0 unsafe | 6 verified; 0 failed; 0 invalid | **Partial** | 1/7 eligible field(s) missed; 1 unresolved select option(s); 6/7 independently expected field(s) correctly mapped ready |
| 71 | [clevercompanyformations.co.uk](https://clevercompanyformations.co.uk/contact-us.html) | United Kingdom | Webflow; 1 form(s), 4 field(s) | 3/3 correct; 0 miss; 0 wrong; 0 unexpected; 0 unsafe | 3 verified; 0 failed; 0 invalid | **Pass** | 3/3 independently expected field(s) correctly mapped ready |
| 72 | [jbit.com.ar](https://www.jbit.com.ar/contact/) | Argentina | Unclassified HTML/CMS; 1 form(s), 9 field(s) | 2/6 correct; 2 miss; 2 wrong; 0 unexpected; 0 unsafe | 4 verified; 0 failed; 0 invalid | **Fail** | 2/6 eligible field(s) missed; 2 wrong eligible mapping(s); 0 unexpected ready mapping(s); 2/6 independently expected field(s) correctly mapped ready |
| 73 | [koble.com.ar](https://koble.com.ar/contacto) | Argentina | Next.js; 1 form(s), 7 field(s) | 4/4 correct; 0 miss; 0 wrong; 0 unexpected; 0 unsafe | 4 verified; 0 failed; 0 invalid | **Pass** | 4/4 independently expected field(s) correctly mapped ready |
| 74 | [exdata.com.ar](https://exdata.com.ar/contact/) | Argentina | Next.js; 1 form(s), 6 field(s) | 2/4 correct; 0 miss; 2 wrong; 0 unexpected; 0 unsafe | 4 verified; 0 failed; 0 invalid | **Fail** | 2 wrong eligible mapping(s); 0 unexpected ready mapping(s); 2/4 independently expected field(s) correctly mapped ready |
| 75 | [nextcommerce.com.ar](https://www.nextcommerce.com.ar/contact) | Argentina | Next.js; 1 form(s), 7 field(s) | 5/5 correct; 0 miss; 0 wrong; 0 unexpected; 0 unsafe | 5 verified; 0 failed; 0 invalid | **Pass** | 5/5 independently expected field(s) correctly mapped ready |
| 76 | [tca.cl](https://www.tca.cl/es_CL/contacto/formulario) | Chile | reCAPTCHA; 2 form(s), 6 field(s) | 4/4 correct; 0 miss; 0 wrong; 0 unexpected; 0 unsafe | 4 verified; 0 failed; 0 invalid | **Pass** | 4/4 independently expected field(s) correctly mapped ready |
| 77 | [herrajes.cl](https://herrajes.cl/contacto) | Chile | reCAPTCHA, iframe form; 13 form(s), 32 field(s) | 9/20 correct; 9 miss; 2 wrong; 0 unexpected; 0 unsafe | 11 verified; 0 failed; 0 invalid | **Fail** | 9/20 eligible field(s) missed; 2 wrong eligible mapping(s); 0 unexpected ready mapping(s); 3 sensitive field(s) safely skipped; 1 prefilled field(s) preserved; 9/20 independently expected field(s) correctly mapped ready |
| 78 | [sectrade.cl](https://sectrade.cl/contacto/) | Chile | WordPress, Divi, reCAPTCHA; 1 form(s), 5 field(s) | 2/4 correct; 2 miss; 0 wrong; 0 unexpected; 0 unsafe | 2 verified; 0 failed; 0 invalid | **Partial** | 2/4 eligible field(s) missed; 2/4 independently expected field(s) correctly mapped ready |
| 79 | [yara.cl](https://www.yara.cl/contacto/) | Chile | reCAPTCHA, hCaptcha; 2 form(s), 31 field(s) | 1/5 correct; 0 miss; 4 wrong; 25 unexpected; 1 unsafe | 8 verified; 23 failed; 2 invalid | **Fail** | 4 wrong eligible mapping(s); 25 unexpected ready mapping(s); 1 honeypot/file/consent control(s) marked ready; 23 native value verification failure(s); 2 filled value(s) violate HTML constraints; 1/5 independently expected field(s) correctly mapped ready |
| 80 | [formapro.cl](https://formapro.cl/contacto/) | Chile | WordPress; 0 form(s), 0 field(s) | — | — | **Blocked** | no visible fillable fields in fetched HTML |
| 81 | [sscolombia.co](https://www.sscolombia.co/contacto) | Colombia | Elementor, Wix, React; 1 form(s), 8 field(s) | 2/5 correct; 3 miss; 0 wrong; 0 unexpected; 0 unsafe | 2 verified; 0 failed; 0 invalid | **Partial** | 3/5 eligible field(s) missed; 1 custom ARIA/contenteditable field(s) need full-browser actuation; 1 prefilled field(s) preserved; 2/5 independently expected field(s) correctly mapped ready |
| 82 | [soplascol.com](https://soplascol.com/contacto/) | Colombia | WordPress, Elementor, Contact Form 7, reCAPTCHA; 1 form(s), 9 field(s) | 2/4 correct; 2 miss; 0 wrong; 0 unexpected; 0 unsafe | 2 verified; 0 failed; 0 invalid | **Partial** | 2/4 eligible field(s) missed; 2/4 independently expected field(s) correctly mapped ready |
| 83 | [myformula.pt](https://www.myformula.pt/index.php?route=information%2Fcontact) | Portugal | OpenCart; 2 form(s), 9 field(s) | 2/3 correct; 0 miss; 1 wrong; 1 unexpected; 0 unsafe | 4 verified; 0 failed; 0 invalid | **Fail** | 1 wrong eligible mapping(s); 1 unexpected ready mapping(s); 2/3 independently expected field(s) correctly mapped ready |
| 84 | [danmil.com](https://www.danmil.com/en/contact-us) | Denmark | HubSpot; 1 form(s), 11 field(s) | 6/8 correct; 1 miss; 1 wrong; 0 unexpected; 0 unsafe | 7 verified; 0 failed; 0 invalid | **Fail** | 1/8 eligible field(s) missed; 1 wrong eligible mapping(s); 0 unexpected ready mapping(s); 1 unresolved select option(s); 6/8 independently expected field(s) correctly mapped ready |
| 85 | [dearfuture.dk](https://www.dearfuture.dk/en/contact) | Denmark | Unclassified HTML/CMS; 1 form(s), 5 field(s) | 3/4 correct; 1 miss; 0 wrong; 0 unexpected; 0 unsafe | 3 verified; 0 failed; 0 invalid | **Partial** | 1/4 eligible field(s) missed; 3/4 independently expected field(s) correctly mapped ready |
| 86 | [findapro.fi](https://findapro.fi/contact-page/) | Finland | WordPress; 2 form(s), 15 field(s) | 6/8 correct; 0 miss; 2 wrong; 1 unexpected; 0 unsafe | 8 verified; 1 failed; 0 invalid | **Fail** | 2 wrong eligible mapping(s); 1 unexpected ready mapping(s); 1 native value verification failure(s); 6/8 independently expected field(s) correctly mapped ready |
| 87 | [processgenius.eu](https://processgenius.eu/company/contact-us/) | Finland | WordPress, Elementor, HubSpot, reCAPTCHA; 1 form(s), 6 field(s) | 4/4 correct; 0 miss; 0 wrong; 0 unexpected; 0 unsafe | 4 verified; 0 failed; 0 invalid | **Pass** | 4/4 independently expected field(s) correctly mapped ready |
| 88 | [zef.fi](https://www.zef.fi/en/contact/) | Finland | Unclassified HTML/CMS; 1 form(s), 7 field(s) | 4/5 correct; 0 miss; 1 wrong; 0 unexpected; 0 unsafe | 5 verified; 0 failed; 0 invalid | **Fail** | 1 wrong eligible mapping(s); 0 unexpected ready mapping(s); 4/5 independently expected field(s) correctly mapped ready |
| 89 | [weform.agency](https://weform.agency/hello) | Norway | Unclassified HTML/CMS; 1 form(s), 8 field(s) | 6/7 correct; 0 miss; 1 wrong; 0 unexpected; 0 unsafe | 7 verified; 0 failed; 0 invalid | **Fail** | 1 wrong eligible mapping(s); 0 unexpected ready mapping(s); 6/7 independently expected field(s) correctly mapped ready |
| 90 | [xperconsulting.no](https://xperconsulting.no/skjema/kontakt-oss) | Norway | Unclassified HTML/CMS; 0 form(s), 0 field(s) | — | — | **Blocked** | no visible fillable fields in fetched HTML |
| 91 | [samtext.com](https://www.samtext.com/contact-us/) | Norway | WordPress, Contact Form 7; 3 form(s), 10 field(s) | 4/4 correct; 0 miss; 0 wrong; 0 unexpected; 0 unsafe | 4 verified; 0 failed; 0 invalid | **Pass** | 4/4 independently expected field(s) correctly mapped ready |
| 92 | [noria.no](https://www.noria.no/contact) | Norway | React, Next.js; 1 form(s), 5 field(s) | 3/3 correct; 0 miss; 0 wrong; 0 unexpected; 0 unsafe | 3 verified; 0 failed; 0 invalid | **Pass** | 3/3 independently expected field(s) correctly mapped ready |
| 93 | [euromis.com](https://www.euromis.com/contact) | Turkey | Unclassified HTML/CMS; 1 form(s), 6 field(s) | 4/5 correct; 1 miss; 0 wrong; 0 unexpected; 0 unsafe | 4 verified; 0 failed; 0 invalid | **Partial** | 1/5 eligible field(s) missed; 4/5 independently expected field(s) correctly mapped ready |
| 94 | [kone.sa](https://www.kone.sa/en/about-us/contact-us/) | Saudi Arabia | reCAPTCHA; 4 form(s), 24 field(s) | 6/6 correct; 0 miss; 0 wrong; 3 unexpected; 1 unsafe | 6 verified; 4 failed; 0 invalid | **Fail** | 0 wrong eligible mapping(s); 3 unexpected ready mapping(s); 1 honeypot/file/consent control(s) marked ready; 4 native value verification failure(s); 1 custom ARIA/contenteditable field(s) need full-browser actuation; 1 prefilled field(s) preserved; 6/6 independently expected field(s) correctly mapped ready |
| 95 | [gns.com.sa](https://gns.com.sa/contact-us) | Saudi Arabia | Webflow; 1 form(s), 6 field(s) | 2/4 correct; 1 miss; 1 wrong; 0 unexpected; 0 unsafe | 3 verified; 0 failed; 0 invalid | **Fail** | 1/4 eligible field(s) missed; 1 wrong eligible mapping(s); 0 unexpected ready mapping(s); 1 prefilled field(s) preserved; 2/4 independently expected field(s) correctly mapped ready |
| 96 | [rekazsa.com.sa](https://rekazsa.com.sa/contact-us/) | Saudi Arabia | WordPress, Elementor, reCAPTCHA; 5 form(s), 19 field(s) | 8/10 correct; 0 miss; 2 wrong; 0 unexpected; 0 unsafe | 10 verified; 0 failed; 0 invalid | **Fail** | 2 wrong eligible mapping(s); 0 unexpected ready mapping(s); 8/10 independently expected field(s) correctly mapped ready |
| 97 | [temas.vn](https://temas.vn/en/contact-us) | Vietnam | HubSpot, reCAPTCHA; 12 form(s), 75 field(s) | 30/53 correct; 23 miss; 0 wrong; 0 unexpected; 0 unsafe | 28 verified; 2 failed; 0 invalid | **Fail** | 23/53 eligible field(s) missed; 2 native value verification failure(s); 75 fields extracted across page; likely multiple/overscoped forms; 3 sensitive field(s) safely skipped; 1 prefilled field(s) preserved; 30/53 independently expected field(s) correctly mapped ready |
| 98 | [tda.company](https://www.tda.company/en/contact) | Vietnam | Next.js; 1 form(s), 6 field(s) | 4/5 correct; 0 miss; 1 wrong; 0 unexpected; 0 unsafe | 5 verified; 0 failed; 0 invalid | **Fail** | 1 wrong eligible mapping(s); 0 unexpected ready mapping(s); 4/5 independently expected field(s) correctly mapped ready |
| 99 | [businesspartner.vn](https://businesspartner.vn/contact/) | Vietnam | WordPress, Elementor; 1 form(s), 14 field(s) | 4/8 correct; 1 miss; 3 wrong; 0 unexpected; 0 unsafe | 7 verified; 0 failed; 0 invalid | **Fail** | 1/8 eligible field(s) missed; 3 wrong eligible mapping(s); 0 unexpected ready mapping(s); 4/8 independently expected field(s) correctly mapped ready |
| 100 | [helistar.com.tw](https://www.helistar.com.tw/contact) | Taiwan | Webflow; 2 form(s), 19 field(s) | 4/5 correct; 0 miss; 1 wrong; 5 unexpected; 0 unsafe | 5 verified; 5 failed; 0 invalid | **Fail** | 1 wrong eligible mapping(s); 5 unexpected ready mapping(s); 5 native value verification failure(s); 4/5 independently expected field(s) correctly mapped ready |

## Prioritized fix plan

No fixes were applied during QA. Implement in batches; reload only after each phase is complete and automated gates pass.

### Phase 1 — Safety invariants and frame correctness (P0)

1. Make RPC frame-aware: namespace field IDs by tab/frame/document; collect frame responses; route plans/fills only to owning frame; mount one top-level preview.
2. Reapply sensitive, prefilled, honeypot, file, consent/legal, and marketing exclusions after cache lookup and immediately before actuation.
3. Re-resolve target elements at execution/verification; reject detached nodes.
4. Isolate errors per field so one unsupported control cannot abort remaining safe fills.
5. Add explicit submit/navigation guards to QA builds.

Acceptance gates:

- zero cross-frame writes in nested same-origin and cross-origin fixtures;
- zero writes to prefilled, sensitive, honeypot, file, consent, or marketing controls on cold and warm-cache runs;
- zero final submissions/navigation events.

### Phase 2 — Mapping precision and form scoping (P1)

1. Parse `autocomplete` tokens before label heuristics.
2. Match specific semantics before generic terms: company name, organization, company website, country, first name, and last name before generic “name.”
3. Scope extraction/plans by form or coherent section; never refine phone/address runs across form boundaries.
4. Validate prompt-returned keys against allowed profile keys and preserve model-selected option values.
5. Add regression snapshots from wrong-company and split-name examples in this report.

Acceptance gates:

- company, person-name, email, phone, address, and country precision/recall each ≥95% on saved 100-site snapshots;
- zero wrong/unexpected ready mappings;
- multi-form pages produce separate plans.

### Phase 3 — Controls and reactive frameworks (P1)

1. Introduce typed `controlKind` plus adapters for native text/select, radio groups, checkbox, ARIA combobox/listbox/radiogroup/checkbox/textbox, and contenteditable.
2. Group radios once; choose option by semantic value/text. Never treat radio values as booleans.
3. Scope combobox popup options through `aria-controls`/`aria-owns` and owning root.
4. Emit framework-safe input sequences; settle mutations; re-resolve rendered elements.
5. Re-extract after choices reveal conditional fields; support wizard passes.

Acceptance gates:

- correct retained selection for native and ARIA radio/select/combobox fixtures;
- React/Vue controlled fields remain filled at immediate, settled, and +2-second checks;
- conditional forms discover newly revealed fields without touching submit controls.

### Phase 4 — Internationalization and option resolution (P1)

1. Preserve Unicode during fuzzy normalization/tokenization.
2. Add multilingual semantic dictionaries for all 36-country matrix languages.
3. Use `Intl.DisplayNames`, ISO codes, and aliases for country options.
4. Remove fixed 20/50-option correctness limits; use bounded searchable indexes instead.

Acceptance gates:

- localized French, Spanish, Portuguese, Polish, Czech, Swedish, Japanese, Thai, Indonesian, Vietnamese, and Arabic fixtures pass;
- country selection ≥95% across localized option lists.

### Phase 5 — Validation, verification, cache, and correction UX (P1/P2)

1. Capture `minLength`, `min`, `max`, `step`, `inputMode`, `aria-required`, patterns, and transform warnings.
2. Verify connected visible DOM at immediate, settled, and +2-second checkpoints.
3. Check HTML validity, `aria-invalid`, and visible error text; normalize masks and select semantics.
4. Save mappings only after successful verification or explicit confirmed correction; preserve repeated fields in cache keys.
5. Recompute value/status immediately when preview corrections change profile key or transform.

Acceptance gates:

- zero false-green results on controlled/detached fixtures;
- zero invalid values shown as ready success;
- failed mappings never enter cache;
- preview corrections update current fill, not only future runs.

### Final Chrome E2E gate

After fixes are batched and one reload is available:

1. Replace nine blocked/stale URLs with comparable public forms.
2. Run 100/100 in Chrome with hardcoded QA profile.
3. Capture preview, filled DOM, immediate/+2-second retention, validity, page errors, frame identity, and safety guards.
4. Apply no fixes during that run.

Release target: ≥90 pass, remainder explained partial, zero fail, zero unsafe writes, zero submissions, zero sensitive/prefilled/cache regressions.

## Evidence artifacts

- `site-pool.md` — 100-site, 36-country matrix.
- `live-dom-results.json` — full field-level raw results and per-site evidence.
- `in-the-wild-report.md` — this report.
- QA harness: `scripts/live-dom-qa.test.ts` with `vitest.live.config.ts`.
- QA-only hardcoded profile is build-gated by `FORMPILOT_QA_PROFILE=1`; normal builds still require a saved profile.
- Build inspection: synthetic values absent from normal build and present in QA build; final `dist/chrome-mv3` is QA-enabled and reload-ready.
- Final verification: TypeScript compile, 8 test files / 17 tests, and Chrome MV3 build all green.
