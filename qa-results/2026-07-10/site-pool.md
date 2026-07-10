# 100-site live QA pool

Prequalified from rendered public form pages. All require cold in-browser validation before counting toward the 100-site matrix. Never submit.

| Country | URL | Expected coverage | Notes |
|---|---|---|---|
| Japan | https://www.harakougyou.jp/en/inquiry-form/ | name, company, address parts, phone, duplicate email, textarea | multi-address/native fields |
| Japan | https://www.sugataresearch.com/contact/ | step form, company, title, country, phone, email | wizard candidate |
| Japan | https://kokusai-commerce.co.jp/inquiry/ | company, address, phone, email, person, textarea | legacy/inquiry layout |
| Japan | https://www.jam-net.co.jp/eng/form/ | company/contact fields | reserve |
| South Korea | https://corp.kt.com/eng/html/global/inquiry/main.html | global business inquiry | reserve; inspect for iframe/JS controls |
| France | https://www.legrand.com/fr/contact | French labels, company, product/contact fields | enterprise/likely SPA |
| Italy | https://www.dropsa.com/en/contact-form | first/last/company/address/city/country selects | strong address/select case |
| Italy | https://www.noze.it/en/contact/ | name, company, email, topic select, textarea | simple native candidate |
| Spain | https://crmsistemas.com/contacto | Spanish labels, phone, anti-spam question | native + validation case |
| Spain | https://orbanya.com/formulario-contacto/ | Spanish contact flow | likely modern marketing stack |
| Brazil | https://companybrazil.com.br/fale-conosco/ | Portuguese name, email, masked phone, company | mask/form-builder case |
| Brazil | https://www.klbrasil.com.br/contato | Portuguese name, email, phone, textarea | simple native candidate |
| Mexico | https://plastimetal.com.mx/contacto | Spanish name, 10-digit phone, email, message | phone validation case |
| Ireland | https://www.setupyourcompany.ie/contact | name, phone, email, subject, message | WordPress-style repeated inputs |
| Australia | https://australiabusinessnames.com.au/contact | full name, email, phone, textarea | modern business form |
| Australia | https://salientcorporate.com.au/contact | first/last name, email, message | table/legacy layout candidate |
| Australia | https://mtcau.com/contact | honeypot, name, company, email, masked phone, select, message | strong safety + mask case |
| Australia | https://www.launtel.net.au/contact/ | name, address, email, phone, subject select, message | address/select case |
| Australia | https://pressform.com.au/contacts | first/last name, email, phone, project message | form-builder candidate |
| Canada | https://www.can.ca/contact-us | full name, email, phone | simple storefront/contact case |
| Czech Republic | https://www.czech-company.com/en/contact-us/ | full name, email, subject, message | simple multilingual company form |
| Czech Republic | https://woo.cz/en/contact-us/ | name, email, phone, company, website, message, consent | modern agency form |
| Czech Republic | https://webforte.cz/en/contact | honeypot, name, email, phone, URL, two selects, consent | strong validation/control case |
| Sweden | https://formpress.com/en/contact-en/ | name, company, email, phone, select, consent | dense multi-form WordPress page |
| Sweden | https://clearlyofsweden.com/contact/ | name, company, phone, email, message | simple localized form |
| Poland | https://tpf.com.pl/en/contact | name, company, phone, email, subject, consent | iframe-adjacent corporate form |
| Poland | https://transparentdata.pl/en/contact | name, email, phone, radio subjects, consent, message | custom choice controls |
| Poland | https://www.midas-industries.eu/contact/ | name, company, country, email, phone, multiple selects, location | complex RFQ intake |
| Malaysia | https://secfingroup.com/contact-us/ | service select, company, message, first/last, business email, phone | quote form with grouped sections |
| Malaysia | https://oblique.com.my/contact | name, company, email, phone, service select, message | modern agency stack |
| Malaysia | https://canone.com.my/contact/ | name, phone, company email/name, two selects, message | corporate form with repeated labels |
| Malaysia | https://www.incorporate.my/ | name, phone, email, minimum-length message | validation-heavy compact form |
| Singapore | https://designandprint.sg/contact-form/ | name, email, phone, company, message | multiple adjacent forms |
| Singapore | https://elevatespot.sg/contact/ | first/last, email, company, select, message | modern AI consultancy form |
| South Africa | https://zilo.co.za/contact | full name, email, company, phone, select, message | likely React/modern controlled form |
| South Africa | https://www.netsolveit.co.za/contact-us/ | first/surname, email, phone/mobile, company, address, select | long WordPress form |
| South Africa | https://www.khemo.co.za/contact | full name, work email, company, select, project textarea | modern service form |
| South Africa | https://www.legrand.co.za/contactus.html | split contact/company/city fields, select, privacy checkbox | enterprise legacy layout |
| New Zealand | https://www.nzbn.govt.nz/about-us/contact-us/ | full name, email, phone, business number, select, textarea, copy checkbox | government design system |
| New Zealand | https://www.companiesoffice.govt.nz/about-us/contact-us/email-us/ | select, textarea, name, email, radios, entity fields | conditional government form |
| New Zealand | https://firstbusiness.co.nz/contact/ | name, email, phone, multi-select, honeypot, message | legacy validation stack |
| New Zealand | https://thenetworkers.co.nz/contact-us/ | business, split name, email, phone, region/group selects | WordPress-style lead form |
| New Zealand | https://ceda.nz/contact/ | iframe form, split name, email, phone | iframe coverage |
| New Zealand | https://www.2degrees.nz/business/contact-us | radios, conditional repeated selects, identity/business fields, honeypot | complex reactive telco form |
| New Zealand | https://www.jle.co.nz/en-nz/contact | split name, company, service select, email, phone, message | modern corporate form |
| Kenya | https://www.kone.co.ke/about-us/contact-us/contact-form/ | split name, company, phone prefix, address, selects, radios, consent | dense enterprise conditional form; stop at CAPTCHA |
| Kenya | https://www.sentire.co.ke/contact/ | split name, work email, phone, company, request select, message | modern controlled form |
| United Arab Emirates | https://www.ibauae.com/contact-us | split name, email, international phone widget, company | country-code phone control |
| United Arab Emirates | https://incorporate.ae/en/contact | split name, email, phone, company, jurisdiction select, message | React/modern consultancy form |
| Indonesia | https://trada.id/form | company/address, split contact, email, office phone, checkbox products | multiple adjacent Indonesian forms; ignore upload and never submit |
| Indonesia | https://www.elangmas.com/contact | name, masked telephone, email, company, message | traditional CMS form |
| Indonesia | https://commsult.id/en/contact-us | name, email, split country-code phone, company, message | modern marketing stack; stop at reCAPTCHA |
| Indonesia | https://linc.id/contact | name, company, email, phone, service select, timeline, scale, message | mailto-generating client-side form; never activate send |
| Indonesia | https://www.suria.co.id/general-inquiry | name, email, company, phone, product interest, message | legacy corporate form |
| Indonesia | https://ordonesia.com/contact-us/ | full name, company, work email, WhatsApp phone, topic, message, consent | modern custom controls |
| Philippines | https://pasi.ph/contact/ | split name, company, job role, phone, email, request | modern corporate lead form |
| Thailand | https://www.beiersdorf.co.th/meta-pages/contact/contact-form | company, title radios, split name, full address, phone/email/fax, persona radios, select, honeypot | enterprise multilingual legacy form |
| Thailand | https://www.d1asia.co.th/contact-us | split name, email, phone, message, consent | CAPTCHA boundary case; never solve/submit |
| Thailand | https://www.bestsuccess.asia/contact | split name, optional company, email, message | modern simple form |
| Thailand | https://www.kone.co.th/en/about-us/contact-us/ | split name, company, phone prefix, email/address, conditional selects, radios, consent | dense enterprise reactive form |
| Thailand | https://hinsitsu.co.th/en/inquiry-form | combined name, masked phone, email, message, privacy consent | localized validation/consent case |
| Germany | https://www.apis.de/en/contactform | salutation radios, title, split name, email/phone, department, company/full address, country/industry selects, two consents | dense enterprise form; stop before security question |
| Germany | https://www.compronet.de/en/contact | website honeypot, combined name, company, email, phone, project narrative | custom PHP form |
| Netherlands | https://ind.nl/en/service-and-contact/contact-with-ind/e-mail | nested conditional radios, company/KVK, split name, email/phone, nationality and subject selects | government reactive wizard; general fake case only |
| Netherlands | https://unless.com/en/contact-us/ | split name, email, company, message | modern AI product form |
| Netherlands | https://companyinfo.nl/en/contact/ | split name, company, email, phone, subject, question, terms checkbox | modern B2B lead form |
| Netherlands | https://businesscom.eu/contact/ | combined name, email, repeated name/company-like field, question | localized CMS form |
| United Kingdom | https://www.kone.co.uk/about-us/contact-us/ | country select, split name, company, postcode, dynamic phone, email/address, conditional selects/radios | dense enterprise reactive form |
| United Kingdom | https://companiesuk.net/contact-us/ | split name, email, phone, company, subject, message | legacy WordPress form |
| United Kingdom | https://www.systemsinterface.com/contact-us | split name, company, job title, country, email, phone, message, consent | corporate CMS form |
| United Kingdom | https://clevercompanyformations.co.uk/contact-us.html | split name, email, message | Webflow-style form |
| Argentina | https://www.jbit.com.ar/contact/ | split name, email, country-code phone widget, company, service select, message | modern controlled Spanish form |
| Argentina | https://koble.com.ar/contacto | combined name, email, company, phone, subject select, message | React-style consultancy form |
| Argentina | https://exdata.com.ar/contact/ | split name, email, company, subject, message | modern static-app form |
| Argentina | https://www.nextcommerce.com.ar/contact | combined name, email, company, phone, social handle, website, message | mixed identity/web fields |
| Chile | https://www.tca.cl/es_CL/contacto/formulario | name, company, phone, email, embedded challenge | iframe/legacy form; never solve/submit |
| Chile | https://herrajes.cl/contacto | combined name, email, phone, company, country/city, comments | Bootstrap validation form |
| Chile | https://sectrade.cl/contacto/ | combined name, email, phone, company, message | Divi/WordPress-style form |
| Chile | https://www.yara.cl/contacto/ | split name, email, masked mobile, company/industry | enterprise localized form |
| Chile | https://formapro.cl/contacto/ | combined name, phone, email/message | small-business CMS form |
| Colombia | https://www.sscolombia.co/contacto | split name, corporate email, company, phone, enquiry fields | corporate Wix-style form |
| Colombia | https://soplascol.com/contacto/ | combined name, company/project detail, phone/email, message | localized manufacturer inquiry |
| Portugal | https://www.myformula.pt/index.php?route=information%2Fcontact | name, email, enquiry | OpenCart contact form |
| Denmark | https://www.danmil.com/en/contact-us | split name, company, city/postcode/country, phone/email, request, team select, consent | enterprise WordPress-style form |
| Denmark | https://www.dearfuture.dk/en/contact | name, work email, phone, interest select, project message | modern agency form |
| Finland | https://findapro.fi/contact-page/ | combined name, company, email, phone, inquiry select, subject, message | WordPress form builder |
| Finland | https://processgenius.eu/company/contact-us/ | business email, split name, company, message, processing consent | HubSpot-style embedded form |
| Finland | https://www.zef.fi/en/contact/ | split name, email, phone, company, multi-select interests, org-size and role controls, message/marketing choice | complex SaaS form builder |
| Norway | https://weform.agency/hello | duplicate website fields, split name, business, email, phone, message | Webflow-style form |
| Norway | https://xperconsulting.no/skjema/kontakt-oss | split name, email, phone, company, website, message | localized CRM form |
| Norway | https://www.samtext.com/contact-us/ | company, combined name, email, phone, subject, message, file input | WordPress file-form; never upload/submit |
| Norway | https://www.noria.no/contact | split name, email, enquiry select, message | HubSpot-style controlled form |
| Turkey | https://www.euromis.com/contact | split name, email, country, telephone, message | traditional multilingual manufacturer form |
| Saudi Arabia | https://www.kone.sa/en/about-us/contact-us/ | split name, company, international phone, email/address, conditional selects/radios | dense enterprise reactive form |
| Saudi Arabia | https://gns.com.sa/contact-us | split name, email, organization, inquiry select, message | Webflow-style form |
| Saudi Arabia | https://rekazsa.com.sa/contact-us/ | split name, phone, email, business, requirement message | WooCommerce/WordPress form |
| Vietnam | https://temas.vn/en/contact-us | multiple adjacent forms, split name, email, phone, company, website, industry/selects, messages | repeated-field extraction stress case |
| Vietnam | https://www.tda.company/en/contact | visually split full name, email, phone, company, message | modern corporate form |
| Vietnam | https://businesspartner.vn/contact/ | split name, business email, phone, company, country, website, five selects, long message | complex market-entry intake |
| Taiwan | https://www.helistar.com.tw/contact | company, prefix select, split name, email, phone, postcode/address, product select, inquiry radios, consent | dense localized B2B form |

## Safety filter

- Exclude any page requiring login, payment, medical/legal/financial data, OTP, CAPTCHA completion, or final external action.
- Stop before every final submit, confirm, send, create-account, reservation, quote, application, or purchase control.
- If page auto-sends on input/blur, record and discard before entering profile data.
