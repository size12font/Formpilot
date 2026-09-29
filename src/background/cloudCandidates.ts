import { flattenProfile } from "../shared/profile";
import { safetyDecision } from "../shared/safety";
import { MAX_MATCH_CANDIDATES, sanitizeFieldText, type CloudField } from "../shared/cloudProtocol";
import type { FieldDescriptor, Profile } from "../shared/types";

export interface LocalCloudCandidate { id: string; role: string; profileKey: string }

export function cloudProfileCandidates(profile: Profile): LocalCloudCandidate[] {
  const fixed: Record<string, string> = {
    "identity.givenName": "given name", "identity.familyName": "family name",
    "identity.middleName": "middle name", "identity.dateOfBirth": "date of birth",
    "work.company": "company name", "work.jobTitle": "job title", "work.website": "website"
  };
  const roles = new Map(Object.entries(fixed));
  const role = (label: string, allowed: string[]) => {
    const normalized = label.trim().toLowerCase();
    return allowed.includes(normalized) ? normalized : null;
  };
  profile.contact.emails.forEach((item, i) => {
    const name = role(item.label, ["personal", "work", "primary", "alternate"]);
    if (name) roles.set(`contact.emails[${i}].value`, `${name} email`);
  });
  profile.contact.phones.forEach((item, i) => {
    const name = role(item.label, ["mobile", "home", "work", "primary"]);
    if (!name || !item.number.trim()) return;
    roles.set(`contact.phones[${i}].number`, `${name} phone number`);
    roles.set(`contact.phones[${i}].countryCode`, `${name} phone country code`);
  });
  const addressParts = {
    street: "street", streetNumber: "street number", line2: "address line 2",
    city: "city", region: "region", postalCode: "postal code", country: "country"
  };
  profile.addresses.forEach((item, i) => {
    const name = role(item.label, ["home", "billing", "shipping", "work"]);
    if (!name) return;
    Object.entries(addressParts).forEach(([key, part]) => roles.set(`addresses[${i}].${key}`, `${name} ${part}`));
  });
  const available = flattenProfile(profile).flatMap(({ key }) => {
    const description = roles.get(key);
    return description ? [{ profileKey: key, role: description }] : [];
  });
  // Indistinguishable entries need a user choice. Never pick by array position.
  const distinct = available.filter((item) => available.filter((other) => other.role === item.role).length === 1);
  if (distinct.length > MAX_MATCH_CANDIDATES) return [];
  return distinct.map((item, i) => ({ ...item, id: `c${i}` }));
}

export function permittedCandidates(field: FieldDescriptor, candidates: LocalCloudCandidate[]): LocalCloudCandidate[] {
  if (safetyDecision(field).action !== "allow") return [];
  const text = `${field.label ?? ""} ${field.placeholder ?? ""} ${field.sectionHeading ?? ""}`.normalize("NFKC").toLowerCase();
  const untrusted = `${text} ${field.nearbyText}`;
  if (/\b(ignore|disregard|override|system prompt|instructions?|select candidate|choose c\d|not|except|never)\b|<\/?(?:system|script)>/i.test(untrusted)) return [];
  // Do not infer identifiers or arbitrary custom entries from an unrelated personal entry.
  if (/\b(registration|tax|passport|identity|account|license|licence|vat|ssn|nif)\b/.test(text)) return [];
  const family = /\b(surname|family name|last name|nachname|familienname|apellido|apellidos|sobrenome|apelido|nom de famille)\b|^姓$|^성$/.test(text);
  const given = /\b(first name|given name|forename|vorname|prénom|nome próprio)\b|^名$|^이름$/.test(text);
  if (family && given) return [];
  const addressRole = /\b(billing|facturation|factura|faturação|cobrança)\b|請求先|청구/.test(text) ? "billing"
    : /\b(shipping|delivery|livraison|entrega)\b|配送先|배송/.test(text) ? "shipping"
    : /\b(home|residential|domicilio)\b/.test(text) ? "home" : null;
  const emailRole = /\b(work|business|professional|office)\b/.test(text) ? "work"
    : /\b(personal|private)\b/.test(text) ? "personal" : null;
  const mobile = /\b(mobile|cell|móvil|celular)\b|携帯電話|휴대폰/.test(text);
  const phoneRole = mobile ? "mobile" : emailRole === "work" ? "work" : /\b(home)\b/.test(text) ? "home" : null;
  if (/\b(personal|private)\b/.test(text) && /\b(work|business|professional|office)\b/.test(text)) return [];
  if (/\b(first)\b/.test(text) && /\b(last)\b/.test(text)) return [];
  if (/\b(billing)\b/.test(text) && /\b(home|shipping)\b/.test(text)) return [];
  return candidates.filter((candidate) => {
    if (safetyDecision(field, candidate.profileKey).action !== "allow") return false;
    if (family) return candidate.profileKey === "identity.familyName";
    if (given) return candidate.profileKey === "identity.givenName";
    if (candidate.profileKey.startsWith("addresses[") && addressRole && !candidate.role.startsWith(`${addressRole} `)) return false;
    if (candidate.profileKey.startsWith("contact.emails[") && emailRole && !candidate.role.startsWith(`${emailRole} `)) return false;
    if (candidate.profileKey.startsWith("contact.phones[") && phoneRole && !candidate.role.startsWith(`${phoneRole} `)) return false;
    // Basic kinds are enforced in code, even if a provider returns a valid but unrelated ID.
    if (/\b(email|e-mail|courriel|correo)\b/.test(text)) return candidate.profileKey.startsWith("contact.emails[");
    if (/\b(phone|telephone|mobile|cell|telefon|téléphone|telefone|móvil|celular)\b|電話|휴대폰/.test(text)) return candidate.profileKey.startsWith("contact.phones[");
    if (/\b(zip|zipcode|postcode|postal|plz)\b|郵便番号|우편번호/.test(text)) return candidate.profileKey.endsWith(".postalCode");
    if (/\b(city|town|locality|stadt)\b/.test(text)) return candidate.profileKey.endsWith(".city");
    if (/\b(country|pays|país|land)\b/.test(text)) return candidate.profileKey.endsWith(".country");
    if (/\b(street|strasse|straße)\b/.test(text)) return /\.(street|streetNumber)$/.test(candidate.profileKey);
    if (/\b(address|adresse|domicilio|morada)\b|住所|주소/.test(text)) return candidate.profileKey.startsWith("addresses[");
    if (/\b(company|organization|organisation|employer)\b/.test(text)) return candidate.profileKey === "work.company";
    return true;
  });
}

export function cloudField(field: FieldDescriptor, id: string, candidates: LocalCloudCandidate[], privateValues: string[]): CloudField | null {
  const eligible = permittedCandidates(field, candidates);
  if (!eligible.length) return null;
  const clean = (value: string | null | undefined) => sanitizeFieldText(value, privateValues);
  const label = clean(field.label);
  const placeholder = clean(field.placeholder);
  // A section alone cannot say which information this individual field requests.
  if (!label && !placeholder) return null;
  const control = field.options ? "select" : ["number", "tel", "email", "date"].includes(field.type ?? "")
    ? field.type as "number" | "tel" | "email" | "date" : "text";
  return {
    id, label, placeholder, section: clean(field.sectionHeading), control,
    ...(field.maxLength && field.maxLength > 0 && field.maxLength <= 1000 ? { maxLength: field.maxLength } : {}),
    candidates: eligible.map(({ id: candidateId, role }) => ({ id: candidateId, role }))
  };
}
